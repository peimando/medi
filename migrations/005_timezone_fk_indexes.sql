-- 005_timezone_fk_indexes.sql
-- Convierte TIMESTAMP a TIMESTAMPTZ + índices faltantes en FK

-- 1. TIMESTAMP → TIMESTAMPTZ (timezone-aware)
ALTER TABLE establishments ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'America/Santiago';
ALTER TABLE establishments ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'America/Santiago';

ALTER TABLE floors ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'America/Santiago';

ALTER TABLE roles ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'America/Santiago';

ALTER TABLE staff ALTER COLUMN last_login TYPE TIMESTAMPTZ USING last_login AT TIME ZONE 'America/Santiago';
ALTER TABLE staff ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'America/Santiago';
ALTER TABLE staff ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'America/Santiago';

ALTER TABLE services ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'America/Santiago';
ALTER TABLE services ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'America/Santiago';

ALTER TABLE patients ALTER COLUMN arrival_time TYPE TIMESTAMPTZ USING arrival_time AT TIME ZONE 'America/Santiago';
ALTER TABLE patients ALTER COLUMN called_at TYPE TIMESTAMPTZ USING called_at AT TIME ZONE 'America/Santiago';
ALTER TABLE patients ALTER COLUMN completion_time TYPE TIMESTAMPTZ USING completion_time AT TIME ZONE 'America/Santiago';
ALTER TABLE patients ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'America/Santiago';
ALTER TABLE patients ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'America/Santiago';

ALTER TABLE boxes ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'America/Santiago';

ALTER TABLE box_staff_history ALTER COLUMN assigned_at TYPE TIMESTAMPTZ USING assigned_at AT TIME ZONE 'America/Santiago';
ALTER TABLE box_staff_history ALTER COLUMN unassigned_at TYPE TIMESTAMPTZ USING unassigned_at AT TIME ZONE 'America/Santiago';

ALTER TABLE audit_logs ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'America/Santiago';

ALTER TABLE display_configs ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'America/Santiago';

ALTER TABLE kiosk_configs ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'America/Santiago';

ALTER TABLE system_config ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'America/Santiago';

-- 2. Índices faltantes en FK (PostgreSQL NO crea índices automáticos en FK)
CREATE INDEX IF NOT EXISTS idx_patients_service
  ON patients(service_id);

CREATE INDEX IF NOT EXISTS idx_patients_called_by
  ON patients(called_by);

CREATE INDEX IF NOT EXISTS idx_patients_patient_type
  ON patients(patient_type_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user
  ON audit_logs(user_id);
