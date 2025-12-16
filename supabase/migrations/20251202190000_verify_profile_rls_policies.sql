/*
  # Verify Profile RLS Policies

  ## Purpose
  Verify that RLS policies exist and are correctly configured for user_profiles table
  to ensure profile creation and access work correctly.

  ## Checks
  1. Verify INSERT policy exists for authenticated users
  2. Verify SELECT policy allows users to read their own profiles
  3. Verify UPDATE policy allows users to update their own profiles
  4. Ensure create_missing_profile function can bypass RLS (SECURITY DEFINER)
  5. Report any missing or misconfigured policies
*/

-- =====================================================================
-- STEP 1: Check Existing RLS Policies
-- =====================================================================

DO $$
DECLARE
  v_insert_policy_exists boolean;
  v_select_policy_exists boolean;
  v_update_policy_exists boolean;
  v_policy_count integer;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Profile RLS Policies Verification';
  RAISE NOTICE '========================================';

  -- Count total policies
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE tablename = 'user_profiles';

  RAISE NOTICE 'Total policies found: %', v_policy_count;

  -- Check for INSERT policy for authenticated users
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles'
      AND cmd = 'INSERT'
      AND 'authenticated' = ANY(roles::text[])
  ) INTO v_insert_policy_exists;

  IF v_insert_policy_exists THEN
    RAISE NOTICE '✓ INSERT policy exists for authenticated users';
  ELSE
    RAISE WARNING '⚠ INSERT policy missing for authenticated users';
  END IF;

  -- Check for SELECT policy for authenticated users
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles'
      AND cmd = 'SELECT'
      AND 'authenticated' = ANY(roles::text[])
  ) INTO v_select_policy_exists;

  IF v_select_policy_exists THEN
    RAISE NOTICE '✓ SELECT policy exists for authenticated users';
  ELSE
    RAISE WARNING '⚠ SELECT policy missing for authenticated users';
  END IF;

  -- Check for UPDATE policy for authenticated users
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles'
      AND cmd = 'UPDATE'
      AND 'authenticated' = ANY(roles::text[])
  ) INTO v_update_policy_exists;

  IF v_update_policy_exists THEN
    RAISE NOTICE '✓ UPDATE policy exists for authenticated users';
  ELSE
    RAISE WARNING '⚠ UPDATE policy missing for authenticated users';
  END IF;

  RAISE NOTICE '========================================';
END $$;

-- =====================================================================
-- STEP 2: Verify create_missing_profile Function Security
-- =====================================================================

DO $$
DECLARE
  v_function_security text;
  v_function_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'create_missing_profile'
  ) INTO v_function_exists;

  IF v_function_exists THEN
    SELECT pg_get_functiondef(p.oid) INTO v_function_security
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'create_missing_profile'
    LIMIT 1;

    IF v_function_security LIKE '%SECURITY DEFINER%' THEN
      RAISE NOTICE '✓ create_missing_profile uses SECURITY DEFINER (can bypass RLS)';
    ELSE
      RAISE WARNING '⚠ create_missing_profile does NOT use SECURITY DEFINER';
    END IF;
  ELSE
    RAISE WARNING '⚠ create_missing_profile function not found';
  END IF;
END $$;

-- =====================================================================
-- STEP 3: Display All Policies for user_profiles
-- =====================================================================

DO $$
DECLARE
  v_policy record;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Detailed Policy List:';
  RAISE NOTICE '----------------------------------------';

  FOR v_policy IN
    SELECT 
      policyname,
      cmd,
      roles,
      qual,
      with_check
    FROM pg_policies
    WHERE tablename = 'user_profiles'
    ORDER BY cmd, policyname
  LOOP
    RAISE NOTICE 'Policy: %', v_policy.policyname;
    RAISE NOTICE '  Command: %', v_policy.cmd;
    RAISE NOTICE '  Roles: %', array_to_string(v_policy.roles, ', ');
    RAISE NOTICE '  Qual: %', COALESCE(v_policy.qual, 'NULL');
    RAISE NOTICE '  With Check: %', COALESCE(v_policy.with_check, 'NULL');
    RAISE NOTICE '';
  END LOOP;

  RAISE NOTICE '========================================';
  RAISE NOTICE '';
