// tests/integration/queue.test.js
// Tests contra BD real con supertest — sin mocks de pg
require('dotenv').config();
const request = require('supertest');
const { Pool } = require('pg');
const app     = require('../../server');
const { initConfig } = require('../../server');
const bcrypt  = require('bcryptjs');

const DB_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://mediqueue_user:mediqueue_pass@localhost:5433/mediqueue_test';

const testPool = new Pool({ connectionString: DB_URL });

// ─── Setup / Teardown ──────────────────────────────────────────
beforeAll(async () => {
  const fs   = require('fs');
  const path = require('path');
  const sql  = fs.readFileSync(path.join(__dirname, '../../migrations/001_init.sql'), 'utf8');
  await testPool.query(sql).catch(() => {});
  await initConfig(testPool);
}, 30000);

beforeEach(async () => {
  await testPool.query(`
    TRUNCATE patients, ticket_sequences RESTART IDENTITY CASCADE
  `);
});

afterAll(async () => {
  await testPool.end();
});

// ─── Helpers ──────────────────────────────────────────────────
const loginAs = async (username = 'admin', password = 'Admin1234!') => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password });
  return res.body.token;
};

const register = async (overrides = {}) =>
  request(app).post('/api/patients').send({
    name: 'Paciente Test', serviceId: 1, type: 'walkin', ...overrides,
  });

// ─── Config pública ────────────────────────────────────────────
describe('GET /api/config/public', () => {
  test('retorna servicios y tipos de paciente', async () => {
    const res = await request(app).get('/api/config/public');
    expect(res.status).toBe(200);
    expect(res.body.services).toBeInstanceOf(Array);
    expect(res.body.patientTypes).toBeInstanceOf(Array);
    expect(res.body.services.length).toBeGreaterThan(0);
    expect(res.body.hospitalName).toBeTruthy();
  });
});

// ─── Healthcheck ───────────────────────────────────────────────
describe('GET /health', () => {
  test('retorna OK cuando BD está disponible', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body.checks.db).toBe('ok');
  });
});

