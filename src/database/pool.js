const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.NODE_ENV === 'test' ? 50 : 20, min: 2,
  statement_timeout: 30000,
  query_timeout: 30000,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
  application_name: process.env.APP_NAME || 'mediqueue',
});

module.exports = pool;
