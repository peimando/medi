const pool = require('../database/pool');
const cfg = require('../config/loader');

async function daily(req, res, next) {
  try {
    const redisClient = req.app.get('redis');
    const cacheKey = `analytics:daily:${new Date().toISOString().slice(0, 10)}`;
    const cacheTTL = cfg.getSysInt('analytics_cache_ttl') || 30;

    if (redisClient) {
      const cached = await redisClient.get(cacheKey).catch(() => null);
      if (cached) return res.set('X-Cache', 'HIT').json(JSON.parse(cached));
    }

    const { rows } = await pool.query(
      `SELECT
         s.id AS service_id, s.name AS service, s.color, s.icon,
         COUNT(p.id)                                                              AS total,
         SUM(CASE WHEN p.status='completed' THEN 1 ELSE 0 END)                   AS completed,
         SUM(CASE WHEN p.status='absent'    THEN 1 ELSE 0 END)                   AS absent,
         SUM(CASE WHEN p.status='waiting'   THEN 1 ELSE 0 END)                   AS waiting,
         SUM(CASE WHEN p.status='serving'   THEN 1 ELSE 0 END)                   AS serving,
         ROUND(AVG(EXTRACT(EPOCH FROM (p.completion_time - p.arrival_time))/60)
               FILTER (WHERE p.status='completed'), 1)                            AS avg_wait_min,
         ROUND(AVG(EXTRACT(EPOCH FROM (p.completion_time - p.called_at))/60)
               FILTER (WHERE p.status='completed'), 1)                            AS avg_attention_min
       FROM services s
       LEFT JOIN patients p ON p.service_id=s.id AND DATE(p.arrival_time)=CURRENT_DATE
       WHERE s.active=true
       GROUP BY s.id, s.name, s.color, s.icon
       ORDER BY s.priority_order`
    );

    if (redisClient) {
      redisClient.setEx(cacheKey, cacheTTL, JSON.stringify(rows)).catch(() => {});
    }

    res.set('X-Cache', 'MISS').json(rows);
  } catch (err) { next(err); }
}

module.exports = { daily };
