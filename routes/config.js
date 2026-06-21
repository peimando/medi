// ============================================================
// config.js — Módulo de Configuración Paramétrica MediQueue
//
// Permite gestionar sin tocar código:
//   - Establecimientos (hospitales)
//   - Pisos / Alas / Sectores
//   - Servicios (Triage, Farmacia, etc.)
//   - Consultorios / Ventanillas
//   - Asignación de personal a consultorios
//
// Roles que pueden modificar:
//   - admin        → todo
//   - service_head → solo su servicio
//
// Registrar en server.js:
//   const configRouter = require('./config')
//   app.use('/api/config', configRouter)
//
// npm install express-validator (ya está en package.json)
// ============================================================

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { body, param, validationResult } = require('express-validator');
const cfg      = require('../src/config/loader');
const { buildUpdate } = require('../src/utils/dbHelpers');

module.exports = function configRoutes(pgPool) {
const router    = express.Router();

// ─── HELPERS ──────────────────────────────────────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error:  'Datos inválidos',
      code:   'VALIDATION_ERROR',
      fields: errors.array().map(e => ({ field: e.path, msg: e.msg })),
    });
  }
  next();
};

// Middleware: admin o service_head (basado en permisos dinámicos)
const requireManager = (req, res, next) => {
  const ok = cfg.hasPermission(req.user?.role, 'all') || cfg.hasPermission(req.user?.role, 'manage_config');
  if (!ok) {
    return res.status(403).json({ error: 'Solo administradores y jefes de servicio', code: 'FORBIDDEN' });
  }
  next();
};

// Middleware: solo admin
const requireAdmin = (req, res, next) => {
  if (!cfg.hasPermission(req.user?.role, 'all')) {
    return res.status(403).json({ error: 'Solo administradores', code: 'FORBIDDEN' });
  }
  next();
};

