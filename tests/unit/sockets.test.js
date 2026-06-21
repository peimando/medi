const { registerSocketHandlers } = require('../../src/sockets/asyncSocket');

describe('registerSocketHandlers', () => {
  let io;
  let socket;

  beforeEach(() => {
    jest.resetModules();
    socket = {
      handshake: { auth: {} },
      on: jest.fn(),
      join: jest.fn(),
      emit: jest.fn(),
    };
    io = {
      use: jest.fn(),
      on: jest.fn(),
    };
  });

  test('registers middleware and connection handler', () => {
    registerSocketHandlers(io);
    expect(io.use).toHaveBeenCalledTimes(1);
    expect(io.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  test('middleware passes without token', () => {
    registerSocketHandlers(io);
    const middleware = io.use.mock.calls[0][0];
    const next = jest.fn();
    middleware(socket, next);
    expect(next).toHaveBeenCalled();
    expect(socket.user).toBeNull();
  });

  test('middleware decodes valid JWT', () => {
    const jwt = require('jsonwebtoken');
    process.env.JWT_SECRET = 'a'.repeat(32);
    const token = jwt.sign({ id: 1, role: 'doctor' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    socket.handshake.auth = { token };
    registerSocketHandlers(io);
    const middleware = io.use.mock.calls[0][0];
    const next = jest.fn();
    middleware(socket, next);
    expect(next).toHaveBeenCalled();
    expect(socket.user).toBeTruthy();
    expect(socket.user.id).toBe(1);
    expect(socket.user.role).toBe('doctor');
  });

  test('middleware ignores invalid JWT and continues', () => {
    socket.handshake.auth = { token: 'invalid-token' };
    registerSocketHandlers(io);
    const middleware = io.use.mock.calls[0][0];
    const next = jest.fn();
    middleware(socket, next);
    expect(next).toHaveBeenCalled();
    expect(socket.user).toBeNull();
  });

  describe('connection events', () => {
    beforeEach(() => {
      registerSocketHandlers(io);
      const handler = io.on.mock.calls.find(c => c[0] === 'connection')[1];
      handler(socket);
    });

    test('join_service requires auth', () => {
      const joinHandler = socket.on.mock.calls.find(c => c[0] === 'join_service')[1];
      joinHandler({ serviceId: 1 });
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Autenticación requerida para unirse a sala de servicio' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    test('join_service joins the correct room when authenticated (admin)', () => {
      socket.user = { id: 1, role: 'admin', permissions: { all: true } };
      const joinHandler = socket.on.mock.calls.find(c => c[0] === 'join_service')[1];
      joinHandler({ serviceId: 1 });
      expect(socket.join).toHaveBeenCalledWith('service:1');
    });

    test('join_service with matching service_id', () => {
      socket.user = { id: 2, role: 'doctor', service_id: 5, permissions: {} };
      const joinHandler = socket.on.mock.calls.find(c => c[0] === 'join_service')[1];
      joinHandler({ serviceId: 5 });
      expect(socket.join).toHaveBeenCalledWith('service:5');
    });

    test('join_service rejects wrong service_id', () => {
      socket.user = { id: 2, role: 'doctor', service_id: 3, permissions: {} };
      const joinHandler = socket.on.mock.calls.find(c => c[0] === 'join_service')[1];
      joinHandler({ serviceId: 1 });
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'No tienes permiso para este servicio' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    test('join_manager requires auth', () => {
      const joinHandler = socket.on.mock.calls.find(c => c[0] === 'join_manager')[1];
      joinHandler();
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Autenticación requerida para dashboard gerencial' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    test('join_manager joins the manager dashboard when authenticated', () => {
      socket.user = { id: 1, role: 'manager', permissions: { view_analytics: true } };
      const joinHandler = socket.on.mock.calls.find(c => c[0] === 'join_manager')[1];
      joinHandler();
      expect(socket.join).toHaveBeenCalledWith('manager_dashboard');
    });

    test('join_manager rejects user without view_analytics', () => {
      socket.user = { id: 2, role: 'doctor', permissions: { call_patients: true } };
      const joinHandler = socket.on.mock.calls.find(c => c[0] === 'join_manager')[1];
      joinHandler();
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Sin permiso view_analytics para dashboard gerencial' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    test('join_display joins the display board', () => {
      const joinHandler = socket.on.mock.calls.find(c => c[0] === 'join_display')[1];
      joinHandler();
      expect(socket.join).toHaveBeenCalledWith('display_board');
    });

    test('track_ticket joins patient room with valid accessToken', () => {
      const jwt = require('jsonwebtoken');
      process.env.JWT_SECRET = 'a'.repeat(32);
      const accessToken = jwt.sign({ patientId: 42, type: 'track' }, process.env.JWT_SECRET, { expiresIn: '7d' });
      const joinHandler = socket.on.mock.calls.find(c => c[0] === 'track_ticket')[1];
      joinHandler({ patientId: 42, accessToken });
      expect(socket.join).toHaveBeenCalledWith('patient:42');
    });

    test('track_ticket rejects mismatched patientId', () => {
      const jwt = require('jsonwebtoken');
      process.env.JWT_SECRET = 'a'.repeat(32);
      const accessToken = jwt.sign({ patientId: 99, type: 'track' }, process.env.JWT_SECRET, { expiresIn: '7d' });
      const joinHandler = socket.on.mock.calls.find(c => c[0] === 'track_ticket')[1];
      joinHandler({ patientId: 42, accessToken });
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Token de acceso inválido para este ticket' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    test('track_ticket with no patientId does not join', () => {
      const joinHandler = socket.on.mock.calls.find(c => c[0] === 'track_ticket')[1];
      joinHandler({ patientId: null, accessToken: 'some-token' });
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Se requieren patientId y accessToken' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    test('track_ticket with no accessToken does not join', () => {
      const joinHandler = socket.on.mock.calls.find(c => c[0] === 'track_ticket')[1];
      joinHandler({ patientId: 42 });
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Se requieren patientId y accessToken' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    test('track_ticket rejects invalid token', () => {
      const joinHandler = socket.on.mock.calls.find(c => c[0] === 'track_ticket')[1];
      joinHandler({ patientId: 42, accessToken: 'invalid-token' });
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Token de acceso inválido o expirado' });
      expect(socket.join).not.toHaveBeenCalled();
    });
  });
});
