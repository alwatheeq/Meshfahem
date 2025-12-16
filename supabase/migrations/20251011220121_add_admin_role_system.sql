/*
  # Add Admin Role System

  1. Schema Changes
    - Add `user_role` column to `user_profiles` table
      - Type: text with CHECK constraint ('user' or 'admin')
      - Default: 'user'
    - Add index on user_role for efficient role-based queries
  
  2. Functions
    - `is_admin()` - Helper function to check if current user is admin
    - Returns boolean indicating if authenticated user has admin role
  
  3. Security Updates
    - Add admin policies to `user_profiles` for viewing all profiles
    - Add admin policies to `user_history` for viewing all user history
    - Add admin policies to `user_library_items` for viewing all library items
    - Add admin policies to `user_feedback` for viewing and updating all feedback
    - Add admin policies to storage for viewing all feedback media
  
  4. Notes
    - Initial system will have no admins - promote users manually via SQL
    - To make a user admin: UPDATE user_profiles SET user_role = 'admin' WHERE id = 'user-uuid'
    - All existing users default to 'user' role
    - Admin role provides read access to all user data and write access to feedback status
*/

-- Add user_role column to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'user_role'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN user_role text NOT NULL DEFAULT 'user' CHECK (user_role IN ('user', 'admin'));
  END IF;
END $$;

-- Create index on user_role for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(user_role);

-- Create helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND user_role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin policies for user_profiles (view all users)
CREATE POLICY "Admins can view all user profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Admin policies for user_history (view all user history)
CREATE POLICY "Admins can view all user history"
  ON user_history
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Admin policies for user_library_items (view all library items)
CREATE POLICY "Admins can view all library items"
  ON user_library_items
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Admin policies for user_feedback (view and update all feedback)
CREATE POLICY "Admins can view all feedback"
  ON user_feedback
  FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can update feedback status"
  ON user_feedback
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Admin policy for storage (view all feedback media)
CREATE POLICY "Admins can view all feedback media"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'feedback-media' AND is_admin());