// ─── MULTER (upload imágenes) ─────────────────────────────────
const uploadsDir = path.join(__dirname, '..', 'uploads', 'displays');
const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, uploadsDir); },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `display-${req.params.id}-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// Cache en memoria para la config (evita queries en cada request)
let configCache = null;
let cacheExpiry = 0;
let cachePromise = null;
const CACHE_TTL = 30 * 1000; // 30 segundos

// Invalidar cache cuando se recarga la configuración global
cfg.on('reloaded', () => { configCache = null; cacheExpiry = 0; cachePromise = null; });

const getConfig = async () => {
  if (configCache && Date.now() < cacheExpiry) return configCache;
  if (cachePromise) return cachePromise;

  const buildTree = async () => {
    const { rows } = await pgPool.query(`
      SELECT
        e.id            AS establishment_id,
        e.name          AS establishment_name,
        e.address       AS establishment_address,
        e.active        AS establishment_active,

        f.id            AS floor_id,
        f.name          AS floor_name,
        f.description   AS floor_description,
        f.order_index   AS floor_order,
        f.active        AS floor_active,

        s.id            AS service_id,
        s.name          AS service_name,
        s.code          AS service_code,
        s.color         AS service_color,
        s.icon          AS service_icon,
        s.priority_order AS service_priority,
        s.active        AS service_active,

        b.id            AS box_id,
        b.name          AS box_name,
        b.type          AS box_type,
        b.active        AS box_active,
        b.current_staff_id AS box_staff_id,
        st.name         AS box_staff_name,
        st.role         AS box_staff_role

      FROM establishments e
      LEFT JOIN floors    f  ON f.establishment_id = e.id  AND f.active = true
      LEFT JOIN services  s  ON s.floor_id = f.id          AND s.active = true
      LEFT JOIN boxes     b  ON b.service_id = s.id
      LEFT JOIN staff     st ON st.id = b.current_staff_id AND st.active = true
      WHERE e.active = true
      ORDER BY e.id, f.order_index, s.priority_order, b.name
    `);

    const tree = {};
    rows.forEach(r => {
      if (!tree[r.establishment_id]) {
        tree[r.establishment_id] = {
          id: r.establishment_id, name: r.establishment_name,
          address: r.establishment_address, floors: {},
        };
      }
      if (!r.floor_id) return;
      const est = tree[r.establishment_id];
      if (!est.floors[r.floor_id]) {
        est.floors[r.floor_id] = {
          id: r.floor_id, name: r.floor_name,
          description: r.floor_description,
          order: r.floor_order, services: {},
        };
      }
      if (!r.service_id) return;
      const floor = est.floors[r.floor_id];
      if (!floor.services[r.service_id]) {
        floor.services[r.service_id] = {
          id: r.service_id, name: r.service_name,
          code: r.service_code, color: r.service_color,
          icon: r.service_icon, priority: r.service_priority,
          boxes: [],
        };
      }
      if (!r.box_id) return;
      floor.services[r.service_id].boxes.push({
        id: r.box_id, name: r.box_name,
        type: r.box_type, active: r.box_active,
        staff: r.box_staff_id ? { id: r.box_staff_id, name: r.box_staff_name, role: r.box_staff_role } : null,
      });
    });

    return Object.values(tree).map(est => ({
      ...est,
      floors: Object.values(est.floors).map(floor => ({
        ...floor,
        services: Object.values(floor.services),
      })),
    }));
  };

  cachePromise = buildTree().then(result => {
    configCache = result;
    cacheExpiry = Date.now() + CACHE_TTL;
    cachePromise = null;
    return result;
  }).catch(err => {
    cachePromise = null;
    throw err;
  });

  return cachePromise;
};

const invalidateCache = () => { configCache = null; cacheExpiry = 0; cachePromise = null; };

// ─── ESTABLECIMIENTOS ─────────────────────────────────────────

// GET /api/config — árbol completo (lo usa el frontend para cargar todo)
router.get('/', async (req, res, next) => {
  try {
    const config = await getConfig();
    res.json(config);
  } catch (err) {
    next(err);
  }
});

// GET /api/config/services — lista plana de servicios activos
router.get('/services', async (req, res, next) => {
  try {
    const { rows } = await pgPool.query(
      `SELECT s.id, s.name, s.code, s.color, s.icon, s.priority_order,
              f.name AS floor_name, e.name AS establishment_name
       FROM services s
       JOIN floors       f ON f.id = s.floor_id
       JOIN establishments e ON e.id = f.establishment_id
       WHERE s.active = true AND f.active = true AND e.active = true
       ORDER BY s.priority_order, s.name`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/config/boxes/:serviceId — consultorios de un servicio
router.get('/boxes/:serviceId', async (req, res, next) => {
  try {
    const { rows } = await pgPool.query(
      `SELECT b.*, st.name AS staff_name, st.role AS staff_role
       FROM boxes b
       LEFT JOIN staff st ON st.id = b.current_staff_id
       WHERE b.service_id = $1
       ORDER BY b.name`,
      [req.params.serviceId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/config/establishments
router.post('/establishments',
  requireAdmin,
  [
    body('name').trim().isLength({ min:3 }).withMessage('Nombre mínimo 3 caracteres'),
    body('address').optional().isString(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, address } = req.body;
      const { rows } = await pgPool.query(
        `INSERT INTO establishments (name, address) VALUES ($1,$2) RETURNING *`,
        [name, address]
      );
      invalidateCache();
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ─── PISOS ────────────────────────────────────────────────────

// GET /api/config/floors
router.get('/floors', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pgPool.query(
      `SELECT f.*, e.name AS establishment_name
       FROM floors f
       LEFT JOIN establishments e ON e.id = f.establishment_id
       ORDER BY e.name, f.order_index, f.name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/config/floors
