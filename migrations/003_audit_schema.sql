-- 003_audit_schema.sql
-- Amplía audit_logs con columnas completas de trazabilidad clínica

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS username   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS entity_id  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS old_data   JSONB,
  ADD COLUMN IF NOT EXISTS new_data   JSONB;

-- Migrar datos existentes manteniendo compatibilidad hacia atrás
UPDATE audit_logs
  SET entity_type = resource,
      entity_id   = resource_id::VARCHAR,
      new_data    = changes
  WHERE entity_type IS NULL;
