-- 004_unique_constraints_indexes.sql
-- Agrega constraints e índices para concurrencia y rendimiento

-- 1. UNIQUE en ticket_code (evita duplicados bajo concurrencia)
DELETE FROM patients p1
USING patients p2
WHERE p1.id < p2.id AND p1.ticket_code = p2.ticket_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_ticket_code
  ON patients(ticket_code);

-- 2. UNIQUE en boxes.current_staff_id (un funcionario por box)
DELETE FROM boxes b1
USING boxes b2
WHERE b1.id < b2.id
  AND b1.current_staff_id IS NOT NULL
  AND b1.current_staff_id = b2.current_staff_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_boxes_unique_staff
  ON boxes(current_staff_id)
  WHERE current_staff_id IS NOT NULL;

-- 3. Índices para dashboards de analítica
CREATE INDEX IF NOT EXISTS idx_patients_status
  ON patients(status);

CREATE INDEX IF NOT EXISTS idx_patients_completion
  ON patients(completion_time);
