/*
  # Create increment_user_usage function

  1. New Functions
    - `increment_user_usage` - Safely increment a user's monthly usage
      - Takes user_id_param (uuid) and pages_to_add (integer)
      - Atomically increments monthly_usage in user_profiles table
      - Creates user profile if it doesn't exist
      - Returns the new usage value

  2. Security
    - Function executes with definer's rights (bypasses RLS when called from Edge Functions)
    - Still respects the existing RLS policies for direct table access
*/

-- Create function to atomically increment user usage
CREATE OR REPLACE FUNCTION increment_user_usage(
  user_id_param uuid,
  pages_to_add integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS when called from Edge Functions
AS $$
DECLARE
  new_usage integer;
BEGIN
  -- Insert user profile if it doesn't exist, or update existing usage
  INSERT INTO user_profiles (id, monthly_usage, last_reset, created_at, updated_at)
  VALUES (user_id_param, pages_to_add, now(), now(), now())
  ON CONFLICT (id) 
  DO UPDATE SET 
    monthly_usage = user_profiles.monthly_usage + pages_to_add,
    updated_at = now()
  RETURNING monthly_usage INTO new_usage;
  
  RETURN new_usage;
END;
$$;

-- Grant execute permission to authenticated users (Edge Functions run as authenticated)
GRANT EXECUTE ON FUNCTION increment_user_usage(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_user_usage(uuid, integer) TO service_role;