// migrations/run.js — Ejecutor de migraciones
require('dotenv').config();
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');
const { waitForDatabase } = require('../src/utils/dbHelpers');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  await waitForDatabase(pool, { label: 'Migraciones DB', retries: 20, delayMs: 2000 });
  const client = await pool.connect();
  try {
    // Tabla de control de migraciones
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id         SERIAL PRIMARY KEY,
        filename   VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const { rows: applied } = await client.query('SELECT filename FROM migrations');
    const appliedSet = new Set(applied.map(r => r.filename));

    const dir   = path.join(__dirname);
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`⏭  ${file} (ya aplicada)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✅ ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ ${file}:`, err.message);
        process.exit(1);
      }
    }
    console.log('\n✓ Migraciones completadas');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
