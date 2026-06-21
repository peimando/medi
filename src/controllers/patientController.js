const pool = require('../database/pool');
const jwt = require('jsonwebtoken');
const { AppError, Errors } = require('../errors/AppError');
const cfg = require('../config/loader');
const logger = require('../config/logger');
const QueueService = require('../services/queueService');

async function register(req, res, next) {
  try {
    const io = req.app.get('io');
    const { name, phone, serviceId, type, smsConsent, documentType, documentNumber } = req.body;
    if (phone && !smsConsent)
      return next(Errors.SMS_CONSENT_REQUIRED());

    const qs = new QueueService(pool, io, cfg);
    const result = await qs.register({
      name: name.trim(), phone: phone || null,
      serviceId: parseInt(serviceId), typeCode: type,
      smsConsent: !!smsConsent,
      documentType: documentType || null,
      documentNumber: documentNumber || null,
    });

    const accessToken = jwt.sign(
      { patientId: result.id, type: 'track' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    await req.audit({
      action: 'PATIENT_REGISTERED',
      entityType: 'PATIENT',
      entityId: result.id,
      newData: { ticketCode: result.ticket_code, serviceId, name: name.trim(), type },
    }).catch(err => logger.error('Error en auditoría registro paciente', { error: err.message }));

    res.status(201).json({
      success: true,
      patient: {
        id:            result.id,
        ticketCode:    result.ticket_code,
        service:       result.service.name,
        serviceColor:  result.service.color,
        serviceIcon:   result.service.icon,
        estimatedWait: result.estimatedWait,
        accessToken:   accessToken,
      },
    });
  } catch (err) { next(err); }
}

async function getTicket(req, res, next) {
  try {
    const io = req.app.get('io');
    const qs = new QueueService(pool, io, cfg);
    const ticket = await qs.getTicketStatus(req.params.code);
    if (!ticket) return next(Errors.NOT_FOUND('Ticket'));
    res.json({
      id: ticket.id,
      ticketCode: ticket.ticket_code,
      status: ticket.status,
      arrivalTime: ticket.arrival_time,
      calledAt: ticket.called_at,
      serviceId: ticket.service_id,
      serviceName: ticket.service_name,
      serviceColor: ticket.service_color,
      serviceIcon: ticket.service_icon,
      boxName: ticket.box_name,
      typeLabel: ticket.type_label,
      typeColor: ticket.type_color,
      positionInQueue: ticket.position_in_queue,
    });
  } catch (err) { next(err); }
}

module.exports = { register, getTicket };
