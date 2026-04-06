/*
  # Update Earth Tones to Sky Blue Theme
  
  ## Overview
  Replaces 'earth-tones' theme with 'sky-blue' theme in the database constraint and migrates existing user preferences.
  
  ## Changes
  1. Update CHECK constraint to use 'sky-blue' instead of 'earth-tones'
  2. Migrate existing 'earth-tones' preferences to 'sky-blue'
  3. Update comments and documentation
*/

-- =====================================================================
-- STEP 1: Migrate existing earth-tones preferences to sky-blue
-- =====================================================================

UPDATE user_preferences
SET color_theme = 'sky-blue'
WHERE color_theme = 'earth-tones';

-- =====================================================================
-- STEP 2: Drop old constraint
-- =====================================================================

ALTER TABLE user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_color_theme_check;

ALTER TABLE user_preferences
  DROP CONSTRAINT IF EXISTS color_theme_check;

-- =====================================================================
-- STEP 3: Add new constraint with sky-blue
-- =====================================================================

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_color_theme_check 
    CHECK (color_theme IN ('monochrome', 'warm-neutrals', 'cool-neutrals', 'sky-blue', 'soft-minimal'));

COMMENT ON COLUMN user_preferences.color_theme IS 'User-selected color theme. Options: monochrome, warm-neutrals, cool-neutrals, sky-blue, soft-minimal';

-- =====================================================================
-- STEP 4: Verify migration
-- =====================================================================

DO $$
DECLARE
  v_earth_tones_count INTEGER;
  v_invalid_count INTEGER;
BEGIN
  -- Check for any remaining earth-tones
  SELECT COUNT(*) INTO v_earth_tones_count
  FROM user_preferences
  WHERE color_theme = 'earth-tones';

  IF v_earth_tones_count > 0 THEN
    RAISE WARNING 'Found % users still with earth-tones theme. Migrating now...', v_earth_tones_count;
    UPDATE user_preferences
    SET color_theme = 'sky-blue'
    WHERE color_theme = 'earth-tones';
  END IF;

  -- Check for invalid themes
  SELECT COUNT(*) INTO v_invalid_count
  FROM user_preferences
  WHERE color_theme NOT IN ('monochrome', 'warm-neutrals', 'cool-neutrals', 'sky-blue', 'soft-minimal');

  IF v_invalid_count > 0 THEN
    RAISE WARNING 'Found % users with invalid themes. Setting to soft-minimal...', v_invalid_count;
    UPDATE user_preferences
    SET color_theme = 'soft-minimal'
    WHERE color_theme NOT IN ('monochrome', 'warm-neutrals', 'cool-neutrals', 'sky-blue', 'soft-minimal');
  END IF;

  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'Valid theme options:';
  RAISE NOTICE '  - monochrome';
  RAISE NOTICE '  - warm-neutrals';
  RAISE NOTICE '  - cool-neutrals';
  RAISE NOTICE '  - sky-blue';
  RAISE NOTICE '  - soft-minimal (default)';
  RAISE NOTICE '';
END $$;
