/*
  # Fix Study Rooms - Ambiguous Column Error & Complete Cleanup

  ## Issues Fixed
  1. Ambiguous 'user_id' column reference in get_room_participants_with_profiles
  2. Verify RLS policies for study_room_participants updates
  3. Add indexes for better performance

  ## Changes
  1. Drop and recreate get_room_participants_with_profiles with explicit table aliases
  2. Ensure UPDATE policy allows left_at column updates
  3. Add performance indexes
*/

-- Drop and recreate the function with explicit table aliases to fix ambiguous column error
DROP FUNCTION IF EXISTS get_room_participants_with_profiles(uuid);

CREATE OR REPLACE FUNCTION get_room_participants_with_profiles(room_uuid uuid)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  joined_at timestamptz,
  is_host boolean
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Fix: Use explicit table alias 'srp' in WHERE clause to avoid ambiguity
  IF NOT EXISTS (
    SELECT 1 
    FROM study_room_participants srp
    WHERE srp.room_id = room_uuid 
      AND srp.user_id = auth.uid()
      AND srp.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Access denied: Not a participant in this room';
  END IF;

  -- Return participant data with profile information using explicit aliases
  RETURN QUERY
  SELECT 
    srp.user_id,
    COALESCE(up.display_name, 'Anonymous') as display_name,
    up.avatar_url,
    srp.joined_at,
    srp.is_host
  FROM study_room_participants srp
  LEFT JOIN user_profiles up ON up.id = srp.user_id
  WHERE srp.room_id = room_uuid
    AND srp.left_at IS NULL
  ORDER BY srp.joined_at ASC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_room_participants_with_profiles(uuid) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION get_room_participants_with_profiles(uuid) IS 
  'Returns participant list with profile info for a room. Only accessible to room participants. Fixed ambiguous column references.';

-- Verify and recreate UPDATE policy for study_room_participants if needed
DO $$
BEGIN
  -- Drop existing policy if it exists
  DROP POLICY IF EXISTS "Users can update own participation" ON study_room_participants;
  
  -- Create policy that explicitly allows updating left_at column
  CREATE POLICY "Users can update own participation"
    ON study_room_participants
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
END $$;

-- Add index for faster leave room queries
CREATE INDEX IF NOT EXISTS idx_study_room_participants_user_left 
  ON study_room_participants(user_id, left_at);

-- Add index for room participant counts
CREATE INDEX IF NOT EXISTS idx_study_room_participants_room_active 
  ON study_room_participants(room_id, left_at) 
  WHERE left_at IS NULL;

-- Verify chat messages RLS (for now, will be deprecated when using Zego chat)
DO $$
BEGIN
  -- Ensure chat messages can be read by participants
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'room_chat_messages' 
    AND policyname = 'Participants can read chat messages'
  ) THEN
    CREATE POLICY "Participants can read chat messages"
      ON room_chat_messages
      FOR SELECT
      TO authenticated
      USING (
        room_id IN (
          SELECT srp.room_id
          FROM study_room_participants srp
          WHERE srp.user_id = auth.uid()
            AND srp.left_at IS NULL
        )
      );
  END IF;
END $$;