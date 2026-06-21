const logger = require('../config/logger');

class AuditService {
  constructor(pgPool) {
    this.pgPool = pgPool;
  }

  async log({ userId, username, action, entityType, entityId, oldData, newData, ipAddress, userAgent }) {
    try {
      await this.pgPool.query(
        `INSERT INTO audit_logs
          (user_id, username, action, entity_type, entity_id, old_data, new_data, ip_address, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          userId || null,
          username || null,
          action,
          entityType || null,
          entityId ? String(entityId) : null,
          oldData || null,
          newData || null,
          ipAddress || null,
          userAgent || null,
        ]
      );
    } catch (err) {
      logger.error('Error escribiendo auditoría', {
        action,
        entityType,
        entityId,
        error: err.message,
      });
    }
  }
}

module.exports = AuditService;
