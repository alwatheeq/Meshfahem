/*
  # Fix Study Rooms Display Names RLS Policy

  ## Summary
  This migration adds RLS policy to allow users to read display names of other participants in their study rooms.

  ## Problem
  Users could only read their own display names, causing "Anonymous" to show for other participants.

  ## Solution
  Add policy that allows reading user profiles of people in the same active rooms.

  ## Security
  - Still maintains RLS protection
  - Only allows reading profiles of co-participants in active rooms
  - Requires user to be an active participant (not left)
*/

-- Create policy to allow reading display names of room participants
CREATE POLICY "Users can view room participants display names"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (
    -- Users can read their own profile
    id = auth.uid()
    OR
    -- Users can read profiles of people in their active rooms
    id IN (
      SELECT DISTINCT srp.user_id
      FROM study_room_participants srp
      WHERE srp.room_id IN (
        -- Get all rooms where the requesting user is a participant
        SELECT room_id
        FROM study_room_participants
        WHERE user_id = auth.uid()
          AND left_at IS NULL
      )
      AND srp.left_at IS NULL
    )
  );