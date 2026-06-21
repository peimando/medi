// ============================================================
// routes/users.js — Gestión de usuarios y roles
//
// Registrar en server.js:
//   const usersRouter = require('./routes/users')
//   app.use('/api/users', authMiddleware, usersRouter)
// ============================================================

const express  = require('express');
const bcrypt   = require('bcryptjs');
const { body, param, validationResult } = require('express-validator');
const { AppError, Errors } = require('../src/errors/AppError');
const cfg      = require('../src/config/loader');

module.exports = function usersRoutes(pgPool) {
const router   = express.Router();

// ─── HELPERS ──────────────────────────────────────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array()[0].msg, 400, 'VALIDATION_ERROR'));
  }
  next();
};

// Solo admin puede gestionar usuarios
const requireManageUsers = (req, res, next) => {
  if (!cfg.hasPermission(req.user?.role, 'manage_users') &&
      !cfg.hasPermission(req.user?.role, 'all')) {
    return next(Errors.FORBIDDEN());
  }
  next();
};

// ─── USUARIOS ─────────────────────────────────────────────────

// GET /api/users
router.get('/', requireManageUsers, async (req, res, next) => {
  try {
    const { role, active, search, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const values     = [];
    let   idx        = 1;

    if (role)   { conditions.push(`s.role = $${idx++}`);    values.push(role); }
    if (active) { conditions.push(`s.active = $${idx++}`);  values.push(active === 'true'); }
    if (search) {
      conditions.push(`(s.name ILIKE $${idx} OR s.username ILIKE $${idx} OR s.email ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    values.push(parseInt(limit), offset);

    const { rows } = await pgPool.query(
      `SELECT
         s.id, s.username, s.name, s.email, s.role,
         s.service_id, s.active, s.last_login, s.created_at,
         r.label AS role_label, r.color AS role_color, r.permissions,
         sv.name AS service_name, sv.icon AS service_icon,
         b.name  AS box_name,
         (SELECT COUNT(*) FROM audit_logs al WHERE al.user_id = s.id) AS action_count
       FROM staff s
       LEFT JOIN roles    r  ON r.code = s.role
       LEFT JOIN services sv ON sv.id  = s.service_id
       LEFT JOIN boxes    b  ON b.current_staff_id = s.id
       ${where}
       ORDER BY s.active DESC, s.name ASC
       LIMIT $${idx++} OFFSET $${idx}`,
      values
    );

    const { rows: total } = await pgPool.query(
      `SELECT COUNT(*) FROM staff s ${where}`,
      values.slice(0, -2)
    );

    res.json({
      data: rows.map(u => ({ ...u, password_hash: undefined })),
      meta: { page: parseInt(page), limit: parseInt(limit), total: parseInt(total[0].count) },
    });
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', requireManageUsers,
  [ param('id').isInt() ], validate,
  async (req, res, next) => {
    try {
      const { rows } = await pgPool.query(
        `SELECT s.id, s.username, s.name, s.email, s.role,
                s.service_id, s.totp_enabled, s.active,
                s.last_login, s.created_at,
                r.label AS role_label, r.permissions,
                sv.name AS service_name
         FROM staff s
         LEFT JOIN roles r    ON r.code = s.role
         LEFT JOIN services sv ON sv.id = s.service_id
         WHERE s.id = $1`,
        [req.params.id]
      );
      if (!rows.length) return next(Errors.NOT_FOUND('Usuario'));
      res.json({ ...rows[0], password_hash: undefined });
    } catch (err) { next(err); }
  }
);

// POST /api/users — crear usuario
router.post('/',
  requireManageUsers,
  [
    body('username').trim().isLength({ min:3, max:50 })
      .withMessage('Usuario: mínimo 3 caracteres')
      .matches(/^[a-z0-9_]+$/)
      .withMessage('Solo minúsculas, números y guiones bajos'),
    body('name').trim().isLength({ min:3 }).withMessage('Nombre: mínimo 3 caracteres'),
    body('email').isEmail().withMessage('Email inválido'),
    body('password').isLength({ min:8 }).withMessage('Contraseña: mínimo 8 caracteres'),
    body('role').isString().withMessage('Rol requerido'),
    body('service_id').optional({ nullable:true }).isInt(),
    body('box_id').optional({ nullable:true }).isInt(),
  ],
  validate,
  async (req, res, next) => {
    const client = await pgPool.connect();
    try {
      const { username, name, email, password, role, service_id, box_id } = req.body;

      if (!cfg.isValidRole(role)) {
        await client.query('ROLLBACK');
        client.release();
        return next(new AppError(`Rol inválido: ${role}`, 400, 'INVALID_ROLE'));
      }

      const { rows: existing } = await client.query(
        'SELECT id FROM staff WHERE username=$1 OR email=$2',
        [username, email]
      );
      if (existing.length) {
        await client.query('ROLLBACK');
        client.release();
        return next(new AppError('Usuario o email ya existe', 409, 'USER_EXISTS'));
      }

      await client.query('BEGIN');

      const passwordHash = await bcrypt.hash(password, 10);

      const { rows } = await client.query(
        `INSERT INTO staff
           (username, password_hash, name, email, role, service_id, active, must_change_password)
         VALUES ($1,$2,$3,$4,$5,$6,true,true)
         RETURNING id, username, name, email, role, service_id, active, created_at`,
        [username, passwordHash, name, email, role, service_id || null]
      );

      const user = rows[0];

      if (box_id) {
        await client.query(
          'UPDATE boxes SET current_staff_id=$1 WHERE id=$2',
          [user.id, box_id]
        );
        await client.query(
          'INSERT INTO box_staff_history (box_id, staff_id) VALUES ($1,$2)',
          [box_id, user.id]
        );
      }

      await client.query('COMMIT');
      client.release();

      await req.audit({
        action: 'USER_CREATED',
        entityType: 'STAFF',
        entityId: user.id,
        newData: { username, role, email },
      }).catch(() => {});

      res.status(201).json(user);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      next(err);
    }
  }
);

// PUT /api/users/:id — actualizar usuario
router.put('/:id',
  requireManageUsers,
  [ param('id').isInt() ],
  validate,
  async (req, res, next) => {
    const client = await pgPool.connect();
    try {
      const { id } = req.params;

      if (parseInt(id) === req.user.id && req.body.role && req.body.role !== req.user.role) {
        client.release();
        return next(new AppError('No puedes cambiar tu propio rol', 400, 'SELF_ROLE_CHANGE'));
      }

      // Protección: no desactivar el último admin
      if (req.body.active === false) {
        const { rows: roleCheck } = await client.query(
          'SELECT role FROM staff WHERE id=$1', [id]
        );
        if (roleCheck.length && roleCheck[0].role === 'admin') {
          const { rows: admins } = await client.query(
            "SELECT COUNT(*) FROM staff WHERE role='admin' AND active=true"
          );
          if (parseInt(admins[0].count) <= 1) {
            client.release();
            return next(new AppError('No puedes desactivar el único administrador', 400, 'LAST_ADMIN'));
          }
        }
      }

      const allowed = ['name','email','role','service_id','active','must_change_password'];
      const updates = [];
      const values  = [];
      let   idx     = 1;

      if (req.body.password) {
        if (req.body.password.length < 8) {
          client.release();
          return next(new AppError('Contraseña mínimo 8 caracteres', 400, 'WEAK_PASSWORD'));
        }
        updates.push(`password_hash = $${idx++}`);
        values.push(await bcrypt.hash(req.body.password, 10));
        updates.push(`must_change_password = $${idx++}`);
        values.push(false);
      }

      if (req.body.role && !cfg.isValidRole(req.body.role)) {
        client.release();
        return next(new AppError(`Rol inválido: ${req.body.role}`, 400, 'INVALID_ROLE'));
      }

      allowed.forEach(f => {
        if (req.body[f] !== undefined) {
          updates.push(`${f} = $${idx++}`);
          values.push(req.body[f]);
        }
      });

      if (!updates.length) { client.release(); return next(new AppError('Sin cambios', 400, 'NO_UPDATES')); }

      await client.query('BEGIN');

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const { rows } = await client.query(
        `UPDATE staff SET ${updates.join(',')} WHERE id=$${idx} RETURNING id,username,name,email,role,service_id,active`,
        values
      );

      if (!rows.length) {
        await client.query('ROLLBACK');
        client.release();
        return next(new AppError('Usuario no encontrado', 404, 'NOT_FOUND'));
      }

      if (req.body.box_id !== undefined) {
        await client.query(
          'UPDATE boxes SET current_staff_id=NULL WHERE current_staff_id=$1',
          [id]
        );
        await client.query(
          `UPDATE box_staff_history SET unassigned_at=NOW()
           WHERE staff_id=$1 AND unassigned_at IS NULL`,
          [id]
        );
        if (req.body.box_id) {
          await client.query('UPDATE boxes SET current_staff_id=$1 WHERE id=$2', [id, req.body.box_id]);
          await client.query('INSERT INTO box_staff_history (box_id,staff_id) VALUES ($1,$2)', [req.body.box_id, id]);
        }
      }

      await client.query('COMMIT');
      client.release();

      await req.audit({
        action: 'USER_UPDATED',
        entityType: 'STAFF',
        entityId: id,
        newData: req.body,
      }).catch(() => {});

      res.json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      next(err);
    }
  }
);

// POST /api/users/:id/reset-password — reset forzado
router.post('/:id/reset-password',
  requireManageUsers,
  [ param('id').isInt(), body('password').isLength({ min:8 }) ],
  validate,
  async (req, res, next) => {
    try {
      const hash = await bcrypt.hash(req.body.password, 10);
      await pgPool.query(
        `UPDATE staff SET password_hash=$1, must_change_password=false,
         totp_enabled=false, totp_secret=NULL, updated_at=NOW() WHERE id=$2`,
        [hash, req.params.id]
      );
      await req.audit({
        action: 'PASSWORD_RESET',
        entityType: 'STAFF',
        entityId: req.params.id,
      }).catch(() => {});
      res.json({ success:true, message:'Contraseña reseteada. 2FA desactivado.' });
    } catch (err) { next(err); }
  }
);

// ─── ROLES ────────────────────────────────────────────────────

// GET /api/users/roles/list
router.get('/roles/list', requireManageUsers, async (req, res, next) => {
  try {
    const { rows } = await pgPool.query(
      `SELECT r.*,
         COUNT(s.id) AS users_count
       FROM roles r
       LEFT JOIN staff s ON s.role=r.code AND s.active=true
       WHERE r.active=true
       GROUP BY r.id
       ORDER BY r.id`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/users/roles — crear rol
router.post('/roles',
  requireManageUsers,
  [
    body('code').trim().matches(/^[a-z_]+$/).withMessage('Solo minúsculas y guiones bajos'),
    body('label').trim().isLength({ min:2 }).withMessage('Etiqueta requerida'),
    body('permissions').isObject().withMessage('Permisos requeridos (objeto)'),
    body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { code, label, permissions, color = '#6B7280' } = req.body;

      const { rows: existing } = await pgPool.query(
        'SELECT id FROM roles WHERE code=$1', [code]
      );
      if (existing.length) {
        return next(new AppError(`Código de rol '${code}' ya existe`, 409, 'ROLE_EXISTS'));
      }

      const { rows } = await pgPool.query(
        `INSERT INTO roles (code, label, permissions, color)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [code, label, JSON.stringify(permissions), color]
      );

      // Recargar cfg para que el nuevo rol esté disponible
      await cfg.reload();

      res.status(201).json(rows[0]);
    } catch (err) { next(err); }
  }
);

// PUT /api/users/roles/:id — editar rol
router.put('/roles/:id',
  requireManageUsers,
  [ param('id').isInt() ],
  validate,
  async (req, res, next) => {
    try {
      const allowed = ['label','permissions','color','active'];
      const updates = [];
      const values  = [];
      let   idx     = 1;

      // No permitir editar el rol 'admin' si eres el único admin
      const role = await pgPool.query('SELECT code FROM roles WHERE id=$1', [req.params.id]);
      if (role.rows[0]?.code === 'admin') {
        const { rows: admins } = await pgPool.query(
          "SELECT COUNT(*) FROM staff WHERE role='admin' AND active=true"
        );
        if (parseInt(admins[0].count) <= 1 && req.body.active === false) {
          return next(new AppError('No puedes desactivar el único rol admin', 400, 'LAST_ADMIN_ROLE'));
        }
      }

      allowed.forEach(f => {
        if (req.body[f] !== undefined) {
          updates.push(`${f} = $${idx++}`);
          values.push(f === 'permissions' ? JSON.stringify(req.body[f]) : req.body[f]);
        }
      });

      if (!updates.length) return next(new AppError('Sin cambios', 400, 'NO_UPDATES'));

      values.push(req.params.id);
      const { rows } = await pgPool.query(
        `UPDATE roles SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
        values
      );

      if (!rows.length) return next(new AppError('Rol no encontrado', 404, 'NOT_FOUND'));

      // Recargar cfg en caliente
      await cfg.reload();

      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);

// GET /api/users/audit — historial de acciones (solo admin)
router.get('/audit/log',
  requireManageUsers,
  async (req, res, next) => {
    try {
      const { user_id, action, page = 1, limit = 50 } = req.query;
      const conditions = [];
      const values     = [];
      let   idx        = 1;

      if (user_id) { conditions.push(`al.user_id=$${idx++}`); values.push(user_id); }
      if (action)  { conditions.push(`al.action=$${idx++}`);  values.push(action);  }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const { rows: total } = await pgPool.query(
        `SELECT COUNT(*) FROM audit_logs al ${where}`,
        values
      );

      const offset = (parseInt(page) - 1) * parseInt(limit);
      values.push(parseInt(limit), offset);

      const { rows } = await pgPool.query(
        `SELECT al.*, s.name AS user_name, s.username
         FROM audit_logs al
         LEFT JOIN staff s ON s.id = al.user_id
         ${where}
         ORDER BY al.created_at DESC
         LIMIT $${idx++} OFFSET $${idx}`,
        values
      );
      res.json({
        data: rows.map(r => ({
          ...r,
          entityType: r.entity_type || r.resource,
          entityId: r.entity_id || (r.resource_id ? String(r.resource_id) : null),
          newData: r.new_data || r.changes,
        })),
        meta: { page: parseInt(page), limit: parseInt(limit), total: parseInt(total[0].count) },
      });
    } catch (err) { next(err); }
  }
);

return router;
};