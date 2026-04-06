/*
  # Add Rose Pink Theme & Fix Sky Blue

  ## Purpose
  Force update the CHECK constraint on user_preferences.color_theme to include 'rose-pink' 
  and replace 'earth-tones' with 'sky-blue' to match the frontend codebase.

  ## Solution
  1. Drop existing constraint by exact name
  2. Add new constraint with correct theme values
  3. Backfill any invalid values
*/

-- =====================================================================
-- STEP 1: Drop Existing Constraint
-- =====================================================================

ALTER TABLE "public"."user_preferences"
  DROP CONSTRAINT IF EXISTS "user_preferences_color_theme_check";

-- =====================================================================
-- STEP 2: Add New CHECK Constraint with Correct Values
-- =====================================================================

ALTER TABLE "public"."user_preferences"
  ADD CONSTRAINT "user_preferences_color_theme_check" 
    CHECK (color_theme IN ('monochrome', 'warm-neutrals', 'cool-neutrals', 'sky-blue', 'soft-minimal', 'rose-pink'));

COMMENT ON COLUMN user_preferences.color_theme IS 'User-selected color theme. Options: monochrome, warm-neutrals, cool-neutrals, sky-blue, soft-minimal, rose-pink';

-- =====================================================================
-- STEP 3: Backfill Invalid Values
-- =====================================================================

-- Map earth-tones to sky-blue since that's what the frontend uses
UPDATE user_preferences
SET color_theme = 'sky-blue'
WHERE color_theme = 'earth-tones';

-- Set default for any remaining invalid values
UPDATE user_preferences
SET color_theme = 'soft-minimal'
WHERE color_theme NOT IN ('monochrome', 'warm-neutrals', 'cool-neutrals', 'sky-blue', 'soft-minimal', 'rose-pink');
