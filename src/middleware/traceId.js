const { v4: uuid } = require('uuid');

function traceId(req, res, next) {
  req.traceId = req.headers['x-trace-id'] || uuid();
  res.set('x-trace-id', req.traceId);
  next();
}

module.exports = { traceId };
