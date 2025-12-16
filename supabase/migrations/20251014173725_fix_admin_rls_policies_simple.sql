/*
  # Fix Admin RLS Policies After Admin/User Separation
  
  ## Problem
  Admin RLS policies are checking `user_profiles.user_role = 'admin'` but admins
  are no longer in the user_profiles table after the separation migration.
  
  ## Solution
  Update all admin-related RLS policies to use the `is_admin_user()` function
  which checks the admin_users table instead of user_profiles.
  
  ## Changes
  1. Drop old admin policies that check user_profiles.user_role
  2. Recreate them using is_admin_user() function
  3. Ensure admins can view all user data for dashboard
  4. Clean up any orphaned subscriptions for admin users
*/

-- ============================================================================
-- STEP 1: Fix user_profiles admin policies
-- ============================================================================

-- Drop old admin policies
DROP POLICY IF EXISTS "Admins can view all user profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all user profiles" ON user_profiles;

-- Recreate using is_admin_user() function
CREATE POLICY "Admins can view all user profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (is_admin_user());

CREATE POLICY "Admins can update all user profiles"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- ============================================================================
-- STEP 2: Fix user_history admin policies
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view all user history" ON user_history;

CREATE POLICY "Admins can view all user history"
  ON user_history
  FOR SELECT
  TO authenticated
  USING (is_admin_user());

-- ============================================================================
-- STEP 3: Fix user_library_items admin policies
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view all library items" ON user_library_items;

CREATE POLICY "Admins can view all library items"
  ON user_library_items
  FOR SELECT
  TO authenticated
  USING (is_admin_user());

-- ============================================================================
-- STEP 4: Fix user_feedback admin policies
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view all feedback" ON user_feedback;
DROP POLICY IF EXISTS "Admins can update feedback status" ON user_feedback;

CREATE POLICY "Admins can view all feedback"
  ON user_feedback
  FOR SELECT
  TO authenticated
  USING (is_admin_user());

CREATE POLICY "Admins can update feedback status"
  ON user_feedback
  FOR UPDATE
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- ============================================================================
-- STEP 5: Add admin policies for subscriptions
-- ============================================================================

-- Allow admins to view all subscriptions for dashboard
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON subscriptions;

CREATE POLICY "Admins can view all subscriptions"
  ON subscriptions
  FOR SELECT
  TO authenticated
  USING (is_admin_user());

-- ============================================================================
-- STEP 6: Add admin policies for user_folders
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view all folders" ON user_folders;

CREATE POLICY "Admins can view all folders"
  ON user_folders
  FOR SELECT
  TO authenticated
  USING (is_admin_user());

-- ============================================================================
-- STEP 7: Add admin policies for tags
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view all tags" ON tags;

CREATE POLICY "Admins can view all tags"
  ON tags
  FOR SELECT
  TO authenticated
  USING (is_admin_user());

-- ============================================================================
-- STEP 8: Clean up orphaned subscriptions for admin users
-- ============================================================================

-- Move any admin subscriptions to archive
INSERT INTO admin_subscription_archive (
  id, user_id, subscription_tier, status, start_date, end_date, archived_at, reason
)
SELECT 
  s.id,
  s.user_id,
  s.subscription_tier,
  s.status,
  s.start_date,
  s.end_date,
  now(),
  'Cleanup: subscription created before admin separation'
FROM subscriptions s
INNER JOIN admin_users au ON s.user_id = au.id
WHERE au.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM admin_subscription_archive asa 
    WHERE asa.id = s.id
  );

-- Delete orphaned subscriptions for admins
DELETE FROM subscriptions
WHERE user_id IN (
  SELECT id FROM admin_users WHERE is_active = true
);

-- ============================================================================
-- STEP 9: Summary
-- ============================================================================

DO $$
DECLARE
  cleaned_subscriptions integer;
  admin_count integer;
  user_count integer;
BEGIN
  SELECT COUNT(*) INTO cleaned_subscriptions 
  FROM admin_subscription_archive 
  WHERE reason = 'Cleanup: subscription created before admin separation';
  
  SELECT COUNT(*) INTO admin_count FROM admin_users WHERE is_active = true;
  SELECT COUNT(*) INTO user_count FROM user_profiles;
  
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'ADMIN RLS POLICIES FIXED';
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'Active admins: %', admin_count;
  RAISE NOTICE 'Regular users: %', user_count;
  RAISE NOTICE 'Admin subscriptions cleaned: %', cleaned_subscriptions;
  RAISE NOTICE '';
  RAISE NOTICE 'All admin policies now use is_admin_user() function';
  RAISE NOTICE 'Admins can now view all user data in dashboard';
  RAISE NOTICE '==================================================';
END $$;
