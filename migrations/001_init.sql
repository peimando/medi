-- ============================================================
-- migrations/001_init.sql — Schema completo MediQueue
-- ============================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ESTABLECIMIENTOS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS establishments (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  short_name VARCHAR(50),
  address    TEXT,
  phone      VARCHAR(50),
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ─── PISOS / SECTORES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS floors (
  id               SERIAL PRIMARY KEY,
  establishment_id INT NOT NULL REFERENCES establishments(id),
  name             VARCHAR(100) NOT NULL,
  description      TEXT,
  order_index      INT DEFAULT 0,
  active           BOOLEAN DEFAULT true,
  created_at       TIMESTAMP DEFAULT NOW()
);

-- ─── ROLES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(50) UNIQUE NOT NULL,
  label       VARCHAR(100) NOT NULL,
  permissions JSONB DEFAULT '{}',
  color       VARCHAR(7) DEFAULT '#6B7280',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── STAFF ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE,
  role          VARCHAR(50) REFERENCES roles(code),
  service_id    INT,  -- FK se agrega después de services
  totp_enabled  BOOLEAN DEFAULT false,
  totp_secret   VARCHAR(255),
  active        BOOLEAN DEFAULT true,
  last_login    TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ─── SERVICIOS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id                    SERIAL PRIMARY KEY,
  floor_id              INT NOT NULL REFERENCES floors(id),
  name                  VARCHAR(100) NOT NULL,
  code                  VARCHAR(10) UNIQUE NOT NULL,
  color                 VARCHAR(7) DEFAULT '#3B82F6',
  icon                  VARCHAR(10) DEFAULT '🏥',
  priority_order        INT DEFAULT 99,
  ticket_prefix         VARCHAR(10),
  ticket_format         VARCHAR(50) DEFAULT '{PREFIX}-{SEQ:3}',
  avg_attention_minutes INT DEFAULT 15,
  active                BOOLEAN DEFAULT true,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- FK staff → services (circular, se agrega aquí)
ALTER TABLE staff ADD CONSTRAINT fk_staff_service
  FOREIGN KEY (service_id) REFERENCES services(id);

-- ─── TIPOS DE PACIENTE ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_types (
  id       SERIAL PRIMARY KEY,
  code     VARCHAR(50) UNIQUE NOT NULL,
  label    VARCHAR(100) NOT NULL,
  priority INT NOT NULL DEFAULT 3,
  color    VARCHAR(7) DEFAULT '#6B7280',
  icon     VARCHAR(10) DEFAULT '👤',
  active   BOOLEAN DEFAULT true
);

-- ─── BOXES / CONSULTORIOS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS boxes (
  id               SERIAL PRIMARY KEY,
  service_id       INT NOT NULL REFERENCES services(id),
  name             VARCHAR(100) NOT NULL,
  type             VARCHAR(50) DEFAULT 'box',
  active           BOOLEAN DEFAULT true,
  current_staff_id INT REFERENCES staff(id),
  created_at       TIMESTAMP DEFAULT NOW()
);

-- ─── HISTORIAL ASIGNACIONES BOX ──────────────────────────────
CREATE TABLE IF NOT EXISTS box_staff_history (
  id            SERIAL PRIMARY KEY,
  box_id        INT NOT NULL REFERENCES boxes(id),
  staff_id      INT NOT NULL REFERENCES staff(id),
  assigned_at   TIMESTAMP DEFAULT NOW(),
  unassigned_at TIMESTAMP
);

-- ─── PACIENTES / TICKETS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id              SERIAL PRIMARY KEY,
  ticket_code     VARCHAR(30) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  phone           VARCHAR(20),
  service_id      INT NOT NULL REFERENCES services(id),
  patient_type_id INT REFERENCES patient_types(id),
  box_id          INT REFERENCES boxes(id),
  priority        INT DEFAULT 3,
  status          VARCHAR(20) DEFAULT 'waiting'
                  CHECK (status IN ('waiting','serving','completed','absent','transferred')),
  arrival_time    TIMESTAMP DEFAULT NOW(),
  called_at       TIMESTAMP,
  called_by       INT REFERENCES staff(id),
  completion_time TIMESTAMP,
  sms_consent     BOOLEAN DEFAULT false,
  sms_purpose     TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ─── SECUENCIAS DE TICKETS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_sequences (
  service_id INT NOT NULL REFERENCES services(id),
  date       DATE NOT NULL,
  last_seq   INT DEFAULT 0,
  PRIMARY KEY (service_id, date)
);

-- Función atómica para secuencias (sin race condition)
CREATE OR REPLACE FUNCTION next_ticket_seq(p_service_id INT)
RETURNS INT AS $$
DECLARE v_seq INT;
BEGIN
  INSERT INTO ticket_sequences (service_id, date, last_seq)
  VALUES (p_service_id, CURRENT_DATE, 1)
  ON CONFLICT (service_id, date)
  DO UPDATE SET last_seq = ticket_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;
  RETURN v_seq;
END;
$$ LANGUAGE plpgsql;

-- ─── CONFIGURACIÓN DEL SISTEMA ───────────────────────────────
CREATE TABLE IF NOT EXISTS system_config (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT NOT NULL,
  label      VARCHAR(255),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ─── TEMPLATES SMS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_templates (
  id     SERIAL PRIMARY KEY,
  code   VARCHAR(100) UNIQUE NOT NULL,
  label  VARCHAR(255) NOT NULL,
  body   TEXT NOT NULL,
  active BOOLEAN DEFAULT true
);

-- ─── AUDIT LOG ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES staff(id),
  action      VARCHAR(100) NOT NULL,
  resource    VARCHAR(100),
  resource_id INT,
  changes     JSONB,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── ÍNDICES CRÍTICOS ─────────────────────────────────────────
-- NOTA: Sin CONCURRENTLY porque migrations/run.js ejecuta dentro de una transacción.
-- En producción, las migraciones corren en solitario (sin lectores concurrentes).
CREATE INDEX IF NOT EXISTS idx_patients_queue_waiting
  ON patients(service_id, priority, arrival_time) WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS idx_patients_queue_serving
  ON patients(service_id) WHERE status = 'serving';

CREATE INDEX IF NOT EXISTS idx_patients_arrival
  ON patients(arrival_time);

CREATE INDEX IF NOT EXISTS idx_floors_establishment
  ON floors(establishment_id);

CREATE INDEX IF NOT EXISTS idx_services_floor
  ON services(floor_id);

CREATE INDEX IF NOT EXISTS idx_boxes_service
  ON boxes(service_id);

CREATE INDEX IF NOT EXISTS idx_boxes_staff
  ON boxes(current_staff_id);

-- ─── DATOS INICIALES ─────────────────────────────────────────

-- Roles
INSERT INTO roles (code, label, permissions, color) VALUES
  ('admin',        'Administrador',     '{"all":true}',                                                             '#EF4444'),
  ('doctor',       'Médico',            '{"call_patients":true,"complete_service":true,"view_queue":true}',         '#3B82F6'),
  ('nurse',        'Enfermera/o',       '{"call_patients":true,"triage":true,"view_queue":true}',                   '#10B981'),
  ('pharmacist',   'Farmacéutico/a',    '{"call_patients":true,"complete_service":true,"view_queue":true}',         '#8B5CF6'),
  ('lab_tech',     'Técnico Lab.',      '{"call_patients":true,"complete_service":true,"view_queue":true}',         '#F59E0B'),
  ('receptionist', 'Recepcionista',     '{"register_patients":true,"view_queue":true}',                            '#06B6D4'),
  ('manager',      'Gerente',           '{"view_analytics":true,"view_queue":true,"export_reports":true}',         '#EC4899')
ON CONFLICT (code) DO NOTHING;

-- Establecimiento
INSERT INTO establishments (name, short_name, address, phone) VALUES
  ('Mi Centro Médico', 'MCM', 'Dirección del establecimiento', '+5612345678')
  ON CONFLICT DO NOTHING;

-- Pisos
INSERT INTO floors (establishment_id, name, description, order_index) VALUES
  (1, 'Urgencias',   'Planta baja — acceso principal', 0),
  (1, 'Piso 1',      'Consultas ambulatorias',         1),
  (1, 'Piso 2',      'Especialidades',                 2),
  (1, 'Laboratorio', 'Sector laboratorio y rayos X',   3)
ON CONFLICT DO NOTHING;

-- Servicios
INSERT INTO services (floor_id, name, code, color, icon, priority_order, ticket_prefix, avg_attention_minutes) VALUES
  (1, 'Triage',      'TRI', '#EF4444', '🚨', 1, 'TRI', 10),
  (2, 'Consultoría', 'CON', '#3B82F6', '👨‍⚕️', 2, 'CON', 20),
  (4, 'Laboratorio', 'LAB', '#F59E0B', '🧪', 3, 'LAB', 15),
  (4, 'Rayos X',     'RAY', '#8B5CF6', '🔬', 4, 'RAY', 30),
  (2, 'Farmacia',    'FAR', '#10B981', '💊', 5, 'FAR', 10)
ON CONFLICT (code) DO NOTHING;

-- Tipos de paciente
INSERT INTO patient_types (code, label, priority, color, icon) VALUES
  ('emergency',   'Emergencia',      1, '#EF4444', '🚨'),
  ('appointment', 'Cita Programada', 2, '#F59E0B', '📅'),
  ('walkin',      'Walk-in',         3, '#10B981', '🚶')
ON CONFLICT (code) DO NOTHING;

-- Boxes
INSERT INTO boxes (service_id, name, type) VALUES
  (1, 'Box 1',        'box'),
  (1, 'Box 2',        'box'),
  (2, 'Consultorio 1','box'),
  (2, 'Consultorio 2','box'),
  (2, 'Consultorio 3','box'),
  (3, 'Mesón 1',      'ventanilla'),
  (3, 'Mesón 2',      'ventanilla'),
  (4, 'Sala Rayos X', 'sala'),
  (5, 'Ventanilla 1', 'ventanilla'),
  (5, 'Ventanilla 2', 'ventanilla')
ON CONFLICT DO NOTHING;

-- Configuración del sistema
INSERT INTO system_config (key, value, label) VALUES
  ('hospital_name',           'Mi Centro Médico',         'Nombre del hospital'),
  ('hospital_phone',          '+5612345678',              'Teléfono del hospital'),
  ('display_refresh_ms',      '2000',                     'Refresco cartelería (ms)'),
  ('analytics_refresh_ms',    '5000',                     'Refresco analytics (ms)'),
  ('analytics_cache_ttl',     '30',                       'Cache analytics (segundos)'),
  ('wait_time_history_days',  '7',                        'Días histórico tiempo espera'),
  ('ticket_daily_reset',      'true',                     'Resetear tickets cada día'),
  ('max_queue_size',          '200',                      'Máx pacientes por cola'),
  ('absent_requeue_minutes',  '5',                        'Minutos para re-encolar ausente'),
  ('sms_enabled',             'false',                    'Habilitar envío SMS')
ON CONFLICT (key) DO NOTHING;

-- Templates SMS
INSERT INTO sms_templates (code, label, body) VALUES
  ('ticket_assigned',         'Ticket asignado',      'Tu turno: {ticket} en {service}. Espera: ~{wait} min. {hospital}'),
  ('your_turn',               'Es tu turno',          '¡Es tu turno! Código {ticket}. Acude a {box} ahora.'),
  ('appointment_reminder_24h','Recordatorio 24h',     'Recordatorio: Cita mañana en {service}. Para cancelar llama al {phone}.')
ON CONFLICT (code) DO NOTHING;

-- Usuario admin por defecto (password: Admin1234!)
-- Hash generado con bcrypt rounds=10
INSERT INTO staff (username, password_hash, name, email, role) VALUES
  ('admin', '$2a$10$f7.y4y18PqwW/IS5soKcWeGnoor3CaYS.QGx01NyxG.HlPI9mp8RG', 'Administrador', 'admin@hospital.cl', 'admin')
ON CONFLICT (username) DO NOTHING;
