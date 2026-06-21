-- 006_unaccent_recovery.sql
-- unaccent para búsquedas + config de recuperación de tickets huérfanos

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Configuración para timeout de tickets en serving
INSERT INTO system_config (key, value, label) VALUES
  ('serving_timeout_minutes', '30', 'Minutos para liberar tickets serving huérfanos')
ON CONFLICT (key) DO NOTHING;
