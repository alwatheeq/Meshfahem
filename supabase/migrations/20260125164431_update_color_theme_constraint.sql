/*
  # Update Color Theme Constraint

  ## Purpose
  Update the CHECK constraint on user_preferences.color_theme to allow the new theme names:
  - monochrome
  - warm-neutrals
  - cool-neutrals
  - earth-tones
  - soft-minimal

  ## Changes
  1. Drop old CHECK constraint
  2. Add new CHECK constraint with new theme names
  3. Update default value from 'blue-purple' to 'soft-minimal'
  4. Backfill existing records with new default
  5. Update initialize_user_preferences() function
*/

-- =====================================================================
-- STEP 1: Drop Old CHECK Constraint
-- =====================================================================

-- First, we need to drop the constraint by name
-- The constraint name might be auto-generated, so we'll use a more robust approach
DO $$
DECLARE
  constraint_name text;
BEGIN
  -- Find the constraint name
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'user_preferences'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%color_theme%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS %I', constraint_name);
    RAISE NOTICE 'Dropped constraint: %', constraint_name;
  ELSE
    RAISE NOTICE 'No existing constraint found for color_theme';
  END IF;
END $$;

-- =====================================================================
-- STEP 2: Update Default Value and Add New CHECK Constraint
-- =====================================================================

ALTER TABLE user_preferences
  ALTER COLUMN color_theme SET DEFAULT 'soft-minimal',
  ADD CONSTRAINT color_theme_check 
    CHECK (color_theme IN ('monochrome', 'warm-neutrals', 'cool-neutrals', 'earth-tones', 'soft-minimal'));

COMMENT ON COLUMN user_preferences.color_theme IS 'User-selected color theme. Options: monochrome, warm-neutrals, cool-neutrals, earth-tones, soft-minimal';

-- =====================================================================
-- STEP 3: Backfill Existing Records
-- =====================================================================

-- Map old themes to new themes (best match)
UPDATE user_preferences
SET color_theme = CASE
  WHEN color_theme = 'pink-white' THEN 'warm-neutrals'
  WHEN color_theme = 'blue-purple' THEN 'cool-neutrals'
  WHEN color_theme = 'green-teal' THEN 'earth-tones'
  WHEN color_theme = 'orange-amber' THEN 'warm-neutrals'
  WHEN color_theme = 'indigo-violet' THEN 'cool-neutrals'
  ELSE 'soft-minimal'
END
WHERE color_theme IN ('pink-white', 'blue-purple', 'green-teal', 'orange-amber', 'indigo-violet')
   OR color_theme IS NULL
   OR color_theme = '';

-- Set default for any remaining invalid values
UPDATE user_preferences
SET color_theme = 'soft-minimal'
WHERE color_theme NOT IN ('monochrome', 'warm-neutrals', 'cool-neutrals', 'earth-tones', 'soft-minimal');

-- =====================================================================
-- STEP 4: Update initialize_user_preferences() Function
-- =====================================================================

CREATE OR REPLACE FUNCTION initialize_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_preferences (user_id, sidebar_mode, color_theme, free_form_mode_enabled)
  VALUES (NEW.id, 'collapsible', 'soft-minimal', false)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION initialize_user_preferences IS 'Initialize user preferences with default sidebar_mode and color_theme when user profile is created';

-- =====================================================================
-- STEP 5: Verification
-- =====================================================================

DO $$
DECLARE
  v_invalid_count integer;
  v_default_count integer;
BEGIN
  -- Check for invalid theme values
  SELECT COUNT(*) INTO v_invalid_count
  FROM user_preferences
  WHERE color_theme NOT IN ('monochrome', 'warm-neutrals', 'cool-neutrals', 'earth-tones', 'soft-minimal');

  IF v_invalid_count > 0 THEN
    RAISE WARNING '⚠ % users still have invalid theme values', v_invalid_count;
  ELSE
    RAISE NOTICE '✓ All users have valid theme values';
  END IF;

  -- Check default values
  SELECT COUNT(*) INTO v_default_count
  FROM user_preferences
  WHERE color_theme = 'soft-minimal';

  RAISE NOTICE '✓ % users have default theme (soft-minimal)', v_default_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Migration complete!';
  RAISE NOTICE 'Users can now select from 5 new color themes:';
  RAISE NOTICE '  - monochrome';
  RAISE NOTICE '  - warm-neutrals';
  RAISE NOTICE '  - cool-neutrals';
  RAISE NOTICE '  - earth-tones';
  RAISE NOTICE '  - soft-minimal (default)';
  RAISE NOTICE '';
END $$;
