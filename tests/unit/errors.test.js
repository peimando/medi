// tests/unit/errors.test.js — Tests unitarios sin BD
const { AppError, Errors } = require('../../src/errors/AppError');

describe('AppError', () => {
  test('crea error con status y code', () => {
    const e = new AppError('Mensaje', 404, 'NOT_FOUND');
    expect(e.message).toBe('Mensaje');
    expect(e.status).toBe(404);
    expect(e.code).toBe('NOT_FOUND');
    expect(e instanceof Error).toBe(true);
  });

  test('defaults: status 500, code INTERNAL_ERROR', () => {
    const e = new AppError('Error');
    expect(e.status).toBe(500);
    expect(e.code).toBe('INTERNAL_ERROR');
  });
});

describe('Errors catalog', () => {
  test('UNAUTHORIZED devuelve 401', () => {
    const e = Errors.UNAUTHORIZED();
    expect(e.status).toBe(401);
    expect(e.code).toBe('UNAUTHORIZED');
  });

  test('FORBIDDEN devuelve 403', () => {
    const e = Errors.FORBIDDEN();
    expect(e.status).toBe(403);
  });

  test('QUEUE_EMPTY incluye nombre del servicio', () => {
    const e = Errors.QUEUE_EMPTY('Triage');
    expect(e.message).toContain('Triage');
    expect(e.status).toBe(404);
    expect(e.code).toBe('QUEUE_EMPTY');
  });

  test('INVALID_SERVICE incluye el id', () => {
    const e = Errors.INVALID_SERVICE(99);
    expect(e.message).toContain('99');
    expect(e.status).toBe(404);
  });

  test('SMS_CONSENT_REQUIRED devuelve 400', () => {
    const e = Errors.SMS_CONSENT_REQUIRED();
    expect(e.status).toBe(400);
    expect(e.code).toBe('SMS_CONSENT_REQUIRED');
  });
});

