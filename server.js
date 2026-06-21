// ============================================================
// server.js — MediQueue Backend completo
// ============================================================
require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const { createServer } = require('http');
const { Server }  = require('socket.io');
const helmet      = require('helmet');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const { v4: uuid }= require('uuid');

const { validateEnv }    = require('./src/config/env');
const { errorHandler, setLogger } = require('./src/errors/AppError');
const cfg          = require('./src/config/loader');
const morgan       = require('morgan');
const auditMiddleware = require('./src/middleware/audit');
const { auth, can } = require('./src/middleware/auth');
const { registerSocketHandlers } = require('./src/sockets/asyncSocket');
const { validate } = require('./src/middleware/validate');
const idempotency = require('./src/middleware/idempotency');
const { body, param } = require('express-validator');
const { waitForDatabase } = require('./src/utils/dbHelpers');

const healthCtrl   = require('./src/controllers/healthController');
const authCtrl     = require('./src/controllers/authController');
const patientCtrl  = require('./src/controllers/patientController');
const queueCtrl    = require('./src/controllers/queueController');
const analyticsCtrl = require('./src/controllers/analyticsController');
const { getDisplayState, getAnalyticsState } = require('./src/services/displayService');

// ─── LOGGER (winston) ──────────────────────────────────────────
const logger = require('./src/config/logger');
setLogger(logger);
validateEnv();

// ─── APP ──────────────────────────────────────────────────────
const app        = express();
const httpServer = createServer(app);
httpServer.setTimeout(30000);
const io         = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
      : process.env.NODE_ENV === 'production'
        ? []
        : '*',
    credentials: !!process.env.CORS_ORIGIN,
  },
});

// ─── CONEXIONES ───────────────────────────────────────────────
const pgPool = require('./src/database/pool');
app.set('io', io);

// Redis opcional con reconexión automática
const { initRedis } = require('./src/database/redis');
let redisClient = null;
app.set('redis', redisClient);
const tryRedis = async () => {
  redisClient = await initRedis();
  app.set('redis', redisClient);
  if (redisClient) logger.info('Redis conectado');
  else logger.warn('Redis no disponible inicialmente — cache desactivado, reintentará reconectar');
};

// ─── MIDDLEWARE ───────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:", process.env.CORS_ORIGIN || "'self'"].filter(Boolean),
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(compression());
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : process.env.NODE_ENV === 'production'
    ? []
    : '*';
if (corsOrigins === '*' || (Array.isArray(corsOrigins) && corsOrigins.length === 1 && corsOrigins[0] === '*')) {
  logger.warn('CORS: usando wildcard, credentials deshabilitado');
}
app.use(cors({
  origin: corsOrigins,
  credentials: corsOrigins !== '*' && !(Array.isArray(corsOrigins) && corsOrigins.includes('*')),
}));
app.use(express.json());
app.use((req, res, next) => {
  req.traceId = req.headers['x-trace-id'] || uuid();
  res.set('x-trace-id', req.traceId);
  next();
});

// HTTP access log
app.use(morgan('short', {
  stream: { write: msg => logger.info(msg.trim(), { service: 'http' }) },
}));

// ─── STATIC (producción) ───────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('frontend/dist'));
}
// Archivos subidos (imágenes de pantallas, etc.)
app.use('/uploads', express.static('uploads'));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, message: { error: 'Demasiados intentos de login', code: 'LOGIN_RATE_LIMITED' } });
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true });

app.use('/api/', auditMiddleware(pgPool));

// ─── HEALTHCHECK ──────────────────────────────────────────────
app.get('/health', healthCtrl.health);
app.get('/live', healthCtrl.live);
app.get('/ready', healthCtrl.ready);

// ─── DISPLAY CURRENT STATE (para reconexión Socket.IO) ──────
app.get('/api/display/current', async (req, res, next) => {
  try {
    const display = await getDisplayState(pgPool, cfg);
    res.json({ display });
  } catch (err) { next(err); }
});

// ─── CONFIG PÚBLICA ───────────────────────────────────────────
app.get('/api/config/public', publicLimiter, async (req, res, next) => {
  try {
    const [dispRows, kioskRows] = await Promise.all([
      pgPool.query('SELECT id, name, slug, service_ids FROM display_configs WHERE active=true'),
      pgPool.query('SELECT id, name, slug, service_ids FROM kiosk_configs WHERE active=true'),
    ]);

    res.json({
      services:     (cfg.get('services') || []).map(s => ({
        id: s.id, name: s.name, code: s.code, color: s.color, icon: s.icon,
      })),
      patientTypes: (cfg.get('patientTypes') || []).map(t => ({
        id: t.id, code: t.code, label: t.label, color: t.color, icon: t.icon, priority: t.priority,
      })),
      hospitalName:   cfg.getSys('hospital_name') || 'Hospital',
      displayConfigs: dispRows.rows,
      kioskConfigs:   kioskRows.rows,
    });
  } catch (err) { next(err); }
});

