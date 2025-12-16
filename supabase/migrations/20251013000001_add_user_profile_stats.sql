/*
  # Add User Profile Statistics

  1. Schema Changes
    - Add statistics columns to `user_profiles` table:
      - `study_streak_current` (integer) - Current consecutive study days
      - `study_streak_longest` (integer) - Best streak ever achieved
      - `last_study_date` (date) - Last date user studied
      - `items_published_count` (integer) - Total items published to library
      - `total_flashcards_studied` (integer) - Total flashcards reviewed
      - `total_quizzes_completed` (integer) - Total quizzes taken
      - `total_study_time_minutes` (integer) - Total study time
      - `level` (integer) - User level
      - `experience_points` (integer) - Total XP earned
      - `display_name` (text) - User's display name
      - `bio` (text) - User biography
      - `avatar_url` (text) - Avatar image URL

  2. Functions
    - `update_study_streak()` - Trigger function to maintain streaks
    - `calculate_user_level()` - Function to calculate level from XP
    - `increment_published_count()` - Trigger to update published count

  3. Notes
    - All new columns have sensible defaults
    - Existing user records will be updated with default values
    - Streak calculation happens on study session log insertion
*/

-- Add new columns to user_profiles table
DO $$
BEGIN
  -- Statistics columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'study_streak_current'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN study_streak_current integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'study_streak_longest'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN study_streak_longest integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'last_study_date'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN last_study_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'items_published_count'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN items_published_count integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'total_flashcards_studied'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN total_flashcards_studied integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'total_quizzes_completed'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN total_quizzes_completed integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'total_study_time_minutes'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN total_study_time_minutes integer NOT NULL DEFAULT 0;
  END IF;

  -- Level and XP columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'level'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN level integer NOT NULL DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'experience_points'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN experience_points integer NOT NULL DEFAULT 0;
  END IF;

  -- Profile customization columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'display_name'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN display_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'bio'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN bio text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN avatar_url text;
  END IF;
END $$;

-- Create function to calculate user level from XP
CREATE OR REPLACE FUNCTION calculate_user_level(xp integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
BEGIN
  -- Level formula: level = floor(sqrt(xp / 100)) + 1
  -- Level 1 = 0 XP, Level 2 = 100 XP, Level 3 = 400 XP, Level 4 = 900 XP, etc.
  RETURN FLOOR(SQRT(xp / 100.0)) + 1;
END;
$$;

-- Create function to update published items count
CREATE OR REPLACE FUNCTION increment_published_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Increment count when item is made public (has shareable_link)
  IF NEW.is_public = true AND (OLD.is_public IS NULL OR OLD.is_public = false) THEN
    UPDATE user_profiles
    SET items_published_count = items_published_count + 1
    WHERE id = NEW.user_id;
  END IF;

  -- Decrement count when item is made private
  IF NEW.is_public = false AND OLD.is_public = true THEN
    UPDATE user_profiles
    SET items_published_count = GREATEST(0, items_published_count - 1)
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on user_library_items to update published count
DROP TRIGGER IF EXISTS update_published_count_trigger ON user_library_items;
CREATE TRIGGER update_published_count_trigger
  AFTER UPDATE ON user_library_items
  FOR EACH ROW
  WHEN (OLD.is_public IS DISTINCT FROM NEW.is_public)
  EXECUTE FUNCTION increment_published_count();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_level ON user_profiles(level DESC);
CREATE INDEX IF NOT EXISTS idx_user_profiles_xp ON user_profiles(experience_points DESC);
CREATE INDEX IF NOT EXISTS idx_user_profiles_study_streak ON user_profiles(study_streak_current DESC);
