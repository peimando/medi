// scripts/seed.js — Datos de prueba para desarrollo y demo
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  console.log('🌱 Iniciando seed de datos de prueba...\n');

  // ─── Usuarios de prueba ───────────────────────────────────
  const users = [
    { username: 'admin',       name: 'Administrador',        role: 'admin',       service: null,       password: 'Admin1234!' },
    { username: 'doctor1',     name: 'Dr. Carlos Pérez',     role: 'doctor',      service: 'CON',      password: 'password123' },
    { username: 'doctor2',     name: 'Dra. Ana Rodríguez',   role: 'doctor',      service: 'CON',      password: 'password123' },
    { username: 'nurse1',      name: 'Enf. María García',    role: 'nurse',       service: 'TRI',      password: 'password123' },
    { username: 'nurse2',      name: 'Enf. Luis Torres',     role: 'nurse',       service: 'TRI',      password: 'password123' },
    { username: 'pharmacist1', name: 'Farm. Roberto Díaz',   role: 'pharmacist',  service: 'FAR',      password: 'password123' },
    { username: 'labtech1',    name: 'TM. Patricia López',   role: 'lab_tech',    service: 'LAB',      password: 'password123' },
    { username: 'manager1',    name: 'Gerente General',      role: 'manager',     service: null,       password: 'password123' },
    { username: 'receptionist1', name: 'Recep. Sandra Ruiz', role: 'receptionist',service: null,       password: 'password123' },
  ];

  // Obtener IDs de servicios
  const { rows: services } = await pool.query('SELECT id, code FROM services');
  const svcByCode = Object.fromEntries(services.map(s => [s.code, s.id]));

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    const serviceId = u.service ? svcByCode[u.service] : null;

    await pool.query(
      `INSERT INTO staff (username, password_hash, name, role, service_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (username) DO UPDATE
         SET password_hash=$2, name=$3, role=$4, service_id=$5`,
      [u.username, hash, u.name, u.role, serviceId]
    );
    console.log(`  ✓ Usuario: ${u.username} (${u.role}) → ${u.password}`);
  }

  // ─── Asignar staff a boxes ────────────────────────────────
  const { rows: boxes }  = await pool.query('SELECT id, name, service_id FROM boxes ORDER BY id');
  const { rows: staffs } = await pool.query('SELECT id, username, service_id FROM staff WHERE service_id IS NOT NULL');

  for (const staff of staffs) {
    const box = boxes.find(b => b.service_id === staff.service_id);
    if (box) {
      await pool.query(
        `UPDATE boxes SET current_staff_id=$1 WHERE id=$2 AND current_staff_id IS NULL`,
        [staff.id, box.id]
      );
    }
  }
  console.log('\n  ✓ Staff asignado a boxes');

  // ─── Pacientes de prueba (hoy) ────────────────────────────
  const { rows: patientTypes } = await pool.query('SELECT id, code, priority FROM patient_types');
  const typeByCode = Object.fromEntries(patientTypes.map(t => [t.code, t]));

  const patients = [
    { name: 'Carlos Martínez', serviceCode: 'TRI', type: 'emergency',   waitMin: 45 },
    { name: 'Ana Ramírez',     serviceCode: 'TRI', type: 'appointment', waitMin: 30 },
    { name: 'Luis Pinto',      serviceCode: 'TRI', type: 'walkin',      waitMin: 15 },
    { name: 'María González',  serviceCode: 'CON', type: 'appointment', waitMin: 60 },
    { name: 'Pedro Castillo',  serviceCode: 'LAB', type: 'walkin',      waitMin: 20 },
    { name: 'Rosa Fuentes',    serviceCode: 'FAR', type: 'walkin',      waitMin: 10 },
    { name: 'Jorge Salinas',   serviceCode: 'CON', type: 'walkin',      waitMin: 25 },
    { name: 'Carmen Vega',     serviceCode: 'RAY', type: 'appointment', waitMin: 35 },
  ];

  let seqByService = {};
  for (const p of patients) {
    const svcId = svcByCode[p.serviceCode];
    if (!svcId) continue;

    seqByService[p.serviceCode] = (seqByService[p.serviceCode] || 0) + 1;
    const seq  = seqByService[p.serviceCode];
    const code = `${p.serviceCode}-${String(seq).padStart(3, '0')}`;
    const pt   = typeByCode[p.type];
    const arrivalTime = new Date(Date.now() - p.waitMin * 60000);

    await pool.query(
      `INSERT INTO patients
         (ticket_code, name, service_id, patient_type_id, priority, status, arrival_time)
       VALUES ($1,$2,$3,$4,$5,'waiting',$6)
       ON CONFLICT DO NOTHING`,
      [code, p.name, svcId, pt.id, pt.priority, arrivalTime]
    );

    // Registrar en ticket_sequences
    const today = new Date().toISOString().slice(0, 10);
    await pool.query(
      `INSERT INTO ticket_sequences (service_id, date, last_seq)
       VALUES ($1,$2,$3)
       ON CONFLICT (service_id, date) DO UPDATE SET last_seq=GREATEST(ticket_sequences.last_seq,$3)`,
      [svcId, today, seq]
    );

    console.log(`  ✓ Paciente: ${code} — ${p.name}`);
  }

  // ─── Un paciente en atención para demo ────────────────────
  const { rows: firstWaiting } = await pool.query(
    `SELECT p.id FROM patients p
     JOIN services s ON s.id=p.service_id AND s.code='TRI'
     WHERE p.status='waiting' ORDER BY p.priority, p.arrival_time LIMIT 1`
  );
  if (firstWaiting.length) {
    const nurseRow = await pool.query(`SELECT id FROM staff WHERE username='nurse1'`);
    if (nurseRow.rows.length) {
      await pool.query(
        `UPDATE patients SET status='serving', called_at=NOW(), called_by=$1 WHERE id=$2`,
        [nurseRow.rows[0].id, firstWaiting[0].id]
      );
      console.log('\n  ✓ Primer paciente de Triage puesto en atención (demo)');
    }
  }

  console.log('\n✅ Seed completado\n');
  console.log('Usuarios disponibles:');
  console.log('  admin / Admin1234!  (administrador completo)');
  console.log('  doctor1 / password123  (médico — Consultoría)');
  console.log('  nurse1  / password123  (enfermera — Triage)');
  console.log('  pharmacist1 / password123  (farmacéutico)');
  console.log('  manager1 / password123  (gerente — analytics)');
}

seed()
  .catch(e => { console.error('❌ Error en seed:', e.message); process.exit(1); })
  .finally(() => pool.end());
