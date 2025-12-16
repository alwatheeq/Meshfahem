/*
  # Grant Execute Permission for create_missing_profile Function

  ## Problem
  The `create_missing_profile` RPC function is missing GRANT EXECUTE permissions
  for authenticated users, causing 403 Forbidden errors when users try to access
  the profile page without an existing profile.

  ## Root Cause
  The function was created with `OWNER TO postgres` but no `GRANT EXECUTE` statement
  was included, preventing authenticated users from calling the function.

  ## Solution
  Add GRANT EXECUTE permission for authenticated users to the `create_missing_profile`
  function. This allows users to create their own profiles when missing.

  ## Security
  - Function uses SECURITY DEFINER (runs as postgres)
  - Function validates user exists in auth.users
  - Function only creates profile if it doesn't exist
  - RLS policies still apply to the created profile
  - Users can only create profiles for themselves (validated in function)

  ## Impact
  - Fixes 403 Forbidden errors on profile page
  - Allows automatic profile creation for missing profiles
  - No security risk - function already has proper validation
*/

-- =====================================================================
-- STEP 1: Verify function exists before granting permissions
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'create_missing_profile'
      AND pg_get_function_arguments(p.oid) LIKE 'p_user_id uuid, p_email text%'
  ) THEN
    RAISE EXCEPTION 'Function create_missing_profile(uuid, text) does not exist. Please run the profile_repair_and_monitoring_utilities migration first.';
  END IF;
  
  RAISE NOTICE '✓ Function create_missing_profile(uuid, text) found';
END $$;

-- =====================================================================
-- STEP 2: Grant Execute Permission to Authenticated Users
-- =====================================================================

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_missing_profile(uuid, text) TO authenticated;

COMMENT ON FUNCTION create_missing_profile(uuid, text) IS
  'Manually creates a missing profile for an existing auth.users record. 
   Emergency use only. Requires authenticated role to execute.';

-- =====================================================================
-- STEP 3: Verification
-- =====================================================================

DO $$
DECLARE
  v_has_permission boolean;
BEGIN
  -- Check if permission was granted
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'create_missing_profile'
      AND grantee = 'authenticated'
      AND privilege_type = 'EXECUTE'
  ) INTO v_has_permission;
  
  IF v_has_permission THEN
    RAISE NOTICE '✓ GRANT EXECUTE permission successfully added for authenticated users';
  ELSE
    RAISE WARNING '⚠ GRANT EXECUTE permission may not have been applied correctly';
  END IF;
END $$;

-- =====================================================================
-- STEP 4: Summary
-- =====================================================================

-- This migration adds the missing GRANT EXECUTE permission that was
-- omitted from the original function creation migration.
-- 
-- After this migration:
-- - Authenticated users can call create_missing_profile()
-- - Profile page will no longer show 403 Forbidden errors
-- - Missing profiles will be automatically created
-- 
-- Security: The function still validates user identity and only creates
-- profiles for users that exist in auth.users, maintaining security.

