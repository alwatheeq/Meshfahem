/*
  # Fix Profile SELECT Policy for 403 Forbidden Errors

  ## Problem
  Users are getting 403 Forbidden errors when trying to access their own profile.
  The SELECT policies might be too restrictive or conflicting.

  ## Solution
  1. Drop conflicting SELECT policies
  2. Create a single, clear SELECT policy that allows users to view their own profile
  3. Keep admin policy separate
  4. Ensure policy works even when profile doesn't exist yet
*/

-- =====================================================================
-- STEP 1: Drop Conflicting SELECT Policies
-- =====================================================================

-- Drop the complex policy that might be causing issues
DROP POLICY IF EXISTS "Authenticated users can view basic profile info" ON user_profiles;

-- Keep "Users can view own profile" but we'll recreate it to be sure
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;

-- Keep admin policy - it's fine
-- DROP POLICY IF EXISTS "Admins can view all user profiles" ON user_profiles;

-- =====================================================================
-- STEP 2: Create Clear, Simple SELECT Policies
-- =====================================================================

-- Policy 1: Users can always view their own profile (even if it doesn't exist yet, the query will return null)
CREATE POLICY "Users can view own profile"
ON user_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Policy 2: Admins can view all profiles (keep existing)
-- This should already exist, but ensure it's there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles'
      AND policyname = 'Admins can view all user profiles'
  ) THEN
    CREATE POLICY "Admins can view all user profiles"
    ON user_profiles
    FOR SELECT
    TO authenticated
    USING (is_admin_user());
  END IF;
END $$;

-- =====================================================================
-- STEP 3: Verify Policies
-- =====================================================================

DO $$
DECLARE
  v_user_policy_exists boolean;
  v_admin_policy_exists boolean;
BEGIN
  -- Check user policy
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles'
      AND policyname = 'Users can view own profile'
      AND cmd = 'SELECT'
      AND 'authenticated' = ANY(roles::text[])
  ) INTO v_user_policy_exists;

  IF v_user_policy_exists THEN
    RAISE NOTICE '✓ User SELECT policy created successfully';
  ELSE
    RAISE WARNING '⚠ User SELECT policy not found';
  END IF;

  -- Check admin policy
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles'
      AND policyname = 'Admins can view all user profiles'
      AND cmd = 'SELECT'
      AND 'authenticated' = ANY(roles::text[])
  ) INTO v_admin_policy_exists;

  IF v_admin_policy_exists THEN
    RAISE NOTICE '✓ Admin SELECT policy exists';
  ELSE
    RAISE WARNING '⚠ Admin SELECT policy not found';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'Policy fix complete!';
  RAISE NOTICE 'Users should now be able to view their own profiles.';
  RAISE NOTICE '';
END $$;

