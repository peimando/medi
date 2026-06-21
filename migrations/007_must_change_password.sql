-- 007_must_change_password.sql
-- Agrega columna must_change_password a staff para forzar cambio en primer login

ALTER TABLE staff ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
