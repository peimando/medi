-- ─── 008: Layout visual y fondo personalizado para pantallas ──
ALTER TABLE display_configs ADD COLUMN IF NOT EXISTS background_image VARCHAR(500);
ALTER TABLE display_configs ADD COLUMN IF NOT EXISTS layout JSONB DEFAULT '{}';
