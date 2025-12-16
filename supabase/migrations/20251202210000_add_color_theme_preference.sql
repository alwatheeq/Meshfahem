/*
  # Add Color Theme Preference

  ## Purpose
  Add color_theme column to user_preferences table to allow users to select from
  5 beautiful color theme pairs (Pink & White, Blue & Purple, Green & Teal, Orange & Amber, Indigo & Violet).

  ## Changes
  1. Add color_theme column to user_preferences table
  2. Default value: 'blue-purple' (current default theme)
  3. CHECK constraint to ensure only valid theme values
  4. Update initialize_user_preferences() function to include color_theme
*/

-- =====================================================================
-- STEP 1: Add color_theme Column
-- =====================================================================

ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS color_theme text NOT NULL DEFAULT 'blue-purple'
CHECK (color_theme IN ('pink-white', 'blue-purple', 'green-teal', 'orange-amber', 'indigo-violet'));

COMMENT ON COLUMN user_preferences.color_theme IS 'User-selected color theme. Options: pink-white, blue-purple, green-teal, orange-amber, indigo-violet';

-- =====================================================================
-- STEP 2: Update initialize_user_preferences() Function
-- =====================================================================

CREATE OR REPLACE FUNCTION initialize_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_preferences (user_id, sidebar_mode, color_theme)
  VALUES (NEW.id, 'collapsible', 'blue-purple')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION initialize_user_preferences IS 'Initialize user preferences with default sidebar_mode and color_theme when user profile is created';

-- =====================================================================
-- STEP 3: Backfill Existing Records
-- =====================================================================

-- Set default theme for existing users who don't have a color_theme set
UPDATE user_preferences
SET color_theme = 'blue-purple'
WHERE color_theme IS NULL OR color_theme = '';

-- =====================================================================
-- STEP 4: Verification
-- =====================================================================

DO $$
DECLARE
  v_column_exists boolean;
  v_default_count integer;
BEGIN
  -- Check if column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_preferences'
      AND column_name = 'color_theme'
  ) INTO v_column_exists;

  IF v_column_exists THEN
    RAISE NOTICE '✓ color_theme column added successfully';
  ELSE
    RAISE WARNING '⚠ color_theme column not found';
  END IF;

  -- Check default values
  SELECT COUNT(*) INTO v_default_count
  FROM user_preferences
  WHERE color_theme = 'blue-purple';

  RAISE NOTICE '✓ % users have default theme (blue-purple)', v_default_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Migration complete!';
  RAISE NOTICE 'Users can now select from 5 color themes:';
  RAISE NOTICE '  - pink-white';
  RAISE NOTICE '  - blue-purple (default)';
  RAISE NOTICE '  - green-teal';
  RAISE NOTICE '  - orange-amber';
  RAISE NOTICE '  - indigo-violet';
  RAISE NOTICE '';
END $$;

