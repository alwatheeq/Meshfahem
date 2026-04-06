-- App-wide settings table controlled by admins from the admin portal
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed: upsell modal disabled by default
INSERT INTO app_settings (key, value)
VALUES ('upsell_modal_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Public read so the frontend can fetch without auth
-- Admin writes use the is_admin() helper (same pattern as other admin-writable tables)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read app_settings"
  ON app_settings FOR SELECT
  USING (true);

CREATE POLICY "Admin write app_settings"
  ON app_settings FOR ALL
  USING (is_admin());
