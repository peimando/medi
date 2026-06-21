// src/services/queueService.js — Transacciones + SKIP LOCKED
const { Errors } = require('../errors/AppError');
const logger = require('../config/logger');

class QueueService {
  constructor(pgPool, io, cfg) {
    this.pgPool = pgPool;
    this.io     = io;
    this.cfg    = cfg;
  }

  async register({ name, phone, serviceId, typeCode, smsConsent, documentType, documentNumber }) {
    const service     = this.cfg.getServiceById(serviceId);
    const patientType = this.cfg.getTypeByCode(typeCode);
    if (!service)     throw Errors.INVALID_SERVICE(serviceId);
    if (!patientType) throw Errors.INVALID_TYPE(typeCode);

    const client = await this.pgPool.connect();
    try {
      await client.query('BEGIN');

      const ticketCode = await this.cfg.generateTicket(client, serviceId);

      const { rows } = await client.query(
        `INSERT INTO patients
           (ticket_code, name, phone, service_id, patient_type_id,
            priority, status, arrival_time, sms_consent,
            document_type, document_number)
         VALUES ($1,$2,$3,$4,$5,$6,'waiting',NOW(),$7,$8,$9)
         RETURNING id, ticket_code`,
        [ticketCode, name, smsConsent ? phone : null,
         serviceId, patientType.id, patientType.priority, smsConsent ?? false,
         documentType || null, documentNumber || null]
      );

      await client.query('COMMIT');

      const patient      = rows[0];
      const estimatedWait = await this.cfg.estimateWaitMinutes(this.pgPool, serviceId);

      this.io.to(`service:${serviceId}`).emit('queue_updated', { serviceId });

      return { ...patient, estimatedWait, service };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // SKIP LOCKED: dos staff que presionen simultáneamente nunca obtienen el mismo paciente
  async callNext({ serviceId, staffId }) {
    const service = this.cfg.getServiceById(serviceId);
    if (!service) throw Errors.INVALID_SERVICE(serviceId);

    const client = await this.pgPool.connect();
    try {
      await client.query('BEGIN');

      const { rows: queue } = await client.query(
        `SELECT id, ticket_code, name, phone
         FROM patients
         WHERE service_id = $1 AND status = 'waiting'
         ORDER BY priority ASC, arrival_time ASC
         LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [serviceId]
      );

      if (!queue.length) {
        await client.query('ROLLBACK');
        throw Errors.QUEUE_EMPTY(service.name);
      }

      const patient = queue[0];

      const { rows: boxRows } = await client.query(
        `SELECT id, name FROM boxes
         WHERE current_staff_id = $1 AND active = true LIMIT 1`,
        [staffId]
      );
      const box = boxRows[0] || null;

      await client.query(
        `UPDATE patients
         SET status='serving', box_id=$1, called_at=NOW(), called_by=$2, updated_at=NOW()
         WHERE id=$3`,
        [box?.id ?? null, staffId, patient.id]
      );

      await client.query('COMMIT');

      const boxLabel = box?.name ?? service.name;
      this.io.to(`service:${serviceId}`).emit('patient_called', {
        ticketCode: patient.ticket_code, box: boxLabel,
      });
      this.io.to(`patient:${patient.id}`).emit('your_turn', {
        ticketCode: patient.ticket_code, box: boxLabel,
      });

      // SMS "es tu turno"
      if (patient.phone) {
        const smsBody = this.cfg.renderSMS('your_turn', {
          ticket: patient.ticket_code, box: boxLabel,
        });
        if (smsBody) logger.info(`[SMS] → ${patient.phone}: ${smsBody}`);
      }

      return { patient, box };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async reCall({ serviceId, staffId }) {
    const service = this.cfg.getServiceById(serviceId);
    if (!service) throw Errors.INVALID_SERVICE(serviceId);

    const { rows } = await this.pgPool.query(
      `SELECT id, ticket_code, name, phone
       FROM patients
       WHERE service_id = $1 AND status = 'serving' AND called_by = $2
       ORDER BY called_at DESC LIMIT 1`,
      [serviceId, staffId]
    );
    if (!rows.length) throw Errors.NO_PATIENT_SERVING();

    const patient = rows[0];
    const { rows: boxRows } = await this.pgPool.query(
      `SELECT id, name FROM boxes
       WHERE current_staff_id = $1 AND active = true LIMIT 1`,
      [staffId]
    );
    const box = boxRows[0] || null;
    const boxLabel = box?.name ?? service.name;

    this.io.to(`service:${serviceId}`).emit('patient_called', {
      ticketCode: patient.ticket_code, box: boxLabel,
    });
    this.io.to(`patient:${patient.id}`).emit('your_turn', {
      ticketCode: patient.ticket_code, box: boxLabel,
    });

    await this.pgPool.query(
      'UPDATE patients SET called_at=NOW(), updated_at=NOW() WHERE id=$1',
      [patient.id]
    );

    if (patient.phone) {
      const smsBody = this.cfg.renderSMS('your_turn', {
        ticket: patient.ticket_code, box: boxLabel,
      });
      if (smsBody) logger.info(`[SMS] → ${patient.phone}: ${smsBody}`);
    }

    return { patient, box };
  }

  async complete({ serviceId, patientId, staffId }) {
    const client = await this.pgPool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT id, ticket_code FROM patients
         WHERE id=$1 AND service_id=$2 AND status='serving' AND called_by=$3
         FOR UPDATE`,
        [patientId, serviceId, staffId]
      );
      if (!rows.length) throw Errors.NO_PATIENT_SERVING();

      await client.query(
        `UPDATE patients
         SET status='completed', completion_time=NOW(), updated_at=NOW()
         WHERE id=$1`,
        [patientId]
      );

      await client.query('COMMIT');
      this.io.to(`service:${serviceId}`).emit('queue_updated', { serviceId });
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async markAbsent({ serviceId, patientId, staffId }) {
    const client = await this.pgPool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT id, ticket_code FROM patients
         WHERE id=$1 AND service_id=$2 AND status='serving' AND called_by=$3
         FOR UPDATE`,
        [patientId, serviceId, staffId]
      );
      if (!rows.length) throw Errors.NO_PATIENT_SERVING();

      await client.query(
        `UPDATE patients SET status='absent', updated_at=NOW() WHERE id=$1`,
        [patientId]
      );
      await client.query('COMMIT');

      // Re-encolar automáticamente si está configurado
      const requeueMin = this.cfg.getSysInt('absent_requeue_minutes') || 0;
      if (requeueMin > 0) {
        setTimeout(async () => {
          await this.pgPool.query(
            `UPDATE patients
             SET status='waiting', box_id=NULL, called_at=NULL, called_by=NULL
             WHERE id=$1 AND status='absent'`,
            [patientId]
          );
          this.io.to(`service:${serviceId}`).emit('queue_updated', { serviceId });
        }, requeueMin * 60 * 1000);
      }

      this.io.to(`service:${serviceId}`).emit('queue_updated', { serviceId });
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async transfer({ fromServiceId, toServiceId, patientId, staffId }) {
    const toService = this.cfg.getServiceById(toServiceId);
    if (!toService) throw Errors.INVALID_SERVICE(toServiceId);

    const client = await this.pgPool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT id, ticket_code FROM patients
         WHERE id=$1 AND service_id=$2 AND status='serving' AND called_by=$3
         FOR UPDATE`,
        [patientId, fromServiceId, staffId]
      );
      if (!rows.length) throw Errors.NO_PATIENT_SERVING();

      const newCode = await this.cfg.generateTicket(client, toServiceId);

      await client.query(
        `UPDATE patients
         SET service_id=$1, ticket_code=$2, status='waiting',
             box_id=NULL, called_at=NULL, called_by=NULL, updated_at=NOW()
         WHERE id=$3`,
        [toServiceId, newCode, patientId]
      );
      await client.query('COMMIT');

      this.io.to(`service:${fromServiceId}`).emit('queue_updated', { serviceId: fromServiceId });
      this.io.to(`service:${toServiceId}`).emit('queue_updated', { serviceId: toServiceId });

      return { ...rows[0], newCode, toService: toService.name };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Estado público de un ticket (para URL de seguimiento del paciente)
  async getTicketStatus(ticketCode) {
    const { rows } = await this.pgPool.query(
      `SELECT p.id, p.ticket_code, p.status, p.arrival_time, p.called_at,
              p.service_id, s.name AS service_name, s.color AS service_color,
              s.icon AS service_icon, b.name AS box_name,
              pt.label AS type_label, pt.color AS type_color,
              (SELECT COUNT(*) FROM patients p2
               WHERE p2.service_id=p.service_id AND p2.status='waiting'
                 AND (p2.priority < p.priority
                      OR (p2.priority=p.priority AND p2.arrival_time < p.arrival_time))
              ) AS position_in_queue
       FROM patients p
       JOIN services s     ON s.id = p.service_id
       LEFT JOIN boxes b   ON b.id = p.box_id
       LEFT JOIN patient_types pt ON pt.id = p.patient_type_id
       WHERE p.ticket_code = $1`,
      [ticketCode]
    );
    return rows[0] || null;
  }
}

module.exports = QueueService;
