const logger = require('../config/logger');

const TTL_SEC = 300; // 5 min

// Fallback en memoria cuando Redis no está disponible
const memoryStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of memoryStore) {
    if (now - ts > TTL_SEC * 1000) memoryStore.delete(key);
  }
}, 60000);

function getRedis(req) {
  return req.app?.get?.('redis') || null;
}

async function idempotency(req, res, next) {
  const rawKey = req.headers['idempotency-key'];
  if (!rawKey) return next();

  const userId = req.user?.id || 'anon';
  const scopedKey = `idem:${req.method}:${req.path}:${userId}:${rawKey}`;

  const redis = getRedis(req);

  if (redis && redis.isOpen) {
    try {
      const existed = await redis.set(scopedKey, '1', { EX: TTL_SEC, NX: true });
      if (existed === null) {
        logger.warn('Idempotency-Key reutilizada (Redis)', { key: rawKey, path: req.path, user: userId });
        return res.status(409).json({
          error: 'Esta solicitud ya fue procesada',
          code: 'IDEMPOTENCY_CONFLICT',
        });
      }
      res.on('finish', () => {
        if (res.statusCode >= 500) redis.del(scopedKey).catch(() => {});
      });
      return next();
    } catch (err) {
      logger.warn('Redis idempotency error, usando fallback en memoria', { error: err.message });
      // fall through to memory fallback
    }
  }

  // Fallback en memoria
  if (memoryStore.has(scopedKey)) {
    logger.warn('Idempotency-Key reutilizada (memoria)', { key: rawKey, path: req.path, user: userId });
    return res.status(409).json({
      error: 'Esta solicitud ya fue procesada',
      code: 'IDEMPOTENCY_CONFLICT',
    });
  }

  memoryStore.set(scopedKey, Date.now());
  res.on('finish', () => {
    if (res.statusCode >= 500) memoryStore.delete(scopedKey);
  });
  next();
}

module.exports = idempotency;
