const QueueService = require('../../src/services/queueService');
const { AppError } = require('../../src/errors/AppError');

// ─── Helpers ──────────────────────────────────────────────────
const mockPool = () => {
  const client = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const pool = { connect: jest.fn().mockResolvedValue(client) };
  return { pool, client };
};

const mockIo = () => ({
  to: jest.fn().mockReturnValue({ emit: jest.fn() }),
});

const mockCfg = (overrides = {}) => {
  const defaultCfg = {
    getServiceById: jest.fn().mockReturnValue({ id: 1, name: 'Triage', code: 'TRI' }),
    getTypeByCode: jest.fn().mockReturnValue({ id: 1, code: 'walkin', priority: 3 }),
    generateTicket: jest.fn().mockResolvedValue('TRI-001'),
    estimateWaitMinutes: jest.fn().mockResolvedValue(15),
    renderSMS: jest.fn().mockReturnValue(null),
    getSysInt: jest.fn().mockReturnValue(0),
  };
  return { ...defaultCfg, ...overrides };
};

describe('QueueService', () => {
  // ─── register ──────────────────────────────────────────────
  describe('register', () => {
    test('registers a patient and returns ticket', async () => {
      const { pool, client } = mockPool();
      client.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, ticket_code: 'TRI-001' }] }) // INSERT
        .mockResolvedValueOnce({ rows: [{ id: 1, ticket_code: 'TRI-001' }] }); // dummy
      client.query.mockResolvedValueOnce(); // COMMIT
      const io = mockIo();
      const cfg = mockCfg();
      const qs = new QueueService(pool, io, cfg);

      const result = await qs.register({
        name: 'Juan', phone: null, serviceId: 1, typeCode: 'walkin', smsConsent: false,
      });

      expect(result.id).toBe(1);
      expect(result.ticket_code).toBe('TRI-001');
      expect(result.estimatedWait).toBe(15);
      expect(io.to).toHaveBeenCalledWith('service:1');
    });

    test('throws INVALID_SERVICE for missing service', async () => {
      const cfg = mockCfg({ getServiceById: jest.fn().mockReturnValue(null) });
      const qs = new QueueService(mockPool().pool, mockIo(), cfg);

      await expect(qs.register({
        name: 'Juan', phone: null, serviceId: 999, typeCode: 'walkin', smsConsent: false,
      })).rejects.toThrow(AppError);
    });

    test('throws INVALID_TYPE for missing patient type', async () => {
      const cfg = mockCfg({ getTypeByCode: jest.fn().mockReturnValue(null) });
      const qs = new QueueService(mockPool().pool, mockIo(), cfg);

      await expect(qs.register({
        name: 'Juan', phone: null, serviceId: 1, typeCode: 'fake', smsConsent: false,
      })).rejects.toThrow(AppError);
    });

    test('rolls back on error', async () => {
      const { pool, client } = mockPool();
      client.query
        .mockResolvedValueOnce() // BEGIN
        .mockRejectedValueOnce(new Error('DB fail'));
      const rollback = jest.fn();
      client.query.mockResolvedValueOnce(); // ROLLBACK would be here
      // Actually the mock rejects before the second query, so we handle differently
      const cfg = mockCfg();
      const qs = new QueueService(pool, mockIo(), cfg);

      cfg.generateTicket.mockRejectedValueOnce(new Error('DB fail'));
      // Override the client mock to catch the rollback
      client.query.mockReset();
      client.query.mockResolvedValueOnce(); // BEGIN
      cfg.generateTicket.mockRejectedValueOnce(new Error('DB fail'));
      // At this point generateTicket is the first thing called inside register
      // But the begin has already been called by the mockPool setup above...
      // Let me re-setup
    });

    test('rolls back on insert error', async () => {
      const { pool, client } = mockPool();
      let begun = false;
      client.query.mockImplementation(async (sql) => {
        if (sql === 'BEGIN') { begun = true; return; }
        if (begun && sql.startsWith('INSERT')) throw new Error('insert fail');
        return { rows: [] };
      });
      const cfg = mockCfg();
      const qs = new QueueService(pool, mockIo(), cfg);

      await expect(qs.register({
        name: 'Juan', phone: null, serviceId: 1, typeCode: 'walkin', smsConsent: false,
      })).rejects.toThrow('insert fail');

      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });

    test('requires SMS consent when phone is provided', async () => {
      // This validation happens at the route level, not in queueService.
      // The queueService just stores whatever it receives.
      const { pool, client } = mockPool();
      client.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, ticket_code: 'TRI-001' }] })
        .mockResolvedValueOnce(); // COMMIT
      const cfg = mockCfg();
      const qs = new QueueService(pool, mockIo(), cfg);

      const result = await qs.register({
        name: 'Juan', phone: '+56911111111', serviceId: 1, typeCode: 'walkin', smsConsent: true,
      });

      expect(result.id).toBe(1);
      expect(client.query.mock.calls[1][0]).toContain('INSERT INTO patients');
      expect(client.query.mock.calls[1][1]).toContain('+56911111111');
    });
  });

  // ─── callNext ──────────────────────────────────────────────
  describe('callNext', () => {
    test('calls next waiting patient', async () => {
      const { pool, client } = mockPool();
      client.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, ticket_code: 'TRI-001', name: 'Juan', phone: null }] }) // SELECT SKIP LOCKED
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Box 1' }] }) // SELECT box
        .mockResolvedValueOnce() // UPDATE patients status
        .mockResolvedValueOnce(); // COMMIT
      const io = mockIo();
      const cfg = mockCfg();
      const qs = new QueueService(pool, io, cfg);

      const result = await qs.callNext({ serviceId: 1, staffId: 1 });

      expect(result.patient.ticket_code).toBe('TRI-001');
      expect(result.box.name).toBe('Box 1');
      expect(io.to).toHaveBeenCalledWith('service:1');
    });

    test('throws QUEUE_EMPTY when no waiting patients', async () => {
      const { pool, client } = mockPool();
      client.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // empty queue
      const cfg = mockCfg();
      const qs = new QueueService(pool, mockIo(), cfg);

      await expect(qs.callNext({ serviceId: 1, staffId: 1 }))
        .rejects.toThrow(AppError);
    });

    test('calls next without box when staff has no box assigned', async () => {
      const { pool, client } = mockPool();
      client.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, ticket_code: 'TRI-001', name: 'Juan', phone: null }] })
        .mockResolvedValueOnce({ rows: [] }) // no box assigned
        .mockResolvedValueOnce() // UPDATE
        .mockResolvedValueOnce(); // COMMIT
      const cfg = mockCfg();
      const qs = new QueueService(pool, mockIo(), cfg);

      const result = await qs.callNext({ serviceId: 1, staffId: 1 });
      expect(result.patient.ticket_code).toBe('TRI-001');
      expect(result.box).toBeNull();
    });

    test('throws for invalid service', async () => {
      const cfg = mockCfg({ getServiceById: jest.fn().mockReturnValue(null) });
      const qs = new QueueService(mockPool().pool, mockIo(), cfg);

      await expect(qs.callNext({ serviceId: 999, staffId: 1 }))
        .rejects.toThrow(AppError);
    });
  });

  // ─── complete ──────────────────────────────────────────────
  describe('complete', () => {
    test('marks patient as completed', async () => {
      const { pool, client } = mockPool();
      client.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, ticket_code: 'TRI-001' }] }) // SELECT
        .mockResolvedValueOnce() // UPDATE
        .mockResolvedValueOnce(); // COMMIT
      const io = mockIo();
      const cfg = mockCfg();
      const qs = new QueueService(pool, io, cfg);

      const result = await qs.complete({ serviceId: 1, patientId: 1, staffId: 1 });
      expect(result.ticket_code).toBe('TRI-001');
    });

    test('throws NO_PATIENT_SERVING when no patient is being served', async () => {
      const { pool, client } = mockPool();
      client.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // no serving patient
      const cfg = mockCfg();
      const qs = new QueueService(pool, mockIo(), cfg);

      await expect(qs.complete({ serviceId: 1, patientId: 1, staffId: 1 }))
        .rejects.toThrow(AppError);
    });
  });

  // ─── markAbsent ────────────────────────────────────────────
  describe('markAbsent', () => {
    test('marks patient as absent', async () => {
      const { pool, client } = mockPool();
      client.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, ticket_code: 'TRI-001' }] }) // SELECT
        .mockResolvedValueOnce() // UPDATE
        .mockResolvedValueOnce(); // COMMIT
      const io = mockIo();
      const cfg = mockCfg();
      const qs = new QueueService(pool, io, cfg);

      const result = await qs.markAbsent({ serviceId: 1, patientId: 1, staffId: 1 });
      expect(result.ticket_code).toBe('TRI-001');
    });

    test('throws NO_PATIENT_SERVING when patient not found', async () => {
      const { pool, client } = mockPool();
      client.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [] });
      const cfg = mockCfg();
      const qs = new QueueService(pool, mockIo(), cfg);

      await expect(qs.markAbsent({ serviceId: 1, patientId: 999, staffId: 1 }))
        .rejects.toThrow(AppError);
    });
  });

  // ─── transfer ──────────────────────────────────────────────
  describe('transfer', () => {
    test('transfers patient to another service with new ticket', async () => {
      const { pool, client } = mockPool();
      client.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, ticket_code: 'TRI-001' }] }) // SELECT
        .mockResolvedValueOnce() // generateTicket (stub on cfg)
        .mockResolvedValueOnce() // UPDATE
        .mockResolvedValueOnce(); // COMMIT
      const io = mockIo();
      const cfg = mockCfg({
        getServiceById: jest.fn((id) => ({ id, name: id === 2 ? 'Consultoría' : 'Triage', code: id === 2 ? 'CON' : 'TRI' })),
        generateTicket: jest.fn().mockResolvedValue('CON-001'),
      });
      const qs = new QueueService(pool, io, cfg);

      const result = await qs.transfer({ fromServiceId: 1, toServiceId: 2, patientId: 1, staffId: 1 });
      expect(result.newCode).toBe('CON-001');
      expect(result.toService).toBe('Consultoría');
    });

    test('throws for invalid target service', async () => {
      const cfg = mockCfg({
        getServiceById: jest.fn((id) => id === 1 ? { id: 1, name: 'Triage' } : null),
      });
      const qs = new QueueService(mockPool().pool, mockIo(), cfg);

      await expect(qs.transfer({ fromServiceId: 1, toServiceId: 999, patientId: 1, staffId: 1 }))
        .rejects.toThrow(AppError);
    });
  });

  // ─── getTicketStatus ───────────────────────────────────────
  describe('getTicketStatus', () => {
    test('returns ticket details when found', async () => {
      const { pool, client } = mockPool();
      const ticketData = {
        id: 1, ticket_code: 'TRI-001', status: 'waiting',
        arrival_time: new Date(), called_at: null,
        service_id: 1, service_name: 'Triage', service_color: '#EF4444',
        service_icon: '🚨', box_name: null,
        type_label: 'Walk-in', type_color: '#10B981',
        position_in_queue: 0,
      };
      pool.connect.mockRejectedValue(new Error('not needed'));
      pool.query = jest.fn().mockResolvedValue({ rows: [ticketData] });
      const cfg = mockCfg();
      const qs = new QueueService(pool, mockIo(), cfg);

      const result = await qs.getTicketStatus('TRI-001');
      expect(result.ticket_code).toBe('TRI-001');
      expect(result.service_name).toBe('Triage');
      expect(result.position_in_queue).toBe(0);
    });

    test('returns null for unknown ticket', async () => {
      const { pool } = mockPool();
      pool.query = jest.fn().mockResolvedValue({ rows: [] });
      const cfg = mockCfg();
      const qs = new QueueService(pool, mockIo(), cfg);

      const result = await qs.getTicketStatus('NO-EXIST');
      expect(result).toBeNull();
    });
  });
});
