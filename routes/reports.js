const express = require('express');
const { AppError, Errors } = require('../src/errors/AppError');
const logger = require('../src/config/logger');

module.exports = function reportsRoutes(pgPool) {
const router  = express.Router();

// GET /api/reports/patients — reportería por documento
// Query params: document_type, document_number, from, to, service_id, status, limit, offset
router.get('/patients', async (req, res, next) => {
  try {
    const { document_type, document_number, from, to, service_id, status, limit = 500, offset = 0 } = req.query;

    const conditions = [];
    const params = [];

    if (document_type) {
      params.push(document_type);
      conditions.push(`p.document_type = $${params.length}`);
    }
    if (document_number) {
      params.push(document_number);
      conditions.push(`p.document_number = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`p.arrival_time >= $${params.length}::timestamp`);
    }
    if (to) {
      params.push(to);
      conditions.push(`p.arrival_time <= $${params.length}::timestamp`);
    }
    if (service_id) {
      params.push(parseInt(service_id));
      conditions.push(`p.service_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await pgPool.query(
      `SELECT COUNT(*) FROM patients p ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit));
    params.push(parseInt(offset));

    const { rows } = await pgPool.query(
      `SELECT p.id, p.ticket_code, p.name, p.phone,
              p.document_type, p.document_number,
              p.service_id, s.name AS service_name, s.color AS service_color,
              p.patient_type_id, pt.label AS type_label,
              p.status,
              p.arrival_time, p.called_at, p.completion_time,
              p.box_id, b.name AS box_name,
              p.priority, p.sms_consent
       FROM patients p
       LEFT JOIN services s      ON s.id = p.service_id
       LEFT JOIN boxes b         ON b.id = p.box_id
       LEFT JOIN patient_types pt ON pt.id = p.patient_type_id
       ${whereClause}
       ORDER BY p.arrival_time DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, total, limit: +limit, offset: +offset, rows });
  } catch (err) { next(err); }
});

// GET /api/reports/patients/export — export CSV
router.get('/patients/export', async (req, res, next) => {
  try {
    const { document_type, document_number, from, to, service_id, status } = req.query;

    const conditions = [];
    const params = [];

    if (document_type) {
      params.push(document_type);
      conditions.push(`p.document_type = $${params.length}`);
    }
    if (document_number) {
      params.push(document_number);
      conditions.push(`p.document_number = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`p.arrival_time >= $${params.length}::timestamp`);
    }
    if (to) {
      params.push(to);
      conditions.push(`p.arrival_time <= $${params.length}::timestamp`);
    }
    if (service_id) {
      params.push(parseInt(service_id));
      conditions.push(`p.service_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await pgPool.query(
      `SELECT p.ticket_code,
              p.document_type, p.document_number,
              s.name AS service_name,
              pt.label AS type_label,
              p.status,
              p.arrival_time, p.called_at, p.completion_time,
              b.name AS box_name,
              p.sms_consent
       FROM patients p
       LEFT JOIN services s      ON s.id = p.service_id
       LEFT JOIN boxes b         ON b.id = p.box_id
       LEFT JOIN patient_types pt ON pt.id = p.patient_type_id
       ${whereClause}
       ORDER BY p.arrival_time DESC`,
      params
    );

    const header = 'Ticket,Documento Tipo,Documento Número,Servicio,Tipo Consulta,Estado,Llegada,Llamado,Completado,Box,SMS Consent';
    const escape = v => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map(r => [
      escape(r.ticket_code), escape(r.document_type), escape(r.document_number),
      escape(r.service_name), escape(r.type_label), escape(r.status),
      escape(r.arrival_time), escape(r.called_at), escape(r.completion_time),
      escape(r.box_name), escape(r.sms_consent ? 'Sí' : 'No')
    ].join(','));

    const csv = '\uFEFF' + header + '\n' + lines.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_pacientes.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

return router;
};
