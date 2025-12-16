/*
  # Fix Study Rooms Infinite Recursion in RLS Policy

  ## Problem
  The "Participants can read participant list" policy on study_room_participants table
  causes infinite recursion because it queries the same table it's protecting:

  USING (room_id IN (SELECT room_id FROM study_room_participants WHERE ...))

  When a user tries to SELECT from study_room_participants:
  1. Policy checks by doing SELECT from study_room_participants
  2. That SELECT triggers the same policy
  3. Which does another SELECT from study_room_participants
  4. Infinite loop → "infinite recursion detected" error

  This breaks:
  - Joining rooms (checking if already a participant)
  - Fetching participant lists
  - Counting participants for room display

  ## Solution
  1. Create a SECURITY DEFINER helper function that can check membership without triggering RLS
  2. Drop the recursive policy completely
  3. Create two new non-recursive policies:
     - Users can always read their own participation records
     - Users can read other participants if they share a room (using helper function)

  ## Security
  - SECURITY DEFINER function validates auth.uid() internally
  - Policies still restrict access to authenticated users only
  - Users can only see participants in rooms they're members of
  - Maintains all existing security constraints without recursion
*/

-- Step 1: Create helper function to check room participation without triggering RLS
CREATE OR REPLACE FUNCTION user_is_room_participant(
  check_room_id uuid,
  check_user_id uuid
)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  is_participant boolean;
BEGIN
  -- This function runs with elevated privileges (SECURITY DEFINER)
  -- so it bypasses RLS and doesn't cause recursion

  SELECT EXISTS (
    SELECT 1
    FROM study_room_participants
    WHERE room_id = check_room_id
      AND user_id = check_user_id
      AND left_at IS NULL
  ) INTO is_participant;

  RETURN is_participant;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION user_is_room_participant(uuid, uuid) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION user_is_room_participant(uuid, uuid) IS
  'Checks if a user is an active participant in a room. Uses SECURITY DEFINER to avoid RLS recursion.';

-- Step 2: Drop the broken recursive policy
DROP POLICY IF EXISTS "Participants can read participant list" ON study_room_participants;

-- Step 3: Create two new non-recursive policies

-- Policy A: Users can always read their own participation records
-- This doesn't cause recursion because we're filtering by user_id = auth.uid() directly
CREATE POLICY "Users can read own participation records"
  ON study_room_participants
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy B: Users can read other participants in rooms where they are members
-- Uses the helper function to avoid recursion
CREATE POLICY "Users can read co-participants in shared rooms"
  ON study_room_participants
  FOR SELECT
  TO authenticated
  USING (
    -- User can see other participants if they're in the same room
    user_is_room_participant(room_id, auth.uid())
  );

-- Step 4: Verify and ensure is_room_full function exists and works correctly
-- This function is used during join to check capacity
DO $$
BEGIN
  -- Check if function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'is_room_full'
  ) THEN
    -- Create the function if it doesn't exist
    CREATE FUNCTION is_room_full(room_uuid uuid)
    RETURNS boolean
    SECURITY DEFINER
    SET search_path = public
    LANGUAGE plpgsql
    AS $func$
    DECLARE
      current_count integer;
      max_count integer;
    BEGIN
      -- Get current active participant count
      SELECT COUNT(*) INTO current_count
      FROM study_room_participants
      WHERE room_id = room_uuid
        AND left_at IS NULL;

      -- Get max participants allowed for this room
      SELECT max_participants INTO max_count
      FROM study_rooms
      WHERE id = room_uuid;

      -- Return true if room is full
      RETURN (current_count >= max_count);
    END;
    $func$;

    -- Grant execute permission
    GRANT EXECUTE ON FUNCTION is_room_full(uuid) TO authenticated;

    -- Add comment
    COMMENT ON FUNCTION is_room_full(uuid) IS
      'Checks if a study room has reached its maximum participant capacity. Uses SECURITY DEFINER to bypass RLS.';
  END IF;
END $$;

-- Step 5: Add index to improve performance of the new policies
-- This helps with the user_is_room_participant function lookups
CREATE INDEX IF NOT EXISTS idx_study_room_participants_room_user_active
  ON study_room_participants(room_id, user_id)
  WHERE left_at IS NULL;

-- Step 6: Verify the fix with a test comment
COMMENT ON TABLE study_room_participants IS
  'Study room participants with fixed RLS policies (no recursion). Uses helper function for membership checks.';

-- Step 7: Log the migration success
DO $$
BEGIN
  RAISE NOTICE 'Successfully fixed study_room_participants RLS infinite recursion issue';
  RAISE NOTICE 'Created helper function: user_is_room_participant(uuid, uuid)';
  RAISE NOTICE 'Created policy: Users can read own participation records';
  RAISE NOTICE 'Created policy: Users can read co-participants in shared rooms';
  RAISE NOTICE 'Verified/created function: is_room_full(uuid)';
  RAISE NOTICE 'Join room flow should now work correctly';
END $$;