// GET /api/display/:slug — datos públicos para una pantalla
app.get('/api/display/:slug', publicLimiter, async (req, res, next) => {
  try {
    const { rows: configs } = await pgPool.query(
      'SELECT * FROM display_configs WHERE slug=$1 AND active=true',
      [req.params.slug]
    );
    if (!configs.length) return res.status(404).json({ error: 'Pantalla no encontrada' });
    const config = configs[0];

    const layout = typeof config.layout === 'string' ? JSON.parse(config.layout) : (config.layout || {});
    const nameCol = layout.show_patient_names ? ', p.name AS patient_name' : '';

    const { rows: services } = await pgPool.query(
      `SELECT s.id, s.name, s.code, s.color, s.icon,
              p.ticket_code, p.called_at, b.name AS box_name${nameCol}
       FROM services s
       LEFT JOIN patients p ON p.service_id=s.id AND p.status='serving'
       LEFT JOIN boxes b ON b.id=p.box_id
       WHERE s.id = ANY($1) AND s.active=true
       ORDER BY s.priority_order`,
      [config.service_ids]
    );

    const { rows: queueCounts } = await pgPool.query(
      `SELECT service_id, COUNT(*) AS waiting
       FROM patients
       WHERE service_id = ANY($1) AND status='waiting'
       GROUP BY service_id`,
      [config.service_ids]
    );

    const queueMap = Object.fromEntries(queueCounts.map(r => [r.service_id, parseInt(r.waiting)]));
    const displayData = services.map(s => ({
      ...s,
      waiting: queueMap[s.id] || 0,
    }));

    res.json({ config, display: displayData });
  } catch (err) { next(err); }
});

// ─── AUTH ─────────────────────────────────────────────────────
app.post('/api/auth/login',
  loginLimiter,
  [body('username').trim().notEmpty(), body('password').notEmpty()],
  validate,
  authCtrl.login
);

app.post('/api/auth/logout', auth, authCtrl.logout);

app.get('/api/auth/me', auth, authCtrl.me);

// ─── PACIENTES (REGISTRO / CHECK-IN) ─────────────────────────
app.post('/api/patients',
  idempotency,
  [
    body('name').trim().isLength({ min: 3 }).withMessage('Nombre mínimo 3 caracteres'),
    body('serviceId').isInt({ min: 1 }).withMessage('Servicio requerido'),
    body('type').trim().notEmpty().withMessage('Tipo de consulta requerido'),
    body('phone').optional({ values: 'falsy' }).isString(),
    body('smsConsent').optional().isBoolean(),
  ],
  validate,
  patientCtrl.register
);

app.get('/api/tickets/:code', [param('code').trim().notEmpty()], validate, patientCtrl.getTicket);

// ─── COLA POR SERVICIO ────────────────────────────────────────
app.get('/api/services/:serviceId/queue', auth, [param('serviceId').isInt()], validate, queueCtrl.getQueue);
app.get('/api/services/:serviceId/display', [param('serviceId').isInt()], validate, queueCtrl.getQueuePublic);

// ─── ACCIONES DE COLA (STAFF) ─────────────────────────────────
app.post('/api/services/:serviceId/call-next',
  auth, can('call_patients'),
  [param('serviceId').isInt()], validate,
  queueCtrl.callNext
);

app.post('/api/services/:serviceId/re-call',
  auth, can('call_patients'),
  [param('serviceId').isInt()], validate,
  queueCtrl.reCall
);

app.post('/api/services/:serviceId/complete/:patientId',
  auth, can('complete_service'), idempotency,
  [param('serviceId').isInt(), param('patientId').isInt()], validate,
  queueCtrl.complete
);

app.post('/api/services/:serviceId/absent/:patientId',
  auth, can('call_patients'), idempotency,
  [param('serviceId').isInt(), param('patientId').isInt()], validate,
  queueCtrl.markAbsent
);

app.post('/api/patients/:patientId/transfer',
  auth, can('call_patients'), idempotency,
  [param('patientId').isInt(), body('toService').isInt().withMessage('Servicio destino requerido')],
  validate,
  queueCtrl.transfer
);

// ─── ANALYTICS ────────────────────────────────────────────────
app.get('/api/analytics/daily', auth, can('view_analytics'), analyticsCtrl.daily);

// ─── USUARIOS (CRUD) ──────────────────────────────────────────
app.use('/api/users', auth, require('./routes/users')(pgPool));

// ─── CONFIG PARAMÉTRICA ───────────────────────────────────────
app.use('/api/config', auth, require('./routes/config')(pgPool));

// ─── COMPLIANCE ARCO ──────────────────────────────────────────
app.use('/api/compliance', require('./routes/compliance')(pgPool));

// ─── REPORTERÍA ────────────────────────────────────────────────
app.use('/api/reports', auth, can('view_analytics'), require('./routes/reports')(pgPool));

