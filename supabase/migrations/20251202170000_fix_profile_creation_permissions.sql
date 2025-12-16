/*
  # Fix Profile Creation Permissions

  ## Problem
  Users cannot access profile page - getting errors when profile doesn't exist.
  The create_missing_profile function may not have proper permissions.

  ## Solution
  1. Re-grant EXECUTE permission on create_missing_profile function
  2. Verify function exists and has correct signature
  3. Ensure RLS policies allow profile creation
  4. Add diagnostic queries
*/

-- =====================================================================
-- STEP 1: Verify Function Exists
-- =====================================================================

DO $$
DECLARE
  v_function_exists boolean;
BEGIN
  -- Check if function exists (handles DEFAULT clause in signature)
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'create_missing_profile'
      AND pg_get_function_arguments(p.oid) LIKE 'p_user_id uuid, p_email text%'
  ) INTO v_function_exists;
  
  IF NOT v_function_exists THEN
    RAISE EXCEPTION 'Function create_missing_profile(uuid, text) does not exist. Please run the profile_repair_and_monitoring_utilities migration first.';
  END IF;
  
  RAISE NOTICE '✓ Function create_missing_profile(uuid, text) found';
END $$;

-- =====================================================================
-- STEP 2: Grant Execute Permission to Authenticated Users
-- =====================================================================

-- Revoke and re-grant to ensure clean state
REVOKE EXECUTE ON FUNCTION create_missing_profile(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION create_missing_profile(uuid, text) TO authenticated;

-- Also grant to service_role for edge functions
GRANT EXECUTE ON FUNCTION create_missing_profile(uuid, text) TO service_role;

COMMENT ON FUNCTION create_missing_profile(uuid, text) IS
  'Manually creates a missing profile for an existing auth.users record. 
   Emergency use only. Requires authenticated role to execute.';

-- =====================================================================
-- STEP 3: Verify RLS Policies Allow Profile Creation
-- =====================================================================

-- Check if RLS is enabled on user_profiles
DO $$
DECLARE
  v_rls_enabled boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'user_profiles';

  IF v_rls_enabled THEN
    RAISE NOTICE '✓ RLS is enabled on user_profiles';
    
    -- Check if there's a policy that allows INSERT for authenticated users
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'user_profiles'
        AND policyname LIKE '%insert%'
        AND 'authenticated' = ANY(roles::text[])
    ) THEN
      RAISE NOTICE '✓ INSERT policy exists for authenticated users';
    ELSE
      RAISE WARNING '⚠ No INSERT policy found for authenticated users on user_profiles';
      RAISE NOTICE '  Note: create_missing_profile uses SECURITY DEFINER, so it should work even without INSERT policy';
    END IF;
  ELSE
    RAISE WARNING '⚠ RLS is NOT enabled on user_profiles';
  END IF;
END $$;

-- =====================================================================
-- STEP 4: Ensure ensure_user_profile Function Has Permissions
-- =====================================================================

-- Check if ensure_user_profile exists and grant permissions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'ensure_user_profile'
  ) THEN
    GRANT EXECUTE ON FUNCTION ensure_user_profile(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION ensure_user_profile(uuid) TO service_role;
    RAISE NOTICE '✓ Granted EXECUTE permission on ensure_user_profile';
  ELSE
    RAISE NOTICE '⚠ Function ensure_user_profile does not exist - skipping';
  END IF;
END $$;

-- =====================================================================
-- STEP 5: Verification Function
-- =====================================================================

CREATE OR REPLACE FUNCTION verify_profile_creation_permissions()
RETURNS TABLE (
  check_name text,
  status text,
  details text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_permission boolean;
  v_function_exists boolean;
  v_rls_enabled boolean;
BEGIN
  -- Check if create_missing_profile has execute permission
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'create_missing_profile'
      AND grantee = 'authenticated'
      AND privilege_type = 'EXECUTE'
  ) INTO v_has_permission;

  RETURN QUERY SELECT 
    'create_missing_profile EXECUTE permission'::text,
    CASE WHEN v_has_permission THEN 'PASS' ELSE 'FAIL' END::text,
    CASE WHEN v_has_permission 
      THEN 'Function has EXECUTE permission for authenticated role'
      ELSE 'Function is MISSING EXECUTE permission for authenticated role'
    END::text;

  -- Check if function exists (handles DEFAULT clause in signature)
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'create_missing_profile'
      AND pg_get_function_arguments(p.oid) LIKE 'p_user_id uuid, p_email text%'
  ) INTO v_function_exists;

  RETURN QUERY SELECT 
    'create_missing_profile function exists'::text,
    CASE WHEN v_function_exists THEN 'PASS' ELSE 'FAIL' END::text,
    CASE WHEN v_function_exists 
      THEN 'Function exists with correct signature'
      ELSE 'Function does not exist or has wrong signature'
    END::text;

  -- Check RLS status
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'user_profiles';

  RETURN QUERY SELECT 
    'RLS enabled on user_profiles'::text,
    CASE WHEN v_rls_enabled THEN 'PASS' ELSE 'WARNING' END::text,
    CASE WHEN v_rls_enabled 
      THEN 'RLS is enabled (required for security)'
      ELSE 'RLS is NOT enabled (security risk)'
    END::text;
END;
$$;

COMMENT ON FUNCTION verify_profile_creation_permissions IS 'Verification function to check if profile creation permissions are correctly configured';

GRANT EXECUTE ON FUNCTION verify_profile_creation_permissions() TO authenticated;

-- =====================================================================
-- STEP 6: Summary
-- =====================================================================

-- Run verification and display results
DO $$
DECLARE
  v_result record;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Profile Creation Permissions Check';
  RAISE NOTICE '========================================';
  
  FOR v_result IN SELECT * FROM verify_profile_creation_permissions() LOOP
    RAISE NOTICE '%: % - %', v_result.check_name, v_result.status, v_result.details;
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
END $$;

