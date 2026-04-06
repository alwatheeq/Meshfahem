/*
  # Fix initialize_user_preferences trigger

  The trigger function was created in an earlier migration using color_theme = 'soft-minimal'.
  Migration 20260315120000_color_theme_slate_plum_retire_legacy.sql tightened the
  user_preferences_color_theme_check constraint to remove 'soft-minimal' from the allowed values,
  but did not update this trigger function. New user sign-ups therefore fail with a check
  constraint violation when the trigger fires on user_profiles insert.

  Fix: update the function to use 'sky-blue', which is a valid value under the current constraint.
*/

CREATE OR REPLACE FUNCTION initialize_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_preferences (user_id, sidebar_mode, color_theme, free_form_mode_enabled)
  VALUES (NEW.id, 'collapsible', 'sky-blue', false)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
