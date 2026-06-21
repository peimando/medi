-- ─── 002: Pantallas digitales y kioskos configurables ─────────
-- Permite definir qué servicios se ven en cada pantalla/piso/kiosko

CREATE TABLE IF NOT EXISTS display_configs (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(50)  NOT NULL UNIQUE,
  service_ids INT[]        NOT NULL DEFAULT '{}',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kiosk_configs (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(50)  NOT NULL UNIQUE,
  service_ids INT[]        NOT NULL DEFAULT '{}',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Datos iniciales de ejemplo
INSERT INTO display_configs (name, slug, service_ids) VALUES
  ('Pantalla Urgencias',  'urgencias',  ARRAY[1]),
  ('Pantalla Piso 1',     'piso-1',     ARRAY[2, 5]),
  ('Pantalla Piso 2',     'piso-2',     ARRAY[3, 4])
ON CONFLICT (slug) DO NOTHING;

INSERT INTO kiosk_configs (name, slug, service_ids) VALUES
  ('Kiosko Urgencias',    'kiosko-urgencias', ARRAY[1]),
  ('Kiosko Principal',    'kiosko-principal', ARRAY[2, 5]),
  ('Kiosko Laboratorio',  'kiosko-lab',       ARRAY[3, 4])
ON CONFLICT (slug) DO NOTHING;
