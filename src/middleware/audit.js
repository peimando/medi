const AuditService = require('../services/auditService');

module.exports = function auditMiddleware(pgPool) {
  const audit = new AuditService(pgPool);

  return (req, res, next) => {
    req.audit = (params) =>
      audit.log({
        userId: req.user?.id,
        username: req.user?.username,
        ...params,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    next();
  };
};
