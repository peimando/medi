// src/config/env.js — Validación de variables de entorno al arranque

const REQUIRED = [
  'DATABASE_URL',
  'JWT_SECRET',
];

const OPTIONAL_WITH_DEFAULTS = {
  PORT:           '3000',
  REDIS_HOST:     'localhost',
  REDIS_PORT:     '6379',
  CORS_ORIGIN:    '',
  LOG_LEVEL:      'info',
  FRONTEND_URL:   '*',
};

function validateEnv() {
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (missing.length) {
    console.error('❌ Variables de entorno faltantes:', missing.join(', '));
    process.exit(1);
  }

  // Aplicar defaults para opcionales
  Object.entries(OPTIONAL_WITH_DEFAULTS).forEach(([k, v]) => {
    if (!process.env[k]) process.env[k] = v;
  });

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ JWT_SECRET demasiado corto en producción. Usa al menos 32 caracteres.');
      process.exit(1);
    }
    console.warn('⚠️  JWT_SECRET muy corto — usa al menos 32 caracteres en producción');
  }

  if (process.env.JWT_SECRET === 'mediqueue_jwt_secret_2026_change_me') {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ JWT_SECRET es el placeholder por defecto. Cámbialo antes de ejecutar en producción.');
      process.exit(1);
    }
    console.warn('⚠️  JWT_SECRET usa el placeholder por defecto');
  }

  console.log('✓ Variables de entorno validadas');
}

module.exports = { validateEnv };