router.post('/floors',
  requireAdmin,
  [
    body('establishment_id').isInt().withMessage('Establecimiento requerido'),
    body('name').trim().isLength({ min:1 }).withMessage('Nombre requerido'),
    body('description').optional().isString(),
    body('order_index').optional().isInt({ min:0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { establishment_id, name, description, order_index = 0 } = req.body;
      const { rows } = await pgPool.query(
        `INSERT INTO floors (establishment_id, name, description, order_index)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [establishment_id, name, description, order_index]
      );
      invalidateCache();
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/config/floors/:id
router.put('/floors/:id',
  requireAdmin,
  [ param('id').isInt() ],
  validate,
  async (req, res, next) => {
    try {
      const { updates, values, idx } = buildUpdate(
        ['name','description','order_index','active'], req.body
      );
      if (!updates.length) return res.status(400).json({ error: 'Sin cambios' });
      values.push(req.params.id);
      const { rows } = await pgPool.query(
        `UPDATE floors SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
        values
      );
      invalidateCache();
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ─── SERVICIOS ────────────────────────────────────────────────

// POST /api/config/services
router.post('/services',
  requireAdmin,
  [
    body('floor_id').isInt().withMessage('Piso requerido'),
    body('name').trim().isLength({ min:2 }).withMessage('Nombre mínimo 2 caracteres'),
    body('code').trim().isLength({ min:1, max:10 }).withMessage('Código requerido (máx 10 chars)'),
    body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color en formato #RRGGBB'),
    body('icon').optional().isString(),
    body('priority_order').optional().isInt({ min:1 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { floor_id, name, code, color = '#3B82F6', icon = '🏥', priority_order = 99 } = req.body;

      // Verificar código único
      const { rows: existing } = await pgPool.query(
        'SELECT id FROM services WHERE code = $1', [code.toUpperCase()]
      );
      if (existing.length) {
        return res.status(409).json({ error: `Código ${code} ya existe`, code: 'CODE_EXISTS' });
      }

      const { rows } = await pgPool.query(
        `INSERT INTO services (floor_id, name, code, color, icon, priority_order)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [floor_id, name, code.toUpperCase(), color, icon, priority_order]
      );
      invalidateCache();
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/config/services/:id
router.put('/services/:id',
  requireManager,
  [ param('id').isInt() ],
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!req.user.permissions?.all && parseInt(req.user.service_id) !== parseInt(id)) {
        return res.status(403).json({ error: 'Solo puedes editar tu propio servicio' });
      }

      const allowed = ['name','color','icon','priority_order','active'];
      if (req.user.permissions?.all) allowed.push('floor_id','code');

      const updates = [];
      const values  = [];
      let   idx     = 1;

      allowed.forEach(f => {
        if (req.body[f] !== undefined) {
          updates.push(`${f} = $${idx++}`);
          values.push(req.body[f]);
        }
      });

      if (!updates.length) return res.status(400).json({ error: 'Sin cambios' });

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const { rows } = await pgPool.query(
        `UPDATE services SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
        values
      );

      if (!rows.length) return res.status(404).json({ error: 'Servicio no encontrado' });

      invalidateCache();
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ─── CONSULTORIOS / VENTANILLAS ───────────────────────────────

// POST /api/config/boxes
router.post('/boxes',
  requireManager,
  [
    body('service_id').isInt().withMessage('Servicio requerido'),
    body('name').trim().isLength({ min:1 }).withMessage('Nombre requerido'),
    body('type').isIn(['box','ventanilla','sala','otro']).withMessage('Tipo inválido'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { service_id, name, type } = req.body;

      if (!req.user.permissions?.all && parseInt(req.user.service_id) !== parseInt(service_id)) {
        return res.status(403).json({ error: 'Solo puedes gestionar tu propio servicio' });
      }

      const { rows } = await pgPool.query(
        `INSERT INTO boxes (service_id, name, type) VALUES ($1,$2,$3) RETURNING *`,
        [service_id, name, type]
      );
      invalidateCache();
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/config/boxes/:id
router.put('/boxes/:id',
  requireManager,
  [ param('id').isInt() ],
  validate,
  async (req, res, next) => {
    try {
      const { updates, values, idx } = buildUpdate(
        ['name','type','active'], req.body
      );
      if (!updates.length) return res.status(400).json({ error: 'Sin cambios' });
      values.push(req.params.id);
      const { rows } = await pgPool.query(
        `UPDATE boxes SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
        values
      );
      if (!rows.length) return res.status(404).json({ error: 'Consultorio no encontrado' });
      invalidateCache();
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ─── ASIGNACIÓN DE PERSONAL A CONSULTORIO ─────────────────────

// POST /api/config/boxes/:id/assign — asignar personal al consultorio
router.post('/boxes/:id/assign',
  requireManager,
  [
    param('id').isInt(),
    body('staff_id').isInt().withMessage('Personal requerido'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { staff_id } = req.body;

      const { rows: staffRows } = await pgPool.query(
        'SELECT id, name, role FROM staff WHERE id=$1 AND active=true', [staff_id]
      );
      if (!staffRows.length) return res.status(404).json({ error: 'Personal no encontrado' });

      const { rows: existing } = await pgPool.query(
        `SELECT b.name AS box_name, s.name AS service_name
         FROM boxes b
         JOIN services s ON s.id = b.service_id
         WHERE b.current_staff_id = $1 AND b.id != $2 AND b.active = true`,
        [staff_id, id]
      );

      if (existing.length) {
        return res.status(409).json({
          error: `${staffRows[0].name} ya está asignado a ${existing[0].box_name} (${existing[0].service_name})`,
          code:  'STAFF_ALREADY_ASSIGNED',
        });
      }

      const { rows } = await pgPool.query(
        `UPDATE boxes SET current_staff_id = $1 WHERE id = $2
         RETURNING *, (SELECT name FROM staff WHERE id=$1) AS staff_name`,
        [staff_id, id]
      );

      await pgPool.query(
        `INSERT INTO box_staff_history (box_id, staff_id, assigned_at)
         VALUES ($1,$2,NOW())`,
        [id, staff_id]
      );

      invalidateCache();
      res.json({
        success: true,
        box: rows[0],
        message: `${staffRows[0].name} asignado correctamente`,
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/config/boxes/:id/assign — desasignar personal
router.delete('/boxes/:id/assign',
  requireManager,
  [ param('id').isInt() ],
  validate,
  async (req, res, next) => {
    try {
      await pgPool.query(
        `UPDATE box_staff_history SET unassigned_at = NOW()
         WHERE box_id=$1 AND unassigned_at IS NULL`,
        [req.params.id]
      );

      const { rows } = await pgPool.query(
        `UPDATE boxes SET current_staff_id = NULL WHERE id=$1 RETURNING *`,
        [req.params.id]
      );

      invalidateCache();
      res.json({ success: true, box: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// ─── HISTORIAL DE ASIGNACIONES ────────────────────────────────
router.get('/boxes/:id/history',
  requireManager,
  async (req, res, next) => {
    try {
      const { rows } = await pgPool.query(
        `SELECT h.*, s.name AS staff_name, s.role
         FROM box_staff_history h
         JOIN staff s ON s.id = h.staff_id
         WHERE h.box_id = $1
         ORDER BY h.assigned_at DESC LIMIT 50`,
        [req.params.id]
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

// ─── SISTEMA: TODOS LOS BOXES ──────────────────────────────────
router.get('/all-boxes', async (req, res, next) => {
  try {
    const { rows } = await pgPool.query(
      `SELECT b.*, s.name AS service_name, s.code AS service_code,
              st.name AS staff_name, st.role AS staff_role
       FROM boxes b
       JOIN services s ON s.id = b.service_id
       LEFT JOIN staff st ON st.id = b.current_staff_id
       ORDER BY s.name, b.name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ─── SISTEMA: CONFIG SISTEMA ──────────────────────────────────
router.get('/system', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pgPool.query(
      'SELECT key, value FROM system_config ORDER BY key'
    );
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
  } catch (err) { next(err); }
});

router.put('/system', requireAdmin, async (req, res, next) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key requerida', code: 'VALIDATION_ERROR' });
    await pgPool.query(
      `INSERT INTO system_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, String(value)]
    );
    invalidateCache();
    res.json({ success: true, key, value });
  } catch (err) { next(err); }
});

// ─── ESTABLECIMIENTOS: UPDATE ─────────────────────────────────
router.put('/establishments/:id',
  requireAdmin,
  [ param('id').isInt() ],
  validate,
  async (req, res, next) => {
    try {
      const { updates, values, idx } = buildUpdate(
        ['name','address','phone','active'], req.body
      );
      if (!updates.length) return res.status(400).json({ error: 'Sin cambios' });
      updates.push('updated_at = NOW()');
      values.push(req.params.id);
      const { rows } = await pgPool.query(
        `UPDATE establishments SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
        values
      );
      if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
      invalidateCache();
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);

// ─── CONFIGURACIÓN DE PANTALLAS DIGITALES ─────────────────────
router.get('/display-configs', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pgPool.query(
      'SELECT * FROM display_configs ORDER BY name'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/display-configs', requireAdmin, async (req, res, next) => {
  try {
    const { name, slug, service_ids = [] } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Nombre y slug requeridos' });
    const { rows } = await pgPool.query(
      `INSERT INTO display_configs (name, slug, service_ids) VALUES ($1,$2,$3) RETURNING *`,
      [name, slug, service_ids]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/display-configs/:id', requireAdmin, async (req, res, next) => {
  try {
    const { updates, values, idx } = buildUpdate(
      ['name','slug','service_ids','active','layout','background_image'], req.body
    );
    if (!updates.length) return res.status(400).json({ error: 'Sin cambios' });
    values.push(req.params.id);
    const { rows } = await pgPool.query(
      `UPDATE display_configs SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/config/display-configs/:id/upload — subir imagen de fondo
router.post('/display-configs/:id/upload', requireAdmin, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo no subido o formato no válido (jpg/png/gif/webp/svg)' });
    const imageUrl = `/uploads/displays/${req.file.filename}`;
    const { rows } = await pgPool.query(
      `UPDATE display_configs SET background_image=$1 WHERE id=$2 RETURNING *`,
      [imageUrl, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Multer para banner/video (imágenes + MP4, 20MB)
const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'displays', 'media');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `media-${req.params.id}-${Date.now()}${ext}`);
  },
});
const mediaUpload = multer({
  storage: mediaStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// POST /api/config/display-configs/:id/upload-media — subir banner/video
router.post('/display-configs/:id/upload-media', requireAdmin, mediaUpload.single('media'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo no subido o formato no válido (jpg/png/gif/webp/svg/mp4)' });
    const mediaUrl = `/uploads/displays/media/${req.file.filename}`;
    res.json({ url: mediaUrl });
  } catch (err) { next(err); }
});

// GET /api/config/display/:slug — datos para una pantalla específica
router.get('/display/:slug', async (req, res, next) => {
  try {
    const { rows } = await pgPool.query(
      'SELECT * FROM display_configs WHERE slug=$1 AND active=true',
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pantalla no encontrada' });

    const config = rows[0];
    const svcRows = config.service_ids?.length
      ? (await pgPool.query(
          `SELECT id, name, code, color, icon FROM services WHERE id = ANY($1) AND active=true`,
          [config.service_ids]
        )).rows
      : [];

    res.json({ ...config, services: svcRows });
  } catch (err) { next(err); }
});

// ─── CONFIGURACIÓN DE KIOSKOS ─────────────────────────────────
router.get('/kiosk-configs', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pgPool.query(
      'SELECT * FROM kiosk_configs ORDER BY name'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/kiosk-configs', requireAdmin, async (req, res, next) => {
  try {
    const { name, slug, service_ids = [] } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Nombre y slug requeridos' });
    const { rows } = await pgPool.query(
      `INSERT INTO kiosk_configs (name, slug, service_ids) VALUES ($1,$2,$3) RETURNING *`,
      [name, slug, service_ids]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/kiosk-configs/:id', requireAdmin, async (req, res, next) => {
  try {
    const { updates, values, idx } = buildUpdate(
      ['name','slug','service_ids','active'], req.body
    );
    if (!updates.length) return res.status(400).json({ error: 'Sin cambios' });
    values.push(req.params.id);
    const { rows } = await pgPool.query(
      `UPDATE kiosk_configs SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/config/kiosk/:slug — datos para un kiosko específico
router.get('/kiosk/:slug', async (req, res, next) => {
  try {
    const { rows } = await pgPool.query(
      'SELECT * FROM kiosk_configs WHERE slug=$1 AND active=true',
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Kiosko no encontrado' });

    const config = rows[0];
    const svcRows = config.service_ids?.length
      ? (await pgPool.query(
          `SELECT id, name, code, color, icon FROM services WHERE id = ANY($1) AND active=true`,
          [config.service_ids]
        )).rows
      : [];

    res.json({ ...config, services: svcRows });
  } catch (err) { next(err); }
});

return router;
};

// ─── MIGRACIONES SQL ──────────────────────────────────────────
/*
-- Agregar a migrations/init.sql:

CREATE TABLE IF NOT EXISTS establishments (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  address     TEXT,
  phone       VARCHAR(50),
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS floors (
  id                SERIAL PRIMARY KEY,
  establishment_id  INT NOT NULL REFERENCES establishments(id),
  name              VARCHAR(100) NOT NULL,  -- "Piso 1", "Ala Norte", "Urgencias"
  description       TEXT,
  order_index       INT DEFAULT 0,
  active            BOOLEAN DEFAULT true,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id              SERIAL PRIMARY KEY,
  floor_id        INT NOT NULL REFERENCES floors(id),
  name            VARCHAR(100) NOT NULL,
  code            VARCHAR(10)  NOT NULL UNIQUE,  -- "TRI", "FAR", "LAB"
  color           VARCHAR(7)   DEFAULT '#3B82F6',
  icon            VARCHAR(10)  DEFAULT '🏥',
  priority_order  INT DEFAULT 99,   -- menor = más prioritario en UI
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS boxes (
  id                SERIAL PRIMARY KEY,
  service_id        INT NOT NULL REFERENCES services(id),
  name              VARCHAR(100) NOT NULL,    -- "Box 1", "Ventanilla 3", "Sala 2B"
  type              VARCHAR(50) DEFAULT 'box',-- box | ventanilla | sala | otro
  active            BOOLEAN DEFAULT true,
  current_staff_id  INT REFERENCES staff(id),
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS box_staff_history (
  id             SERIAL PRIMARY KEY,
  box_id         INT NOT NULL REFERENCES boxes(id),
  staff_id       INT NOT NULL REFERENCES staff(id),
  assigned_at    TIMESTAMP DEFAULT NOW(),
  unassigned_at  TIMESTAMP
);

-- Índices
CREATE INDEX idx_floors_establishment   ON floors(establishment_id);
CREATE INDEX idx_services_floor         ON services(floor_id);
CREATE INDEX idx_boxes_service          ON boxes(service_id);
CREATE INDEX idx_boxes_staff            ON boxes(current_staff_id);
CREATE INDEX idx_box_history_box        ON box_staff_history(box_id);

-- Actualizar tabla staff para vincular a servicio
ALTER TABLE staff ADD COLUMN IF NOT EXISTS service_id INT REFERENCES services(id);

-- Datos iniciales (personalizar en admin)
INSERT INTO establishments (name, address) VALUES
  ('Mi Centro Médico', 'Dirección del establecimiento');

INSERT INTO floors (establishment_id, name, description, order_index) VALUES
  (1, 'Urgencias',   'Planta baja — acceso principal', 0),
  (1, 'Piso 1',      'Consultas ambulatorias',         1),
  (1, 'Piso 2',      'Especialidades',                 2),
  (1, 'Laboratorio', 'Sector laboratorio y rayos X',   3);

INSERT INTO services (floor_id, name, code, color, icon, priority_order) VALUES
  (1, 'Triage',      'TRI', '#EF4444', '🚨', 1),
  (2, 'Consultoría', 'CON', '#3B82F6', '👨‍⚕️', 2),
  (4, 'Laboratorio', 'LAB', '#F59E0B', '🧪', 3),
  (4, 'Rayos X',     'RAY', '#8B5CF6', '🔬', 4),
  (2, 'Farmacia',    'FAR', '#10B981', '💊', 5);

INSERT INTO boxes (service_id, name, type) VALUES
  (1, 'Box 1',        'box'),
  (1, 'Box 2',        'box'),
  (2, 'Consultorio 1','box'),
  (2, 'Consultorio 2','box'),
  (2, 'Consultorio 3','box'),
  (3, 'Mesón 1',      'ventanilla'),
  (3, 'Mesón 2',      'ventanilla'),
  (4, 'Sala Rayos X', 'sala'),
  (5, 'Ventanilla 1', 'ventanilla'),
  (5, 'Ventanilla 2', 'ventanilla');
*/