// src/errors/AppError.js — Errores tipados centralizados

class AppError extends Error {
  constructor(message, status = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.status = status;
    this.code   = code;
  }
}

// Catálogo de errores comunes
const Errors = {
  UNAUTHORIZED:          () => new AppError('No autenticado',                       401, 'UNAUTHORIZED'),
  FORBIDDEN:             () => new AppError('Sin permiso para esta acción',          403, 'FORBIDDEN'),
  TOKEN_EXPIRED:         () => new AppError('Sesión expirada, vuelve a iniciar sesión', 401, 'TOKEN_EXPIRED'),
  TOKEN_INVALID:         () => new AppError('Token inválido',                        401, 'TOKEN_INVALID'),
  INVALID_CREDENTIALS:   () => new AppError('Usuario o contraseña incorrectos',      401, 'INVALID_CREDENTIALS'),
  TWO_FA_REQUIRED:       () => new AppError('Se requiere código 2FA',                401, 'TWO_FA_REQUIRED'),
  TWO_FA_INVALID:        () => new AppError('Código 2FA incorrecto',                 401, 'TWO_FA_INVALID'),
  QUEUE_EMPTY:           (s) => new AppError(`No hay pacientes en espera en ${s}`,   404, 'QUEUE_EMPTY'),
  NO_PATIENT_SERVING:    () => new AppError('No hay paciente en atención',           404, 'NO_PATIENT_SERVING'),
  INVALID_SERVICE:       (s) => new AppError(`Servicio no encontrado: ${s}`,         404, 'INVALID_SERVICE'),
  INVALID_TYPE:          (t) => new AppError(`Tipo de paciente inválido: ${t}`,      400, 'INVALID_TYPE'),
  SMS_CONSENT_REQUIRED:  () => new AppError('Se requiere consentimiento para SMS',   400, 'SMS_CONSENT_REQUIRED'),
  WRONG_SERVICE:         () => new AppError('No perteneces a este servicio',         403, 'WRONG_SERVICE'),
  NOT_FOUND:             (r) => new AppError(`${r || 'Recurso'} no encontrado`,      404, 'NOT_FOUND'),
  CONFLICT:              (m) => new AppError(m,                                       409, 'CONFLICT'),
};

let _logger = { error: () => {} };
const setLogger = (logger) => { _logger = logger; };

// Middleware global de errores
const errorHandler = (err, req, res, next) => {
  const status  = err.status  || 500;
  const code    = err.code    || 'INTERNAL_ERROR';
  const message = status < 500 ? err.message : 'Error interno del servidor';

  if (status >= 500) {
    _logger.error(`[${req.traceId || '?'}] ${err.stack}`);
  }

  res.status(status).json({
    error:   message,
    code,
    traceId: req.traceId,
  });
};

module.exports = { AppError, Errors, errorHandler, setLogger };