// ─── Tests del config loader (sin BD) ─────────────────────────
describe('ConfigLoader — métodos síncronos', () => {
  const cfg = require('../../src/config/loader');

  // Simular cache cargado
  beforeAll(() => {
    cfg._cache = {
      services: [
        { id: 1, name: 'Triage',   code: 'TRI', ticket_prefix: 'TRI', ticket_format: '{PREFIX}-{SEQ:3}', avg_attention_minutes: 10 },
        { id: 5, name: 'Farmacia', code: 'FAR', ticket_prefix: 'FAR', ticket_format: '{PREFIX}-{SEQ:3}', avg_attention_minutes: 10 },
      ],
      patientTypes: [
        { id: 1, code: 'emergency',   priority: 1, label: 'Emergencia' },
        { id: 2, code: 'appointment', priority: 2, label: 'Cita' },
        { id: 3, code: 'walkin',      priority: 3, label: 'Walk-in' },
      ],
      roles: [
        { code: 'admin',  permissions: { all: true } },
        { code: 'doctor', permissions: { call_patients: true, complete_service: true } },
        { code: 'nurse',  permissions: { call_patients: true } },
      ],
      smsTemplates: [
        { code: 'your_turn', body: '¡Tu turno! {ticket} en {box}. {hospital}', active: true },
      ],
      sysConfig: {
        hospital_name:          'Hospital Test',
        hospital_phone:         '+56000000',
        display_refresh_ms:     '2000',
        analytics_cache_ttl:    '30',
        wait_time_history_days: '7',
        absent_requeue_minutes: '5',
      },
    };
  });

  test('getServiceById retorna el servicio correcto', () => {
    expect(cfg.getServiceById(1).name).toBe('Triage');
    expect(cfg.getServiceById(5).name).toBe('Farmacia');
    expect(cfg.getServiceById(999)).toBeUndefined();
  });

  test('getServiceByCode retorna el servicio correcto', () => {
    expect(cfg.getServiceByCode('TRI').id).toBe(1);
    expect(cfg.getServiceByCode('NOEXISTE')).toBeUndefined();
  });

  test('getTypeByCode retorna tipo correcto', () => {
    expect(cfg.getTypeByCode('emergency').priority).toBe(1);
    expect(cfg.getTypeByCode('walkin').priority).toBe(3);
    expect(cfg.getTypeByCode('invalid')).toBeUndefined();
  });

  test('validServiceNames devuelve lista de nombres', () => {
    const names = cfg.validServiceNames();
    expect(names).toContain('Triage');
    expect(names).toContain('Farmacia');
  });

  test('validTypeCodes devuelve lista de códigos', () => {
    const codes = cfg.validTypeCodes();
    expect(codes).toContain('emergency');
    expect(codes).toContain('walkin');
  });

  test('isValidRole verifica roles correctamente', () => {
    expect(cfg.isValidRole('admin')).toBe(true);
    expect(cfg.isValidRole('doctor')).toBe(true);
    expect(cfg.isValidRole('hacker')).toBe(false);
  });

  test('hasPermission admin tiene todos los permisos', () => {
    expect(cfg.hasPermission('admin', 'call_patients')).toBe(true);
    expect(cfg.hasPermission('admin', 'view_analytics')).toBe(true);
    expect(cfg.hasPermission('admin', 'cualquier_cosa')).toBe(true);
  });

  test('hasPermission doctor solo tiene sus permisos', () => {
    expect(cfg.hasPermission('doctor', 'call_patients')).toBe(true);
    expect(cfg.hasPermission('doctor', 'complete_service')).toBe(true);
    expect(cfg.hasPermission('doctor', 'view_analytics')).toBe(false);
  });

  test('hasPermission rol inexistente devuelve false', () => {
    expect(cfg.hasPermission('fantasma', 'call_patients')).toBe(false);
  });

  test('getSys retorna valor de config del sistema', () => {
    expect(cfg.getSys('hospital_name')).toBe('Hospital Test');
    expect(cfg.getSys('no_existe')).toBeUndefined();
  });

  test('getSysInt parsea entero', () => {
    expect(cfg.getSysInt('display_refresh_ms')).toBe(2000);
    expect(cfg.getSysInt('no_existe')).toBe(0);
  });

  test('buildTicketCode genera código con formato correcto', () => {
    const svc = cfg.getServiceById(1);
    expect(cfg.buildTicketCode(svc, 1)).toBe('TRI-001');
    expect(cfg.buildTicketCode(svc, 42)).toBe('TRI-042');
    expect(cfg.buildTicketCode(svc, 999)).toBe('TRI-999');
  });

  test('renderSMS sustituye variables del template', () => {
    const msg = cfg.renderSMS('your_turn', { ticket: 'TRI-001', box: 'Box 1' });
    expect(msg).toContain('TRI-001');
    expect(msg).toContain('Box 1');
    expect(msg).toContain('Hospital Test');
  });

  test('renderSMS con template inexistente devuelve null', () => {
    expect(cfg.renderSMS('template_inexistente')).toBeNull();
  });
});

// ─── Tests del errorHandler middleware ────────────────────────
describe('errorHandler middleware', () => {
  const { errorHandler } = require('../../src/errors/AppError');

  const mockReq  = (traceId = 'test-trace') => ({ traceId });
  const mockRes  = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
  };
  const mockNext = jest.fn();

  test('AppError con status < 500 expone el mensaje', () => {
    const err = new AppError('No encontrado', 404, 'NOT_FOUND');
    const res = mockRes();
    errorHandler(err, mockReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'No encontrado', code: 'NOT_FOUND' })
    );
  });

  test('Error 500 oculta el mensaje real', () => {
    const err = new Error('Error interno sensible');
    err.status = 500;
    const res = mockRes();
    errorHandler(err, mockReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(500);
    const call = res.json.mock.calls[0][0];
    expect(call.error).toBe('Error interno del servidor');
  });

  test('incluye traceId en la respuesta', () => {
    const err = new AppError('Test', 400, 'TEST');
    const res = mockRes();
    errorHandler(err, mockReq('abc-123'), res, mockNext);
    expect(res.json.mock.calls[0][0].traceId).toBe('abc-123');
  });
});
