// ============================================================
// src/config/loader.js — Carga y cachea toda la configuración
// desde la BD al arrancar el servidor.
//
// Uso en server.js:
//   const cfg = require('./src/config/loader')
//   await cfg.load(pgPool, redisClient)
//
// Uso en cualquier ruta/servicio:
//   const cfg = require('./src/config/loader')
//   const services = cfg.get('services')
//   const sysConf  = cfg.getSys('display_refresh_ms')
// ============================================================

const EventEmitter = require('events');
const { AppError } = require('../errors/AppError');
const logger = require('./logger');

class ConfigLoader extends EventEmitter {
  constructor() {
    super();
    this._cache     = {};
    this._loaded    = false;
    this._pgPool    = null;
    this._redis     = null;     // cliente principal (para operaciones regulares)
    this._pubSub    = null;     // cliente dedicado Pub/Sub (duplicate)
    this._channel   = 'config:reload';
  }

  // ── Cargar todo desde BD ──────────────────────────────────
  async load(pgPool, redisClient) {
    this._pgPool = pgPool;
    this._redis  = redisClient;

    await Promise.all([
      this._loadServices(),
      this._loadPatientTypes(),
      this._loadRoles(),
      this._loadSmsTemplates(),
      this._loadSystemConfig(),
      this._loadEstablishments(),
    ]);

    this._loaded = true;
    this.emit('loaded');
    logger.info('Configuración cargada desde BD');

    // Suscribirse a Pub/Sub para recarga distribuida
    this._subscribeReload();
  }

  // ── Suscripción a recarga distribuida vía Redis ──────────
  async _subscribeReload() {
    if (!this._redis || !this._redis.isOpen) return;
    try {
      this._pubSub = this._redis.duplicate();
      await this._pubSub.connect();
      await this._pubSub.subscribe(this._channel, (message) => {
        logger.info(`Recarga distribuida recibida: ${message}`);
        this._doReloadWithoutPublish();
      });
      logger.info('ConfigLoader suscrito a canal Redis config:reload');
    } catch (err) {
      logger.warn('No se pudo suscribir a Redis Pub/Sub — recarga local solamente', { error: err.message });
      this._pubSub = null;
    }
  }

  // Recarga interna SIN publicar (para evitar loop infinito)
  async _doReloadWithoutPublish() {
    const savedRedis = this._redis;
    await this.load(this._pgPool, savedRedis);
    this._flushAnalyticsCache();
    logger.info('Configuración recargada (remota)');
    this.emit('reloaded');
  }

  // ── Getters ───────────────────────────────────────────────
  get(key)       { return this._cache[key]; }
  getSys(key)    { return this._cache.sysConfig?.[key]; }
  getSysInt(key) { return parseInt(this.getSys(key) || '0'); }
  getSysBool(key){ return this.getSys(key) === 'true'; }

  getServiceByCode(code) {
    return this._cache.services?.find(s => s.code === code);
  }
  getServiceById(id) {
    return this._cache.services?.find(s => s.id === parseInt(id));
  }
  getTypeByCode(code) {
    return this._cache.patientTypes?.find(t => t.code === code);
  }
  getRoleByCode(code) {
    return this._cache.roles?.find(r => r.code === code);
  }
  getTemplate(code) {
    return this._cache.smsTemplates?.find(t => t.code === code);
  }

  // ── Validadores ───────────────────────────────────────────
  isValidService(name) {
    return this._cache.services?.some(s => s.name === name || s.code === name);
  }
  isValidType(code) {
    return this._cache.patientTypes?.some(t => t.code === code);
  }
  isValidRole(code) {
    return this._cache.roles?.some(r => r.code === code);
  }
  validServiceNames() {
    return this._cache.services?.map(s => s.name) || [];
  }
  validTypeCodes() {
    return this._cache.patientTypes?.map(t => t.code) || [];
  }

  // ── Generador de tickets ──────────────────────────────────
  async generateTicket(pgPoolOrClient, serviceId) {
    const service = this.getServiceById(serviceId);
    if (!service) throw new AppError(`Servicio ${serviceId} no encontrado`, 404, 'INVALID_SERVICE');

    const today  = new Date().toISOString().slice(0, 10);
    const prefix = service.ticket_prefix || service.code;
    const format = service.ticket_format || '{PREFIX}-{SEQ:3}';

    // Obtener y actualizar correlativo atómicamente (usa el client si hay transacción activa)
    const { rows } = await pgPoolOrClient.query(
      `INSERT INTO ticket_sequences (service_id, date, last_seq)
       VALUES ($1, $2, 1)
       ON CONFLICT (service_id, date)
       DO UPDATE SET last_seq = ticket_sequences.last_seq + 1
       RETURNING last_seq`,
      [serviceId, today]
    );

    const seq  = rows[0].last_seq;
    const date = today.replace(/-/g, '').slice(2);

    const ticket = format
      .replace('{PREFIX}', prefix)
      .replace(/\{SEQ:(\d+)\}/, (_, n) => String(seq).padStart(parseInt(n), '0'))
      .replace('{DATE}', date);

    return ticket;
  }

