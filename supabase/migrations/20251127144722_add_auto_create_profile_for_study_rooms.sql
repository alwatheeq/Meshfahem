/*
  # Add Auto-Create Profile Function for Study Rooms

  ## Purpose
  Automatically create user profile if it doesn't exist during room creation.
  This handles edge cases where users might not have profiles yet.

  ## Function
  Creates or ensures user profile exists with minimal required fields.

  ## Security
  - SECURITY DEFINER to bypass RLS during creation
  - Validates user exists in auth.users
  - Only creates if profile doesn't exist
*/

-- Create function to auto-create user profile if missing
CREATE OR REPLACE FUNCTION ensure_user_profile_for_room(user_uuid uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  profile_exists boolean;
  user_email text;
BEGIN
  -- Check if profile already exists
  SELECT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = user_uuid
  ) INTO profile_exists;

  IF profile_exists THEN
    RETURN true;
  END IF;

  -- Get user email from auth.users
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = user_uuid;

  IF user_email IS NULL THEN
    RAISE EXCEPTION 'User not found in auth.users';
  END IF;

  -- Create minimal profile
  INSERT INTO user_profiles (
    id,
    email,
    display_name,
    created_at,
    updated_at
  ) VALUES (
    user_uuid,
    user_email,
    COALESCE(
      SPLIT_PART(user_email, '@', 1),
      'User'
    ),
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail
    RAISE WARNING 'Failed to create user profile: %', SQLERRM;
    RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_user_profile_for_room(uuid) TO authenticated;

COMMENT ON FUNCTION ensure_user_profile_for_room(uuid) IS 
  'Ensures user profile exists, creating one if missing. Used before room creation.';