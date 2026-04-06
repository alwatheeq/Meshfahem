/*
  # Fix Color Theme Constraint - Force Update

  ## Purpose
  Force update the CHECK constraint on user_preferences.color_theme to use the new theme names.
  The previous migration may not have properly updated the constraint.

  ## Problem
  Current constraint still has old values: 'pink-white', 'blue-purple', 'green-teal', 'orange-amber', 'indigo-violet'
  Code uses new values: 'monochrome', 'warm-neutrals', 'cool-neutrals', 'earth-tones', 'soft-minimal'
  This causes CHECK constraint violations when updating themes.

  ## Solution
  1. Drop existing constraint by exact name
  2. Add new constraint with correct theme values
  3. Backfill any invalid values
  4. Verify constraint is correct
*/

-- =====================================================================
-- STEP 1: Drop Existing Constraint by Exact Name
-- =====================================================================

ALTER TABLE user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_color_theme_check;

-- =====================================================================
-- STEP 2: Add New CHECK Constraint with Correct Values
-- =====================================================================

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_color_theme_check 
    CHECK (color_theme IN ('monochrome', 'warm-neutrals', 'cool-neutrals', 'earth-tones', 'soft-minimal'));

COMMENT ON COLUMN user_preferences.color_theme IS 'User-selected color theme. Options: monochrome, warm-neutrals, cool-neutrals, earth-tones, soft-minimal';

-- =====================================================================
-- STEP 3: Update Default Value
-- =====================================================================

ALTER TABLE user_preferences
  ALTER COLUMN color_theme SET DEFAULT 'soft-minimal';

-- =====================================================================
-- STEP 4: Backfill Invalid Values
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
-- STEP 5: Update initialize_user_preferences() Function
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
-- STEP 6: Verification
-- =====================================================================

DO $$
DECLARE
  v_constraint_exists boolean;
  v_invalid_count integer;
  v_constraint_def text;
BEGIN
  -- Check if constraint exists and get its definition
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_preferences'::regclass
      AND conname = 'user_preferences_color_theme_check'
  ) INTO v_constraint_exists;

  IF NOT v_constraint_exists THEN
    RAISE WARNING '⚠ Constraint user_preferences_color_theme_check does not exist after migration';
  ELSE
    -- Get constraint definition
    SELECT pg_get_constraintdef(oid) INTO v_constraint_def
    FROM pg_constraint
    WHERE conrelid = 'user_preferences'::regclass
      AND conname = 'user_preferences_color_theme_check';

    RAISE NOTICE '✓ Constraint exists: %', v_constraint_def;
  END IF;

  -- Check for invalid theme values
  SELECT COUNT(*) INTO v_invalid_count
  FROM user_preferences
  WHERE color_theme NOT IN ('monochrome', 'warm-neutrals', 'cool-neutrals', 'earth-tones', 'soft-minimal');

  IF v_invalid_count > 0 THEN
    RAISE WARNING '⚠ % users still have invalid theme values', v_invalid_count;
  ELSE
    RAISE NOTICE '✓ All users have valid theme values';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'Migration complete!';
  RAISE NOTICE 'Theme constraint updated to allow:';
  RAISE NOTICE '  - monochrome';
  RAISE NOTICE '  - warm-neutrals';
  RAISE NOTICE '  - cool-neutrals';
  RAISE NOTICE '  - earth-tones';
  RAISE NOTICE '  - soft-minimal (default)';
  RAISE NOTICE '';
END $$;