// ─── Autenticación ─────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  test('login exitoso devuelve token y usuario', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin1234!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe('admin');
    expect(res.body.user.role).toBe('admin');
  });

  test('credenciales inválidas devuelven 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  test('usuario inexistente devuelve 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'noexiste', password: 'test' });
    expect(res.status).toBe(401);
  });

  test('sin credenciales devuelve 400', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

// ─── Registro de pacientes ─────────────────────────────────────
describe('POST /api/patients', () => {
  test('registra paciente walkin correctamente', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.patient.ticketCode).toMatch(/^TRI-\d{3}$/);
    expect(res.body.patient.service).toBe('Triage');
  });

  test('tickets son correlativos por servicio', async () => {
    const r1 = await register({ serviceId: 1 });
    const r2 = await register({ serviceId: 1 });
    const r3 = await register({ serviceId: 1 });
    expect(r1.body.patient.ticketCode).toBe('TRI-001');
    expect(r2.body.patient.ticketCode).toBe('TRI-002');
    expect(r3.body.patient.ticketCode).toBe('TRI-003');
  });

  test('servicios distintos tienen sus propios correlativos', async () => {
    const r1 = await register({ serviceId: 1 }); // Triage
    const r2 = await register({ serviceId: 5 }); // Farmacia
    expect(r1.body.patient.ticketCode).toBe('TRI-001');
    expect(r2.body.patient.ticketCode).toBe('FAR-001');
  });

  test('nombre muy corto devuelve 400', async () => {
    const res = await register({ name: 'Jo' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('servicio inválido devuelve 404', async () => {
    const res = await register({ serviceId: 9999 });
    expect(res.status).toBe(404);
  });

  test('tipo inválido devuelve 400', async () => {
    const res = await register({ type: 'invalid_type' });
    expect(res.status).toBe(400);
  });

  test('teléfono sin consentimiento devuelve 400', async () => {
    const res = await register({ phone: '+56911111111', smsConsent: false });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SMS_CONSENT_REQUIRED');
  });

  test('con teléfono y consentimiento guarda phone en BD', async () => {
    const res = await register({ phone: '+56911111111', smsConsent: true });
    expect(res.status).toBe(201);
    const { rows } = await testPool.query(
      'SELECT phone FROM patients WHERE ticket_code=$1',
      [res.body.patient.ticketCode]
    );
    expect(rows[0].phone).toBe('+56911111111');
  });

  test('paciente queda en estado waiting en BD', async () => {
    const res = await register();
    const { rows } = await testPool.query(
      'SELECT status FROM patients WHERE ticket_code=$1',
      [res.body.patient.ticketCode]
    );
    expect(rows[0].status).toBe('waiting');
  });

  test('prioridad emergency es 1', async () => {
    const res = await register({ type: 'emergency' });
    const { rows } = await testPool.query(
      'SELECT priority FROM patients WHERE ticket_code=$1',
      [res.body.patient.ticketCode]
    );
    expect(rows[0].priority).toBe(1);
  });
});

// ─── Cola por servicio ─────────────────────────────────────────
describe('GET /api/services/:id/queue', () => {
  test('devuelve la cola del servicio', async () => {
    await register({ serviceId: 1 });
    await register({ serviceId: 1 });
    const token = await loginAs();
    const res = await request(app)
      .get('/api/services/1/queue')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.queue).toBeInstanceOf(Array);
    expect(res.body.queue.length).toBe(2);
  });

  test('requiere autenticación', async () => {
    const res = await request(app).get('/api/services/1/queue');
    expect(res.status).toBe(401);
  });

  test('servicio inexistente devuelve 404', async () => {
    const token = await loginAs();
    const res = await request(app)
      .get('/api/services/9999/queue')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ─── Llamar siguiente ──────────────────────────────────────────
describe('POST /api/services/:id/call-next', () => {
  test('llama al siguiente paciente y cambia status a serving', async () => {
    await register({ serviceId: 1 });
    const token = await loginAs();
    const res = await request(app)
      .post('/api/services/1/call-next')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.patient.ticket_code).toBe('TRI-001');

    const { rows } = await testPool.query(
      "SELECT status FROM patients WHERE ticket_code='TRI-001'"
    );
    expect(rows[0].status).toBe('serving');
  });

  test('cola vacía devuelve 404', async () => {
    const token = await loginAs();
    const res = await request(app)
      .post('/api/services/1/call-next')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('QUEUE_EMPTY');
  });

  test('prioridad: emergency se llama antes que walkin', async () => {
    await register({ type: 'walkin' });
    await register({ type: 'emergency' });
    const token = await loginAs();
    const res = await request(app)
      .post('/api/services/1/call-next')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // El emergency fue registrado segundo pero se llama primero
    const { rows } = await testPool.query(
      "SELECT ticket_code FROM patients WHERE status='serving'"
    );
    expect(rows[0].ticket_code).toBe('TRI-002'); // el segundo registrado (emergency)
  });

  test('requiere autenticación', async () => {
    const res = await request(app).post('/api/services/1/call-next');
    expect(res.status).toBe(401);
  });
});

// ─── Completar atención ────────────────────────────────────────
describe('POST /api/services/:id/complete/:patientId', () => {
  test('completa atención y registra completion_time', async () => {
    await register({ serviceId: 1 });
    const token = await loginAs();

    const callRes = await request(app)
      .post('/api/services/1/call-next')
      .set('Authorization', `Bearer ${token}`);
    const patientId = callRes.body.patient.id;

    const res = await request(app)
      .post(`/api/services/1/complete/${patientId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const { rows } = await testPool.query(
      'SELECT status, completion_time FROM patients WHERE id=$1', [patientId]
    );
    expect(rows[0].status).toBe('completed');
    expect(rows[0].completion_time).not.toBeNull();
  });
});

// ─── Marcar ausente ────────────────────────────────────────────
describe('POST /api/services/:id/absent/:patientId', () => {
  test('marca paciente como ausente', async () => {
    await register({ serviceId: 1 });
    const token = await loginAs();

    const callRes = await request(app)
      .post('/api/services/1/call-next')
      .set('Authorization', `Bearer ${token}`);
    const patientId = callRes.body.patient.id;

    const res = await request(app)
      .post(`/api/services/1/absent/${patientId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const { rows } = await testPool.query(
      'SELECT status FROM patients WHERE id=$1', [patientId]
    );
    expect(rows[0].status).toBe('absent');
  });
});

// ─── Ticket de seguimiento público ────────────────────────────
describe('GET /api/tickets/:code', () => {
  test('retorna estado del ticket', async () => {
    const reg = await register();
    const code = reg.body.patient.ticketCode;

    const res = await request(app).get(`/api/tickets/${code}`);
    expect(res.status).toBe(200);
    expect(res.body.ticketCode).toBe(code);
    expect(res.body.status).toBe('waiting');
    expect(res.body.serviceName).toBeTruthy();
  });

  test('ticket inexistente devuelve 404', async () => {
    const res = await request(app).get('/api/tickets/NOEXISTE-999');
    expect(res.status).toBe(404);
  });
});

// ─── Analytics ─────────────────────────────────────────────────
describe('GET /api/analytics/daily', () => {
  test('devuelve datos del día por servicio', async () => {
    await register({ serviceId: 1 });
    await register({ serviceId: 5 });
    const token = await loginAs();

    const res = await request(app)
      .get('/api/analytics/daily')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('service');
    expect(res.body[0]).toHaveProperty('total');
  });
});

// ─── CONCURRENCIA — SKIP LOCKED ───────────────────────────────
describe('Concurrencia — SKIP LOCKED', () => {
  test('10 llamadas simultáneas → solo 1 paciente obtenido', async () => {
    await register({ serviceId: 1 });
    const token = await loginAs();

    const results = await Promise.all(
      Array(10).fill(null).map(() =>
        request(app)
          .post('/api/services/1/call-next')
          .set('Authorization', `Bearer ${token}`)
      )
    );

    const ok  = results.filter(r => r.status === 200);
    const err = results.filter(r => r.status !== 200);

    expect(ok).toHaveLength(1);
    expect(err).toHaveLength(9);

    const { rows } = await testPool.query(
      "SELECT COUNT(*) FROM patients WHERE status='serving'"
    );
    expect(parseInt(rows[0].count)).toBe(1);
  }, 15000);

  test('50 registros → tickets únicos sin huecos', async () => {
    for (let i = 0; i < 50; i++) {
      await register({ name: `Paciente ${i + 1}`, serviceId: 1 });
    }

    const { rows } = await testPool.query(
      "SELECT ticket_code FROM patients ORDER BY ticket_code"
    );
    const codes = rows.map(r => r.ticket_code);
    expect(new Set(codes).size).toBe(50);

    const seqs = codes.map(c => parseInt(c.split('-')[1])).sort((a, b) => a - b);
    seqs.forEach((seq, i) => expect(seq).toBe(i + 1));
  }, 20000);
});

// ─── ARCO Compliance ───────────────────────────────────────────
describe('Compliance ARCO', () => {
  beforeEach(async () => {
    await testPool.query(`
      INSERT INTO patients (ticket_code, name, phone, service_id, patient_type_id, priority, status)
      SELECT 'T-TEST', 'Juan García', '+56911111111', 1, 1, 3, 'completed'
      WHERE NOT EXISTS (SELECT 1 FROM patients WHERE ticket_code='T-TEST')
    `);
  });

  test('GET /my-data retorna registros enmascarados', async () => {
    const res = await request(app)
      .get('/api/compliance/my-data?phone=+56911111111');
    expect(res.status).toBe(200);
    expect(res.body.records).toBeInstanceOf(Array);
  });

  test('DELETE /my-data anonimiza sin eliminar físicamente', async () => {
    await request(app)
      .delete('/api/compliance/my-data')
      .send({ phone: '+56911111111', reason: 'Test' });

    const { rows } = await testPool.query(
      "SELECT name, phone FROM patients WHERE ticket_code='T-TEST'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('ANONIMIZADO');
    expect(rows[0].phone).toBeNull();
  });

  test('GET /export devuelve JSON descargable', async () => {
    const res = await request(app)
      .get('/api/compliance/export?phone=+56911111111');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body.legal_basis).toContain('Ley 21.719');
  });
});

// ─── Transferencia entre servicios ──────────────────────────────
describe('POST /api/patients/:id/transfer', () => {
  test('transfiere paciente de Triage a Farmacia con nuevo ticket', async () => {
    await register({ serviceId: 1 });
    const token = await loginAs();

    const callRes = await request(app)
      .post('/api/services/1/call-next')
      .set('Authorization', `Bearer ${token}`);
    expect(callRes.status).toBe(200);
    const patientId = callRes.body.patient.id;

    const res = await request(app)
      .post(`/api/patients/${patientId}/transfer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fromService: 1, toService: 5 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.newCode).toMatch(/^FAR-\d{3}$/);
    expect(res.body.toService).toBe('Farmacia');

    const { rows } = await testPool.query(
      'SELECT service_id, status, ticket_code FROM patients WHERE id=$1', [patientId]
    );
    expect(rows[0].service_id).toBe(5);
    expect(rows[0].status).toBe('waiting');
    expect(rows[0].ticket_code).toMatch(/^FAR-\d{3}$/);
  });

  test('requiere autenticación para transferir', async () => {
    const res = await request(app)
      .post('/api/patients/1/transfer')
      .send({ fromService: 1, toService: 5 });
    expect(res.status).toBe(401);
  });

  test('servicio destino inválido devuelve error', async () => {
    await register({ serviceId: 1 });
    const token = await loginAs();

    const callRes = await request(app)
      .post('/api/services/1/call-next')
      .set('Authorization', `Bearer ${token}`);
    const patientId = callRes.body.patient.id;

    const res = await request(app)
      .post(`/api/patients/${patientId}/transfer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fromService: 1, toService: 9999 });
    expect(res.status).toBe(404);
  });
});

// ─── Auth Me ─────────────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  test('retorna datos del usuario autenticado', async () => {
    const token = await loginAs('admin', 'Admin1234!');
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin');
    expect(res.body.role).toBe('admin');
    expect(res.body.role_label).toBe('Administrador');
    expect(res.body.id).toBeGreaterThan(0);
  });

  test('requiere autenticación', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('token inválido devuelve 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer token-invalido');
    expect(res.status).toBe(401);
  });
});

// ─── Roles públicos ─────────────────────────────────────────────
describe('GET /api/users/roles/list', () => {
  test('retorna lista de roles activos', async () => {
    const token = await loginAs();
    const res = await request(app)
      .get('/api/users/roles/list')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
    expect(res.body.length).toBeGreaterThan(0);
    const codes = res.body.map(r => r.code);
    expect(codes).toContain('admin');
    expect(codes).toContain('doctor');
    expect(codes).toContain('nurse');
  });
});
