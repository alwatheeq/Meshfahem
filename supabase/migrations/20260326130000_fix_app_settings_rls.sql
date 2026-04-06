-- Fix write policy: use is_admin() instead of service_role so the frontend admin portal can write
DROP POLICY IF EXISTS "Service role write app_settings" ON app_settings;

CREATE POLICY "Admin write app_settings"
  ON app_settings FOR ALL
  USING (is_admin());
