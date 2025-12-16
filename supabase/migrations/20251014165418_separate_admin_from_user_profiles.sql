/*
  # Separate Admin Users from User Profiles
  
  ## Purpose
  This migration ensures complete separation between admin users and regular users:
  - Admin users (in admin_users table) should NEVER have records in user_profiles
  - Admin users should NEVER have records in subscriptions  
  - Prevent future contamination with triggers and constraints
  
  ## Changes
  
  1. **Data Cleanup**
     - Remove all user_profiles records for users in admin_users table
     - Remove all subscription records for users in admin_users table
     - Archive removed data for audit purposes
  
  2. **Triggers**
     - Add trigger to prevent INSERT into user_profiles for admin users
     - Add trigger to prevent INSERT into subscriptions for admin users
     
  3. **Policies**
     - Update RLS policies to explicitly exclude admin users
     
  4. **Audit Tables**
     - Create archive tables to track cleanup actions
*/

-- ============================================================================
-- STEP 1: Create audit/archive tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_user_profile_archive (
  id uuid,
  archived_at timestamptz NOT NULL DEFAULT now(),
  monthly_usage integer,
  last_reset timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  email text,
  reason text DEFAULT 'User moved to admin_users table'
);

COMMENT ON TABLE admin_user_profile_archive IS 'Archive of user_profiles records removed for admin users';

-- ============================================================================
-- STEP 2: Archive and remove user_profiles for admin users
-- ============================================================================

-- Archive existing user_profiles for admins
INSERT INTO admin_user_profile_archive (
  id, monthly_usage, last_reset, created_at, updated_at, email, archived_at
)
SELECT 
  up.id,
  up.monthly_usage,
  up.last_reset,
  up.created_at,
  up.updated_at,
  up.email,
  now()
FROM user_profiles up
INNER JOIN admin_users au ON up.id = au.id
WHERE au.is_active = true;

-- Delete user_profiles for admin users
DELETE FROM user_profiles
WHERE id IN (
  SELECT id FROM admin_users WHERE is_active = true
);

-- Log the cleanup
DO $$
DECLARE
  archived_count integer;
BEGIN
  SELECT COUNT(*) INTO archived_count FROM admin_user_profile_archive;
  RAISE NOTICE '✓ Archived and removed % user_profiles records for admin users', archived_count;
END $$;

-- ============================================================================
-- STEP 3: Create trigger to prevent admin users from being added to user_profiles
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_admin_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user is in admin_users table
  IF EXISTS (
    SELECT 1 FROM admin_users 
    WHERE id = NEW.id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Cannot create user_profile for admin user. Admin users are managed separately in admin_users table.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS prevent_admin_in_user_profiles ON user_profiles;

-- Create trigger
CREATE TRIGGER prevent_admin_in_user_profiles
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_admin_user_profile();

COMMENT ON FUNCTION prevent_admin_user_profile() IS 'Prevents admin users from being added to user_profiles table';

-- ============================================================================
-- STEP 4: Create trigger to prevent admin users from getting subscriptions
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_admin_subscription()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user is in admin_users table
  IF EXISTS (
    SELECT 1 FROM admin_users 
    WHERE id = NEW.user_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Cannot create subscription for admin user. Admin users have unrestricted access.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS prevent_admin_subscriptions ON subscriptions;

-- Create trigger
CREATE TRIGGER prevent_admin_subscriptions
  BEFORE INSERT ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_admin_subscription();

COMMENT ON FUNCTION prevent_admin_subscription() IS 'Prevents admin users from being added to subscriptions table';

-- ============================================================================
-- STEP 5: Remove any subscriptions for admin users
-- ============================================================================

-- Archive subscription data for admins (if we want to keep history)
CREATE TABLE IF NOT EXISTS admin_subscription_archive (
  id uuid,
  user_id uuid,
  archived_at timestamptz NOT NULL DEFAULT now(),
  subscription_tier text,
  status text,
  start_date timestamptz,
  end_date timestamptz,
  reason text DEFAULT 'User moved to admin_users table'
);

COMMENT ON TABLE admin_subscription_archive IS 'Archive of subscription records removed for admin users';

-- Archive existing subscriptions for admins
INSERT INTO admin_subscription_archive (
  id, user_id, subscription_tier, status, start_date, end_date, archived_at
)
SELECT 
  s.id,
  s.user_id,
  s.subscription_tier,
  s.status,
  s.start_date,
  s.end_date,
  now()
FROM subscriptions s
INNER JOIN admin_users au ON s.user_id = au.id
WHERE au.is_active = true;

-- Delete subscriptions for admin users
DELETE FROM subscriptions
WHERE user_id IN (
  SELECT id FROM admin_users WHERE is_active = true
);

-- Log the cleanup
DO $$
DECLARE
  archived_sub_count integer;
BEGIN
  SELECT COUNT(*) INTO archived_sub_count FROM admin_subscription_archive;
  RAISE NOTICE '✓ Archived and removed % subscription records for admin users', archived_sub_count;
END $$;

-- ============================================================================
-- STEP 6: Create helper function to check if user should have user_profile
-- ============================================================================

CREATE OR REPLACE FUNCTION is_regular_user(check_user_id uuid)
RETURNS boolean AS $$
BEGIN
  -- Regular user = exists in auth.users but NOT in admin_users (or inactive admin)
  RETURN NOT EXISTS (
    SELECT 1 FROM admin_users 
    WHERE id = check_user_id AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_regular_user(uuid) IS 'Returns true if user is a regular user (not an active admin)';

-- ============================================================================
-- STEP 7: Update existing policies to exclude admins
-- ============================================================================

-- The existing policies already use auth.uid() = id which is fine
-- But we add an extra safety layer to ensure admins don't accidentally get data

-- Add additional check to user_profiles INSERT policy
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id 
    AND is_regular_user(auth.uid())
  );

-- ============================================================================
-- STEP 8: Display summary
-- ============================================================================

DO $$
DECLARE
  total_admins integer;
  total_archived_profiles integer;
  total_archived_subs integer;
  remaining_user_profiles integer;
  remaining_subscriptions integer;
BEGIN
  SELECT COUNT(*) INTO total_admins FROM admin_users WHERE is_active = true;
  SELECT COUNT(*) INTO total_archived_profiles FROM admin_user_profile_archive;
  SELECT COUNT(*) INTO total_archived_subs FROM admin_subscription_archive;
  SELECT COUNT(*) INTO remaining_user_profiles FROM user_profiles;
  SELECT COUNT(*) INTO remaining_subscriptions FROM subscriptions;

  RAISE NOTICE '==================================================';
  RAISE NOTICE 'ADMIN/USER SEPARATION COMPLETED';
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'Active admin users: %', total_admins;
  RAISE NOTICE 'User profiles archived: %', total_archived_profiles;
  RAISE NOTICE 'Subscriptions archived: %', total_archived_subs;
  RAISE NOTICE 'Remaining user profiles: %', remaining_user_profiles;
  RAISE NOTICE 'Remaining subscriptions: %', remaining_subscriptions;
  RAISE NOTICE '';
  RAISE NOTICE 'Triggers installed:';
  RAISE NOTICE '  ✓ prevent_admin_in_user_profiles';
  RAISE NOTICE '  ✓ prevent_admin_subscriptions';
  RAISE NOTICE '';
  RAISE NOTICE 'Admin users are now completely separated from:';
  RAISE NOTICE '  - user_profiles table';
  RAISE NOTICE '  - subscriptions table';
  RAISE NOTICE '  - Any user-related data tracking';
  RAISE NOTICE '==================================================';
END $$;
