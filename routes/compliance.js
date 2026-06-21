// routes/compliance.js — ARCO: Acceso, Rectificación, Cancelación, Oposición
// Ley 21.719 (Chile) — Protección de Datos Personales
const express = require('express');
const rateLimit = require('express-rate-limit');
const { AppError } = require('../src/errors/AppError');

module.exports = function complianceRoutes(pgPool) {
const router  = express.Router();

// Rate limit: máx 10 requests por IP cada 15 min en endpoints públicos
const complianceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.', code: 'RATE_LIMITED' },
  standardHeaders: true,
});

// Aplica rate limiter a todos los endpoints de compliance
router.use(complianceLimiter);

// GET /api/compliance/my-data?phone=+56911111111
// Permite al paciente ver sus datos (enmascarados)
router.get('/my-data', async (req, res, next) => {
  try {
    const { phone } = req.query;
    if (!phone) return next(new AppError('Teléfono requerido', 400, 'VALIDATION_ERROR'));

    const { rows } = await pgPool.query(
      `SELECT p.id, p.ticket_code, p.status, p.arrival_time,
              p.completion_time, s.name AS service,
              -- teléfono enmascarado: +569****11
              REGEXP_REPLACE(p.phone, '(\\+\\d{3})(\\d+)(\\d{2})', '\\1****\\3') AS phone_masked
       FROM patients p
       JOIN services s ON s.id = p.service_id
       WHERE p.phone = $1
       ORDER BY p.arrival_time DESC LIMIT 20`,
      [phone]
    );

    res.json({
      records:    rows,
      legal_basis: 'Ley 21.719 — Protección de Datos Personales (Chile)',
      note:       'Los datos son usados exclusivamente para gestión de turnos hospitalarios.',
    });
  } catch (err) { next(err); }
});

// DELETE /api/compliance/my-data — Derecho de cancelación (anonimización)
// NO hace DELETE físico — preserva integridad estadística
router.delete('/my-data', async (req, res, next) => {
  try {
    const { phone, reason } = req.body;
    if (!phone) return next(new AppError('Teléfono requerido', 400, 'VALIDATION_ERROR'));

    const { rows } = await pgPool.query(
      `UPDATE patients
       SET name='ANONIMIZADO', phone=NULL, sms_consent=false, updated_at=NOW()
       WHERE phone=$1
       RETURNING id, ticket_code`,
      [phone]
    );

    if (!rows.length) {
      return next(new AppError('No se encontraron datos para ese teléfono', 404, 'NOT_FOUND'));
    }

    await req.audit({
      action: 'ARCO_CANCELLATION',
      entityType: 'PATIENT',
      newData: { phoneHash: phone.slice(-4), reason, recordsAffected: rows.length },
    }).catch(() => {});

    res.json({
      success:  true,
      message:  `Datos anonimizados. ${rows.length} registro(s) afectado(s).`,
      legal:    'Solicitud procesada conforme a Ley 21.719',
    });
  } catch (err) { next(err); }
});

// GET /api/compliance/export?phone=+56911111111 — Portabilidad de datos
router.get('/export', async (req, res, next) => {
  try {
    const { phone } = req.query;
    if (!phone) return next(new AppError('Teléfono requerido', 400, 'VALIDATION_ERROR'));

    const { rows } = await pgPool.query(
      `SELECT p.ticket_code, p.status, p.arrival_time,
              p.completion_time, s.name AS service,
              pt.label AS patient_type, p.sms_consent
       FROM patients p
       JOIN services s ON s.id=p.service_id
       LEFT JOIN patient_types pt ON pt.id=p.patient_type_id
       WHERE p.phone=$1 ORDER BY p.arrival_time DESC`,
      [phone]
    );

    res.set({
      'Content-Disposition': `attachment; filename="mis-datos-hospital-${Date.now()}.json"`,
      'Content-Type':        'application/json',
    });

    res.json({
      exported_at:  new Date().toISOString(),
      legal_basis:  'Ley 21.719 — Art. 16 Derecho de Portabilidad',
      records:      rows,
      total:        rows.length,
    });
  } catch (err) { next(err); }
});

return router;
};
