const pool = require('../database/pool');
const cfg = require('../config/loader');

async function health(req, res) {
  const redisClient = req.app.get('redis');
  const checks = { db: 'ok', redis: redisClient ? 'ok' : 'disabled' };
  try { await pool.query('SELECT 1'); } catch { checks.db = 'error'; }
  const status = checks.db === 'error' ? 503 : 200;
  res.status(status).json({
    status:   status === 200 ? 'OK' : 'DEGRADED',
    checks,
    services: cfg.get('services')?.length || 0,
    uptime:   Math.round(process.uptime()),
    version:  process.env.npm_package_version || '1.0.0',
  });
}

function live(req, res) {
  res.json({ status: 'alive', uptime: Math.round(process.uptime()) });
}

async function ready(req, res) {
  const redisClient = req.app.get('redis');
  const io = req.app.get('io');
  const checks = {};
  try { await pool.query('SELECT 1'); checks.postgres = 'ok'; } catch { checks.postgres = 'error'; }
  checks.redis = redisClient ? 'ok' : 'disabled';
  checks.socketio = io ? 'ok' : 'error';
  checks.config = cfg.get('services')?.length > 0 ? 'ok' : 'not_loaded';
  const failed = Object.entries(checks).filter(([, v]) => v === 'error').map(([k]) => k);
  const allOk = failed.length === 0;
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'degraded',
    checks,
    ...(failed.length ? { degraded: failed } : {}),
  });
}

module.exports = { health, live, ready };
