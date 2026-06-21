const pool = require('../database/pool');
const { AppError, Errors } = require('../errors/AppError');
const cfg = require('../config/loader');
const QueueService = require('../services/queueService');

async function resolveService(serviceId) {
  const cached = cfg.getServiceById(serviceId);
  if (cached) return cached;

  const { rows } = await pool.query(
    `SELECT id, name, code, color, icon
     FROM services
     WHERE id=$1 AND active=true`,
    [serviceId]
  );
  return rows[0] || null;
}

async function getQueue(req, res, next) {
  const isPublic = req._publicQueueView;
  try {
    if (!isPublic) ensureServiceAccess(req.user, req.params.serviceId);

    const service = await resolveService(req.params.serviceId);
    if (!service) return next(Errors.INVALID_SERVICE(req.params.serviceId));

    const selectCols = isPublic
      ? `p.id, p.ticket_code, p.priority, p.status,
         p.arrival_time, p.called_at,
         pt.label AS type_label, pt.color AS type_color, pt.icon AS type_icon,
         b.name AS box_name,
         EXTRACT(EPOCH FROM (NOW()-p.arrival_time))/60 AS wait_minutes`
      : `p.id, p.ticket_code, p.name, p.priority, p.status,
         p.arrival_time, p.called_at,
         pt.label AS type_label, pt.color AS type_color, pt.icon AS type_icon,
         b.name AS box_name,
         EXTRACT(EPOCH FROM (NOW()-p.arrival_time))/60 AS wait_minutes`;

    const { rows } = await pool.query(
      `SELECT ${selectCols}
       FROM patients p
       LEFT JOIN patient_types pt ON pt.id=p.patient_type_id
       LEFT JOIN boxes b          ON b.id=p.box_id
       WHERE p.service_id=$1 AND p.status IN ('waiting','serving')
       ORDER BY CASE p.status WHEN 'serving' THEN 0 ELSE 1 END,
                p.priority ASC, p.arrival_time ASC`,
      [service.id]
    );
    const queue = rows.map(r => {
      const item = {
        id: r.id,
        ticketCode: r.ticket_code,
        priority: r.priority,
        status: r.status,
        arrivalTime: r.arrival_time,
        calledAt: r.called_at,
        typeLabel: r.type_label,
        typeColor: r.type_color,
        typeIcon: r.type_icon,
        boxName: r.box_name,
        waitMinutes: Math.round(r.wait_minutes),
      };
      if (!isPublic) item.name = r.name;
      return item;
    });
    res.json({ service: service.name, serviceId: service.id, queue });
  } catch (err) { next(err); }
}

function ensureServiceAccess(user, serviceId) {
  if (user.permissions?.all) return;
  if (parseInt(user.service_id) !== parseInt(serviceId)) {
    throw Errors.WRONG_SERVICE();
  }
}

async function callNext(req, res, next) {
  try {
    ensureServiceAccess(req.user, req.params.serviceId);
    const io = req.app.get('io');
    const qs = new QueueService(pool, io, cfg);
    const result = await qs.callNext({
      serviceId: parseInt(req.params.serviceId),
      staffId:   req.user.id,
    });
    if (result.patient) {
      await req.audit({
        action: 'PATIENT_CALLED',
        entityType: 'PATIENT',
        entityId: result.patient.id,
        newData: { ticketCode: result.patient.ticket_code, box: result.box?.name, serviceId: req.params.serviceId },
        oldData: { status: 'waiting' },
      }).catch(() => {});
    }
    res.json({ success: true, patient: result.patient, box: result.box });
  } catch (err) { next(err); }
}

function getQueuePublic(req, res, next) {
  req._publicQueueView = true;
  getQueue(req, res, next);
}

async function complete(req, res, next) {
  try {
    ensureServiceAccess(req.user, req.params.serviceId);
    const io = req.app.get('io');
    const qs = new QueueService(pool, io, cfg);
    const result = await qs.complete({
      serviceId: parseInt(req.params.serviceId),
      patientId: parseInt(req.params.patientId),
      staffId:   req.user.id,
    });
    await req.audit({
      action: 'PATIENT_COMPLETED',
      entityType: 'PATIENT',
      entityId: req.params.patientId,
      newData: { ticketCode: result?.ticket_code, serviceId: req.params.serviceId },
      oldData: { status: 'serving' },
    }).catch(() => {});
    res.json({ success: true, patient: result });
  } catch (err) { next(err); }
}

async function markAbsent(req, res, next) {
  try {
    ensureServiceAccess(req.user, req.params.serviceId);
    const io = req.app.get('io');
    const qs = new QueueService(pool, io, cfg);
    const result = await qs.markAbsent({
      serviceId: parseInt(req.params.serviceId),
      patientId: parseInt(req.params.patientId),
      staffId:   req.user.id,
    });
    await req.audit({
      action: 'PATIENT_ABSENT',
      entityType: 'PATIENT',
      entityId: req.params.patientId,
      newData: { ticketCode: result?.ticket_code, serviceId: req.params.serviceId },
      oldData: { status: 'serving' },
    }).catch(() => {});
    res.json({ success: true, patient: result });
  } catch (err) { next(err); }
}

async function transfer(req, res, next) {
  try {
    ensureServiceAccess(req.user, req.body.fromService);
    const io = req.app.get('io');
    const { fromService, toService } = req.body;

    const qs = new QueueService(pool, io, cfg);
    const result = await qs.transfer({
      fromServiceId: parseInt(fromService),
      toServiceId:   parseInt(toService),
      patientId:     parseInt(req.params.patientId),
      staffId:       req.user.id,
    });
    await req.audit({
      action: 'PATIENT_TRANSFERRED',
      entityType: 'PATIENT',
      entityId: req.params.patientId,
      oldData: { serviceId: fromService },
      newData: { serviceId: toService },
    }).catch(() => {});
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

module.exports = { getQueue, getQueuePublic, callNext, complete, markAbsent, transfer };
