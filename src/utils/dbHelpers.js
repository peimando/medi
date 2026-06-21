function buildUpdate(allowedFields, body) {
  const updates = [];
  const values  = [];
  let   idx     = 1;

  allowedFields.forEach(f => {
    if (body[f] !== undefined) {
      updates.push(`${f} = $${idx++}`);
      values.push(f === 'permissions' ? JSON.stringify(body[f]) : body[f]);
    }
  });

  return { updates, values, idx };
}

async function updateEntity(pool, table, allowedFields, id, body, extra = {}) {
  const { updates, values, idx } = buildUpdate(allowedFields, body);

  if (!updates.length) {
    const err = new Error('Sin cambios');
    err.statusCode = 400;
    err.code = 'NO_UPDATES';
    throw err;
  }

  if (extra.additionalSets) {
    Object.entries(extra.additionalSets).forEach(([col, val]) => {
      updates.push(`${col} = $${idx++}`);
      values.push(val);
    });
  }

  if (!table.includes('display_configs') && !table.includes('kiosk_configs')) {
    updates.push(`updated_at = NOW()`);
  }
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE ${table} SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
    values
  );

  if (!rows.length) {
    const err = new Error(`${table} no encontrado`);
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return rows[0];
}

function notFoundError(entity) {
  const err = new Error(`${entity} no encontrado`);
  err.statusCode = 404;
  err.code = 'NOT_FOUND';
  return err;
}

function noChangesError() {
  const err = new Error('Sin cambios');
  err.statusCode = 400;
  err.code = 'NO_UPDATES';
  return err;
}

const logger = require('../config/logger');

async function waitForDatabase(pgPool, { label = 'DB', retries = 15, delayMs = 2000 } = {}) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pgPool.query('SELECT 1');
      logger.info(`${label} conectada`);
      return;
    } catch (err) {
      if (i === retries) {
        logger.error(`${label} no disponible tras ${retries} intentos`, { error: err.message });
        throw err;
      }
      logger.warn(`${label} no disponible (intento ${i}/${retries}), esperando ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

module.exports = { buildUpdate, updateEntity, notFoundError, noChangesError, waitForDatabase };
