const jwt = require('jsonwebtoken');
const cfg = require('../config/loader');

function registerSocketHandlers(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      socket.user = null;
      return next();
    }
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      socket.user = null;
    }
    next();
  });

  io.on('connection', (socket) => {
    socket.on('join_service', ({ serviceId }) => {
      if (!socket.user) {
        return socket.emit('error', { message: 'Autenticación requerida para unirse a sala de servicio' });
      }
      const hasAll = socket.user.permissions?.all;
      const assigned = socket.user.service_id;
      if (!hasAll && parseInt(serviceId) !== parseInt(assigned)) {
        return socket.emit('error', { message: 'No tienes permiso para este servicio' });
      }
      socket.join(`service:${serviceId}`);
    });

    socket.on('join_manager', () => {
      if (!socket.user) {
        return socket.emit('error', { message: 'Autenticación requerida para dashboard gerencial' });
      }
      if (!socket.user.permissions?.all && !socket.user.permissions?.view_analytics) {
        return socket.emit('error', { message: 'Sin permiso view_analytics para dashboard gerencial' });
      }
      socket.join('manager_dashboard');
    });

    socket.on('join_display', () => {
      socket.join('display_board');
    });

    socket.on('track_ticket', ({ patientId, accessToken }) => {
      if (!patientId || !accessToken) {
        return socket.emit('error', { message: 'Se requieren patientId y accessToken' });
      }
      try {
        const payload = jwt.verify(accessToken, process.env.JWT_SECRET);
        if (payload.type !== 'track' || parseInt(payload.patientId) !== parseInt(patientId)) {
          return socket.emit('error', { message: 'Token de acceso inválido para este ticket' });
        }
        socket.join(`patient:${patientId}`);
      } catch {
        return socket.emit('error', { message: 'Token de acceso inválido o expirado' });
      }
    });

    socket.on('disconnect', () => {
      const rooms = [...socket.rooms].filter(r => r !== socket.id);
      rooms.forEach(r => socket.leave(r));
      socket.removeAllListeners();
    });
  });
}

module.exports = { registerSocketHandlers };