  // ── Calcular tiempo de espera estimado ────────────────────
  async estimateWaitMinutes(pgPool, serviceId) {
    const service     = this.getServiceById(serviceId);
    const historyDays = this.getSysInt('wait_time_history_days') || 7;
    const defaultMin  = service?.avg_attention_minutes || 15;

    try {
      // Promedio histórico real
      const { rows: histRows } = await pgPool.query(
        `SELECT ROUND(AVG(
           EXTRACT(EPOCH FROM (completion_time - arrival_time)) / 60
         )) AS avg_mins
         FROM patients
         WHERE service_id = $1
           AND status     = 'completed'
           AND arrival_time > NOW() - $2::INTERVAL`,
        [serviceId, `${historyDays} days`]
      );
      const avgMins = histRows[0]?.avg_mins || defaultMin;

      // Pacientes en espera actualmente
      const { rows: qRows } = await pgPool.query(
        `SELECT COUNT(*) AS total
         FROM patients
         WHERE service_id = $1 AND status = 'waiting'`,
        [serviceId]
      );
      const queueLen = parseInt(qRows[0]?.total || 0);

      return Math.round(avgMins * Math.max(queueLen, 1));
    } catch {
      return defaultMin;
    }
  }

  // ── Renderizar template SMS ───────────────────────────────
  renderSMS(templateCode, vars = {}) {
    const tpl = this.getTemplate(templateCode);
    if (!tpl) return null;

    const hospitalName  = this.getSys('hospital_name') || 'Hospital';
    const hospitalPhone = this.getSys('hospital_phone') || '';

    const allVars = { hospital: hospitalName, phone: hospitalPhone, ...vars };

    return Object.entries(allVars).reduce(
      (body, [k, v]) => body.replace(new RegExp(`\\{${k}\\}`, 'g'), v ?? ''),
      tpl.body
    );
  }

  // ── Construir código de ticket desde servicio + seq ──────
  // Alias síncrono — cuando ya tenemos el seq de la BD
  buildTicketCode(service, seq) {
    const prefix = service.ticket_prefix || service.code;
    const format = service.ticket_format || '{PREFIX}-{SEQ:3}';
    const date   = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    return format
      .replace('{PREFIX}', prefix)
      .replace(/\{SEQ:(\d+)\}/, (_, n) => String(seq).padStart(parseInt(n), '0'))
      .replace('{DATE}', date);
  }

  // ── Verificar permiso ─────────────────────────────────────
  hasPermission(roleCode, permission) {
    const role = this.getRoleByCode(roleCode);
    if (!role) return false;
    const perms = role.permissions || {};
    return !!(perms.all || perms[permission]);
  }

  // ── Recargar desde BD (para cambios en caliente) ─────────
  async reload() {
    await this.load(this._pgPool, this._redis);
    this._flushAnalyticsCache();
    logger.info('Configuración recargada (local)');
    this.emit('reloaded');

    // Publicar evento a otras instancias vía Redis Pub/Sub
    await this._publishReload();
  }

  async _publishReload() {
    if (!this._pubSub || !this._pubSub.isOpen) return;
    try {
      await this._pubSub.publish(this._channel, `reloaded:${Date.now()}`);
      logger.debug('Publicado evento de recarga en Redis');
    } catch (err) {
      logger.warn('Error publicando recarga en Redis', { error: err.message });
    }
  }

  _flushAnalyticsCache() {
    if (this._redis && this._redis.isOpen) {
      this._redis.keys('analytics:*').then(keys => {
        if (keys.length) this._redis.del(keys).catch(() => {});
      }).catch(() => {});
    }
  }

  // ── Loaders internos ──────────────────────────────────────
  async _loadServices() {
    const { rows } = await this._pgPool.query(
      `SELECT s.id, s.name, s.code, s.color, s.icon,
              s.priority_order, s.ticket_prefix, s.ticket_format,
              s.avg_attention_minutes, s.active,
              f.id AS floor_id, f.name AS floor_name,
              e.id AS establishment_id, e.name AS establishment_name
       FROM services s
       JOIN floors f        ON f.id = s.floor_id
       JOIN establishments e ON e.id = f.establishment_id
       WHERE s.active = true AND f.active = true AND e.active = true
       ORDER BY s.priority_order, s.name`
    );
    this._cache.services = rows;
  }

  async _loadPatientTypes() {
    const { rows } = await this._pgPool.query(
      `SELECT * FROM patient_types WHERE active = true ORDER BY priority`
    );
    this._cache.patientTypes = rows;
  }

  async _loadRoles() {
    const { rows } = await this._pgPool.query(
      `SELECT * FROM roles WHERE active = true ORDER BY id`
    );
    this._cache.roles = rows;
  }

  async _loadSmsTemplates() {
    const { rows } = await this._pgPool.query(
      `SELECT * FROM sms_templates WHERE active = true`
    );
    this._cache.smsTemplates = rows;
  }

  async _loadSystemConfig() {
    const { rows } = await this._pgPool.query(
      `SELECT key, value FROM system_config`
    );
    this._cache.sysConfig = Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  async _loadEstablishments() {
    const { rows } = await this._pgPool.query(
      `SELECT e.*,
        json_agg(
          json_build_object(
            'id', f.id, 'name', f.name, 'order', f.order_index
          ) ORDER BY f.order_index
        ) FILTER (WHERE f.id IS NOT NULL) AS floors
       FROM establishments e
       LEFT JOIN floors f ON f.establishment_id = e.id AND f.active = true
       WHERE e.active = true
       GROUP BY e.id`
    );
    this._cache.establishments = rows;
  }

  // ── Shutdown ──────────────────────────────────────────────
  async shutdown() {
    if (this._pubSub) {
      try { await this._pubSub.unsubscribe(this._channel); await this._pubSub.quit(); } catch {}
      this._pubSub = null;
    }
  }
}

// Singleton — una sola instancia en toda la app
module.exports = new ConfigLoader();