// ─── CONFIG RELOAD ────────────────────────────────────────────
app.post('/api/config/reload', auth, can('all'), async (req, res, next) => {
  try {
    await cfg.reload();
    await req.audit({ action: 'CONFIG_RELOADED', entityType: 'SYSTEM' }).catch(() => {});
    res.json({ success: true, message: 'Configuración recargada' });
  } catch (err) { next(err); }
});

// ─── WEBSOCKET ────────────────────────────────────────────────
registerSocketHandlers(io);

// Display board — push cada N segundos
let displayInterval = null;
let analyticsInterval = null;

const startDisplayBoard = () => {
  const ms = cfg.getSysInt('display_refresh_ms') || 2000;
  displayInterval = setInterval(async () => {
    try {
      const display = await getDisplayState(pgPool, cfg);
      io.to('display_board').emit('display_update', display);
    } catch (err) {
      logger.error('Error en display board push', { error: err.message });
    }
  }, ms);
};

// Analytics periódico
const startAnalyticsInterval = () => {
  const ms = cfg.getSysInt('analytics_refresh_ms') || 5000;
  analyticsInterval = setInterval(async () => {
    try {
      const rows = await getAnalyticsState(pgPool);
      io.to('manager_dashboard').emit('analytics_update', rows);
    } catch (err) {
      logger.error('Error en analytics push', { error: err.message });
    }
  }, ms);
};

// ─── SPA FALLBACK (producción) ───────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
  });
}

// 404 para rutas API no encontradas (siempre JSON)
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Ruta no encontrada', code: 'NOT_FOUND' });
  } else {
    res.status(404).send('Not found');
  }
});

// ─── ERROR HANDLER ────────────────────────────────────────────
app.use(errorHandler);

// ─── ARRANCAR ─────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000');

async function initConfig(pool) {
  await cfg.load(pool, null);
}

async function recoverOrphanedServing() {
  const timeoutMin = cfg.getSysInt('serving_timeout_minutes') || 30;
  const { rowCount } = await pgPool.query(
    `UPDATE patients
     SET status='waiting', box_id=NULL, called_at=NULL, called_by=NULL, updated_at=NOW()
     WHERE status='serving' AND called_at < NOW() - $1::INTERVAL`,
    [`${timeoutMin} minutes`]
  );
  if (rowCount > 0) logger.info(`Recuperados ${rowCount} tickets huérfanos en estado serving`);
}

async function start() {
  try {
    await tryRedis();
    await waitForDatabase(pgPool, { label: 'Server DB', retries: 15, delayMs: 2000 });

    await cfg.load(pgPool, redisClient);

    await recoverOrphanedServing();

    startDisplayBoard();
    startAnalyticsInterval();

    // Cleanup periódico de tickets serving huérfanos cada 5 min
    setInterval(async () => {
      try {
        const timeoutMin = cfg.getSysInt('serving_timeout_minutes') || 30;
        await pgPool.query(
          `UPDATE patients
           SET status='waiting', box_id=NULL, called_at=NULL, called_by=NULL, updated_at=NOW()
           WHERE status='serving' AND called_at < NOW() - $1::INTERVAL`,
          [`${timeoutMin} minutes`]
        );
      } catch (err) {
        logger.error('Error en cleanup de tickets huérfanos', { error: err.message });
      }
    }, 5 * 60 * 1000);

    httpServer.listen(PORT, () => {
      logger.info(`MediQueue corriendo en http://localhost:${PORT}`);
      logger.info(`Servicios: ${cfg.get('services')?.length || 0}`);
      logger.info(`Roles: ${cfg.get('roles')?.length || 0}`);
      logger.info(`Hospital: ${cfg.getSys('hospital_name')}`);
    });
  } catch (err) {
    logger.error('Error arrancando el servidor', { error: err.message });
    process.exit(1);
  }
}

function shutdown(signal) {
  logger.info(`Señal ${signal} recibida — cerrando gracefully...`);
  if (displayInterval) clearInterval(displayInterval);
  if (analyticsInterval) clearInterval(analyticsInterval);
  httpServer.close(async (err) => {
    if (err) {
      logger.error('Error al cerrar HTTP server', { error: err.message });
      process.exit(1);
    }
    await pgPool.end().catch(e => logger.error('Error cerrando DB pool', { error: e.message }));
    await cfg.shutdown().catch(() => {});
    if (redisClient) await redisClient.quit().catch(() => {});
    io.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => { logger.warn('Fallo timeout shutdown — forzando exit'); process.exit(1); }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Exportar para tests
module.exports = app;
module.exports.initConfig = initConfig;
module.exports.withPool = (pool) => {
  const appClone = require('express')();
  appClone.get('/health', async (req, res) => {
    try { await pool.query('SELECT 1'); res.json({ status:'OK', checks:{ db:'ok' } }); }
    catch { res.status(503).json({ status:'DEGRADED', checks:{ db:'error' } }); }
  });
  return appClone;
};

if (require.main === module) start();
