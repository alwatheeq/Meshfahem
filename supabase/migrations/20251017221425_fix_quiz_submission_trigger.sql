/*
  # Fix Quiz Submission Trigger to Handle Missing User Profiles

  1. Changes
    - Update `update_user_stats_after_quiz()` function to handle cases where user_profiles doesn't exist
    - Add automatic user_profiles creation if missing
    - Add error handling to prevent quiz submission failures
    - Improve logging for debugging

  2. Security
    - Function remains SECURITY DEFINER for proper permissions
    - Still validates user ownership through RLS policies
*/

-- Drop and recreate the function with better error handling
CREATE OR REPLACE FUNCTION update_user_stats_after_quiz()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  profile_exists boolean;
  xp_gained integer;
BEGIN
  -- Calculate XP gained from this quiz
  xp_gained := 10 + FLOOR(NEW.score_percentage / 10);

  -- Check if user profile exists
  SELECT EXISTS(
    SELECT 1 FROM user_profiles WHERE id = NEW.user_id
  ) INTO profile_exists;

  -- If profile doesn't exist, create it
  IF NOT profile_exists THEN
    BEGIN
      INSERT INTO user_profiles (
        id,
        total_quizzes_completed,
        experience_points,
        level
      ) VALUES (
        NEW.user_id,
        1,
        xp_gained,
        calculate_user_level(xp_gained)
      );
      
      RAISE NOTICE 'Created user profile for user %', NEW.user_id;
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the quiz submission
      RAISE WARNING 'Failed to create user profile for %: %', NEW.user_id, SQLERRM;
      RETURN NEW;
    END;
  END IF;

  -- Update existing profile
  BEGIN
    UPDATE user_profiles
    SET
      total_quizzes_completed = total_quizzes_completed + 1,
      experience_points = experience_points + xp_gained,
      level = calculate_user_level(experience_points + xp_gained)
    WHERE id = NEW.user_id;

    RAISE NOTICE 'Updated stats for user %: +% XP, total quizzes: %', 
      NEW.user_id, xp_gained, (SELECT total_quizzes_completed FROM user_profiles WHERE id = NEW.user_id);
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the quiz submission
    RAISE WARNING 'Failed to update user profile stats for %: %', NEW.user_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS update_user_stats_after_quiz_trigger ON quiz_attempts;

CREATE TRIGGER update_user_stats_after_quiz_trigger
  AFTER INSERT ON quiz_attempts
  FOR EACH ROW
  EXECUTE FUNCTION update_user_stats_after_quiz();

-- Ensure calculate_user_level function exists (it should, but let's be safe)
CREATE OR REPLACE FUNCTION calculate_user_level(xp integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Level formula: level = floor(sqrt(xp / 100)) + 1
  -- Level 1 = 0 XP, Level 2 = 100 XP, Level 3 = 400 XP, Level 4 = 900 XP, etc.
  IF xp < 0 THEN
    RETURN 1;
  END IF;
  RETURN FLOOR(SQRT(xp / 100.0)) + 1;
END;
$$;
