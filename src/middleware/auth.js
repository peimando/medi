const jwt = require('jsonwebtoken');
const { Errors } = require('../errors/AppError');
const cfg = require('../config/loader');

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next(Errors.UNAUTHORIZED());
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    next(e.name === 'TokenExpiredError' ? Errors.TOKEN_EXPIRED() : Errors.TOKEN_INVALID());
  }
}

function can(permission) {
  return (req, res, next) => {
    if (!cfg.hasPermission(req.user?.role, permission)) return next(Errors.FORBIDDEN());
    next();
  };
}

module.exports = { auth, can };
