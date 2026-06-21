const redis = require('redis');
const logger = require('../config/logger');

let redisClient = null;

async function initRedis() {
  try {
    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        reconnectStrategy: (retries) => {
          if (retries > 20) {
            logger.error('Redis — máximo de reconexiones alcanzado');
            return new Error('Máximo de reconexiones Redis');
          }
          return Math.min(retries * 200, 5000);
        },
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });
    redisClient.on('error', (err) => {
      logger?.warn('Redis error', { error: err.message });
    });
    redisClient.on('reconnecting', () => {
      logger?.info('Redis reconectando...');
    });
    await redisClient.connect();
    return redisClient;
  } catch {
    return null;
  }
}

function getRedis() {
  return redisClient;
}

module.exports = { initRedis, getRedis };
