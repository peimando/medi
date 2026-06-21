const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database/pool');
const { Errors } = require('../errors/AppError');
const cfg = require('../config/loader');

async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) return next(Errors.INVALID_CREDENTIALS());

    const { rows } = await pool.query(
      `SELECT s.id, s.username, s.password_hash, s.role, s.service_id,
              s.totp_enabled, s.name, s.must_change_password, r.permissions
       FROM staff s
       LEFT JOIN roles r ON r.code = s.role
       WHERE s.username=$1 AND s.active=true`,
      [username]
    );
    if (!rows.length) return next(Errors.INVALID_CREDENTIALS());
    const staff = rows[0];

    const match = await bcrypt.compare(password, staff.password_hash);
    if (!match) return next(Errors.INVALID_CREDENTIALS());

    const token = jwt.sign(
      { id: staff.id, username: staff.username, name: staff.name,
        role: staff.role, service_id: staff.service_id,
        permissions: staff.permissions },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    await pool.query('UPDATE staff SET last_login=NOW() WHERE id=$1', [staff.id]);

    await req.audit({
      action: 'LOGIN',
      entityType: 'STAFF',
      entityId: staff.id,
      newData: { username: staff.username, name: staff.name, role: staff.role },
    }).catch(() => {});

    res.json({
      token,
      user: { id: staff.id, username: staff.username, name: staff.name,
              role: staff.role, service_id: staff.service_id,
              must_change_password: staff.must_change_password },
    });
  } catch (err) { next(err); }
}

async function logout(req, res) {
  await req.audit({ action: 'LOGOUT', entityType: 'STAFF', entityId: req.user.id }).catch(() => {});
  res.json({ success: true });
}

async function me(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.username, s.name, s.role, s.service_id, s.email,
              s.must_change_password,
              r.label AS role_label, r.color AS role_color, r.permissions,
              b.id AS box_id, b.name AS box_name
       FROM staff s
       LEFT JOIN roles r ON r.code=s.role
       LEFT JOIN boxes b ON b.current_staff_id=s.id
       WHERE s.id=$1`,
      [req.user.id]
    );
    if (!rows.length) return next(Errors.NOT_FOUND('Usuario'));
    res.json(rows[0]);
  } catch (err) { next(err); }
}

module.exports = { login, logout, me };
