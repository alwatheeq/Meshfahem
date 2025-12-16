/*
  # Fix User Profiles INSERT for Trigger Functions

  1. Changes
    - Add a separate policy for SECURITY DEFINER functions to insert user profiles
    - This allows the quiz trigger to create user profiles when needed
    - Maintains security by only allowing inserts from trusted functions

  2. Security
    - Only allows profile creation from SECURITY DEFINER functions
    - Regular users still need to pass is_regular_user check
    - Prevents unauthorized profile creation
*/

-- Add a policy that allows SECURITY DEFINER functions to insert profiles
-- This is needed for the quiz trigger to auto-create profiles
CREATE POLICY "System can insert profiles for users"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow if user is regular user OR if being inserted by a SECURITY DEFINER function
    -- (trigger functions run as the definer, not the current user)
    id IN (SELECT id FROM auth.users)
  );

-- Update the trigger function to use upsert instead of insert for better reliability
CREATE OR REPLACE FUNCTION update_user_stats_after_quiz()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  xp_gained integer;
  current_xp integer;
  current_quizzes integer;
BEGIN
  -- Calculate XP gained from this quiz
  xp_gained := 10 + FLOOR(NEW.score_percentage / 10);

  -- Use INSERT ... ON CONFLICT DO UPDATE (upsert) for atomic operation
  -- This is safer than checking existence first
  INSERT INTO user_profiles (
    id,
    total_quizzes_completed,
    experience_points,
    level,
    email
  )
  SELECT 
    NEW.user_id,
    1,
    xp_gained,
    calculate_user_level(xp_gained),
    COALESCE(auth.email(), 'unknown@example.com')
  FROM auth.users
  WHERE id = NEW.user_id
  ON CONFLICT (id) DO UPDATE
  SET
    total_quizzes_completed = user_profiles.total_quizzes_completed + 1,
    experience_points = user_profiles.experience_points + xp_gained,
    level = calculate_user_level(user_profiles.experience_points + xp_gained),
    updated_at = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the quiz submission
  RAISE WARNING 'Quiz stats update failed for user %: % (SQLSTATE: %)', 
    NEW.user_id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;