END $$;

-- =====================================================================
-- STEP 4: Verification Summary Function
-- =====================================================================

CREATE OR REPLACE FUNCTION verify_profile_rls_policies()
RETURNS TABLE (
  check_name text,
  status text,
  details text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_insert_policy_exists boolean;
  v_select_policy_exists boolean;
  v_update_policy_exists boolean;
  v_function_security_definer boolean;
  v_policy_count integer;
BEGIN
  -- Count policies
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE tablename = 'user_profiles';

  RETURN QUERY SELECT 
    'Total policies'::text,
    CASE WHEN v_policy_count > 0 THEN 'PASS' ELSE 'FAIL' END::text,
    format('Found %s policies', v_policy_count)::text;

  -- Check INSERT policy
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles'
      AND cmd = 'INSERT'
      AND 'authenticated' = ANY(roles::text[])
  ) INTO v_insert_policy_exists;

  RETURN QUERY SELECT 
    'INSERT policy for authenticated'::text,
    CASE WHEN v_insert_policy_exists THEN 'PASS' ELSE 'FAIL' END::text,
    CASE WHEN v_insert_policy_exists 
      THEN 'INSERT policy exists for authenticated users'
      ELSE 'INSERT policy missing for authenticated users'
    END::text;

  -- Check SELECT policy
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles'
      AND cmd = 'SELECT'
      AND 'authenticated' = ANY(roles::text[])
  ) INTO v_select_policy_exists;

  RETURN QUERY SELECT 
    'SELECT policy for authenticated'::text,
    CASE WHEN v_select_policy_exists THEN 'PASS' ELSE 'FAIL' END::text,
    CASE WHEN v_select_policy_exists 
      THEN 'SELECT policy exists for authenticated users'
      ELSE 'SELECT policy missing for authenticated users'
    END::text;

  -- Check UPDATE policy
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles'
      AND cmd = 'UPDATE'
      AND 'authenticated' = ANY(roles::text[])
  ) INTO v_update_policy_exists;

  RETURN QUERY SELECT 
    'UPDATE policy for authenticated'::text,
    CASE WHEN v_update_policy_exists THEN 'PASS' ELSE 'FAIL' END::text,
    CASE WHEN v_update_policy_exists 
      THEN 'UPDATE policy exists for authenticated users'
      ELSE 'UPDATE policy missing for authenticated users'
    END::text;

  -- Check function security
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'create_missing_profile'
      AND pg_get_functiondef(p.oid) LIKE '%SECURITY DEFINER%'
  ) INTO v_function_security_definer;

  RETURN QUERY SELECT 
    'create_missing_profile SECURITY DEFINER'::text,
    CASE WHEN v_function_security_definer THEN 'PASS' ELSE 'FAIL' END::text,
    CASE WHEN v_function_security_definer 
      THEN 'Function uses SECURITY DEFINER (can bypass RLS)'
      ELSE 'Function does NOT use SECURITY DEFINER'
    END::text;
END;
$$;

COMMENT ON FUNCTION verify_profile_rls_policies IS 'Verification function to check RLS policies for user_profiles table';

GRANT EXECUTE ON FUNCTION verify_profile_rls_policies() TO authenticated;

-- =====================================================================
-- STEP 5: Run Verification and Display Results
-- =====================================================================

DO $$
DECLARE
  v_result record;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Running verification function...';
  RAISE NOTICE '';

  FOR v_result IN SELECT * FROM verify_profile_rls_policies() LOOP
    RAISE NOTICE '%: % - %', v_result.check_name, v_result.status, v_result.details;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE 'Migration complete!';
  RAISE NOTICE 'All RLS policies have been verified.';
  RAISE NOTICE 'If any checks failed, review the policy list above.';
  RAISE NOTICE '';
END $$;

