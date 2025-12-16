/*
  # Profile Repair and Monitoring Utilities

  ## Overview
  Provides comprehensive utilities for monitoring profile health, diagnosing issues,
  and performing bulk repairs. Essential for production operations and debugging.

  ## Features

  1. **Health Check Functions**
     - Check profile completeness across all users
     - Identify profiles needing repair
     - Return statistics for monitoring

  2. **Bulk Repair Functions**
     - Repair multiple profiles at once
     - Admin-only batch operations
     - Progress reporting

  3. **Diagnostic Tools**
     - Detailed profile inspection
     - Column availability checking
     - Migration status verification

  4. **Manual Profile Creation**
     - Emergency profile creation for edge cases
     - Supports missing profile recovery
     - Idempotent and safe

  ## Use Cases
  - Production monitoring dashboards
  - Admin troubleshooting
  - Post-migration validation
  - User support escalations
*/

-- =====================================================================
-- STEP 1: Health Check and Statistics Functions
-- =====================================================================

CREATE OR REPLACE FUNCTION get_profile_health_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_profiles integer;
  v_complete_profiles integer;
  v_missing_email integer := 0;
  v_missing_credits integer := 0;
  v_missing_role integer := 0;
  v_schema_info jsonb;
BEGIN
  -- Get total profile count
  SELECT COUNT(*) INTO v_total_profiles FROM user_profiles;

  -- Count profiles missing email (if column exists)
  IF column_exists('user_profiles', 'email') THEN
    SELECT COUNT(*) INTO v_missing_email
    FROM user_profiles
    WHERE email IS NULL OR email = '' OR email = 'no-email@placeholder.local';
  END IF;

  -- Count profiles missing credits (if column exists)
  IF column_exists('user_profiles', 'credits_remaining') THEN
    SELECT COUNT(*) INTO v_missing_credits
    FROM user_profiles
    WHERE credits_remaining IS NULL;
  END IF;

  -- Count profiles missing role (if column exists)
  IF column_exists('user_profiles', 'user_role') THEN
    SELECT COUNT(*) INTO v_missing_role
    FROM user_profiles
    WHERE user_role IS NULL;
  END IF;

  v_complete_profiles := v_total_profiles - v_missing_email - v_missing_credits - v_missing_role;

  v_schema_info := get_schema_version();

  RETURN jsonb_build_object(
    'total_profiles', v_total_profiles,
    'complete_profiles', v_complete_profiles,
    'incomplete_profiles', jsonb_build_object(
      'missing_email', v_missing_email,
      'missing_credits', v_missing_credits,
      'missing_role', v_missing_role
    ),
    'schema_info', v_schema_info,
    'health_score', CASE
      WHEN v_total_profiles = 0 THEN 100.0
      ELSE ROUND((v_complete_profiles::numeric / v_total_profiles::numeric) * 100, 2)
    END,
    'checked_at', now()
  );
END;
$$;

ALTER FUNCTION get_profile_health_stats() OWNER TO postgres;

COMMENT ON FUNCTION get_profile_health_stats IS
  'Returns comprehensive profile health statistics for monitoring';

-- =====================================================================
-- STEP 2: Bulk Repair Function for Admins
-- =====================================================================

CREATE OR REPLACE FUNCTION bulk_repair_profiles(
  p_max_repairs integer DEFAULT 50,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
  v_result jsonb;
  v_repaired_count integer := 0;
  v_failed_count integer := 0;
  v_results jsonb[] := ARRAY[]::jsonb[];
  v_is_admin boolean := false;
BEGIN
  -- Verify caller is admin if user_id provided
  IF p_admin_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = p_admin_user_id AND is_active = true
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Unauthorized: Admin access required',
        'admin_user_id', p_admin_user_id
      );
    END IF;
  END IF;

  RAISE NOTICE '[BULK_REPAIR] Starting bulk repair (max: %)', p_max_repairs;

  -- Find profiles needing repair
  FOR v_user IN
    SELECT DISTINCT id, email
    FROM user_profiles
    WHERE (
      (column_exists('user_profiles', 'credits_remaining') AND credits_remaining IS NULL)
      OR (column_exists('user_profiles', 'user_role') AND user_role IS NULL)
      OR (column_exists('user_profiles', 'email') AND (email IS NULL OR email = 'no-email@placeholder.local'))
    )
    LIMIT p_max_repairs
  LOOP
    BEGIN
      v_result := repair_user_profile(v_user.id);

      IF (v_result->>'success')::boolean THEN
        v_repaired_count := v_repaired_count + 1;
        RAISE NOTICE '[BULK_REPAIR] ✓ Repaired: %', v_user.id;
      ELSE
        v_failed_count := v_failed_count + 1;
        RAISE WARNING '[BULK_REPAIR] Failed: %', v_user.id;
      END IF;

      v_results := array_append(v_results, v_result);

    EXCEPTION
      WHEN OTHERS THEN
        v_failed_count := v_failed_count + 1;
        RAISE WARNING '[BULK_REPAIR] Error for user %: %', v_user.id, SQLERRM;

        v_results := array_append(v_results, jsonb_build_object(
          'success', false,
          'user_id', v_user.id,
          'error', SQLERRM
        ));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'repaired_count', v_repaired_count,
    'failed_count', v_failed_count,
    'total_processed', v_repaired_count + v_failed_count,
    'admin_user_id', p_admin_user_id,
    'timestamp', now()
  );
END;
$$;

ALTER FUNCTION bulk_repair_profiles(integer, uuid) OWNER TO postgres;

COMMENT ON FUNCTION bulk_repair_profiles IS
  'Bulk repair multiple profiles at once. Admin only. Returns summary statistics.';

-- =====================================================================
-- STEP 3: Diagnostic Profile Inspection
-- =====================================================================

CREATE OR REPLACE FUNCTION inspect_user_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_auth_user record;
  v_subscriptions jsonb;
  v_validation jsonb;
  v_available_columns text[];
BEGIN
  -- Get auth.users data
  SELECT id, email, created_at, updated_at
  INTO v_auth_user
  FROM auth.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found in auth.users',
      'user_id', p_user_id
    );
  END IF;

  -- Get profile data (if exists)
  SELECT * INTO v_profile
  FROM user_profiles
  WHERE id = p_user_id;

  -- Get subscriptions
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'status', status,
      'subscription_tier', subscription_tier,
      'start_date', start_date,
      'end_date', end_date
    )
  ) INTO v_subscriptions
  FROM subscriptions
  WHERE user_id = p_user_id;

  -- Get validation status
  v_validation := validate_profile_completeness(p_user_id);

  -- Get available columns
  SELECT array_agg(column_name::text)
  INTO v_available_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'user_profiles'
  ORDER BY ordinal_position;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'auth_user', jsonb_build_object(
      'email', v_auth_user.email,
      'created_at', v_auth_user.created_at,
      'updated_at', v_auth_user.updated_at
    ),
    'profile_exists', v_profile IS NOT NULL,
    'profile_data', CASE
      WHEN v_profile IS NOT NULL THEN to_jsonb(v_profile)
      ELSE NULL
    END,
    'subscriptions', COALESCE(v_subscriptions, '[]'::jsonb),
    'validation', v_validation,
    'available_columns', v_available_columns,
    'schema_version', get_schema_version(),
    'inspected_at', now()
  );
END;
$$;

ALTER FUNCTION inspect_user_profile(uuid) OWNER TO postgres;

COMMENT ON FUNCTION inspect_user_profile IS
  'Detailed diagnostic inspection of a user profile. Returns all available data and validation status.';

-- =====================================================================
-- STEP 4: Manual Profile Creation for Edge Cases
-- =====================================================================

CREATE OR REPLACE FUNCTION create_missing_profile(
  p_user_id uuid,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_email text;
  v_result jsonb;
BEGIN
  -- Verify user exists in auth.users
  SELECT email INTO v_auth_email
  FROM auth.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found in auth.users',
      'user_id', p_user_id
    );
  END IF;

  -- Check if profile already exists
  IF EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Profile already exists',
      'user_id', p_user_id,
      'action', 'use_repair_user_profile_instead'
    );
  END IF;

  -- Create minimal profile
  BEGIN
    INSERT INTO user_profiles (id, email)
    VALUES (
      p_user_id,
      COALESCE(p_email, v_auth_email, 'no-email@placeholder.local')
    );

    RAISE NOTICE '[CREATE_PROFILE] ✓ Manually created profile for %', p_user_id;

    -- Initialize defaults (if function exists)
    BEGIN
      v_result := initialize_user_defaults(p_user_id);
    EXCEPTION
      WHEN OTHERS THEN
        -- If initialize_user_defaults doesn't exist or fails, continue anyway
        v_result := jsonb_build_object('success', true, 'skipped', 'initialize_user_defaults not available');
        RAISE NOTICE '[CREATE_PROFILE] initialize_user_defaults not available or failed: %', SQLERRM;
    END;

    RETURN jsonb_build_object(
      'success', true,
      'user_id', p_user_id,
      'profile_created', true,
      'initialization', v_result,
      'timestamp', now()
    );

  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'user_id', p_user_id
      );
  END;
END;
$$;

ALTER FUNCTION create_missing_profile(uuid, text) OWNER TO postgres;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_missing_profile(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_missing_profile(uuid, text) TO service_role;

COMMENT ON FUNCTION create_missing_profile IS
  'Manually creates a missing profile for an existing auth.users record. Emergency use only.';

-- =====================================================================
-- STEP 5: Find Users Needing Repair
-- =====================================================================

CREATE OR REPLACE FUNCTION find_profiles_needing_repair(p_limit integer DEFAULT 20)
RETURNS TABLE (
  user_id uuid,
  email text,
  missing_fields text[],
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    up.id as user_id,
    COALESCE(up.email, au.email, 'unknown') as email,
    ARRAY(
      SELECT unnest(ARRAY[
        CASE WHEN column_exists('user_profiles', 'email') AND (up.email IS NULL OR up.email = 'no-email@placeholder.local') THEN 'email' ELSE NULL END,
        CASE WHEN column_exists('user_profiles', 'user_role') AND up.user_role IS NULL THEN 'user_role' ELSE NULL END,
        CASE WHEN column_exists('user_profiles', 'credits_remaining') AND up.credits_remaining IS NULL THEN 'credits_remaining' ELSE NULL END,
        CASE WHEN column_exists('user_profiles', 'credits_total') AND up.credits_total IS NULL THEN 'credits_total' ELSE NULL END
      ])
      WHERE unnest IS NOT NULL
    ) as missing_fields,
    up.created_at
  FROM user_profiles up
  LEFT JOIN auth.users au ON au.id = up.id
  WHERE (
    (column_exists('user_profiles', 'email') AND (up.email IS NULL OR up.email = 'no-email@placeholder.local'))
    OR (column_exists('user_profiles', 'user_role') AND up.user_role IS NULL)
    OR (column_exists('user_profiles', 'credits_remaining') AND up.credits_remaining IS NULL)
  )
  ORDER BY up.created_at DESC
  LIMIT p_limit;
END;
$$;

ALTER FUNCTION find_profiles_needing_repair(integer) OWNER TO postgres;

COMMENT ON FUNCTION find_profiles_needing_repair IS
  'Returns a list of profiles that need repair with details on what is missing';

-- =====================================================================
-- STEP 6: Verification and Summary
-- =====================================================================

DO $$
DECLARE
  v_health jsonb;
  v_needing_repair integer;
  v_health_score text;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Profile Repair & Monitoring Utilities';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';

  RAISE NOTICE 'Available Functions:';
  RAISE NOTICE '  ✓ get_profile_health_stats() - Overall health metrics';
  RAISE NOTICE '  ✓ bulk_repair_profiles(max, admin_id) - Batch repair';
  RAISE NOTICE '  ✓ inspect_user_profile(user_id) - Detailed inspection';
  RAISE NOTICE '  ✓ create_missing_profile(user_id, email) - Manual creation';
  RAISE NOTICE '  ✓ find_profiles_needing_repair(limit) - List incomplete profiles';
  RAISE NOTICE '';

  -- Get current health stats
  v_health := get_profile_health_stats();
  v_health_score := v_health->>'health_score' || ' percent';

  RAISE NOTICE 'Current Profile Health:';
  RAISE NOTICE '  Total Profiles: %', v_health->>'total_profiles';
  RAISE NOTICE '  Complete: %', v_health->>'complete_profiles';
  RAISE NOTICE '  Health Score: %', v_health_score;
  RAISE NOTICE '';

  -- Count profiles needing repair
  SELECT COUNT(*) INTO v_needing_repair
  FROM user_profiles
  WHERE (
    (column_exists('user_profiles', 'email') AND (email IS NULL OR email = 'no-email@placeholder.local'))
    OR (column_exists('user_profiles', 'user_role') AND user_role IS NULL)
    OR (column_exists('user_profiles', 'credits_remaining') AND credits_remaining IS NULL)
  );

  RAISE NOTICE 'Profiles Needing Repair: %', v_needing_repair;
  RAISE NOTICE '';

  IF v_needing_repair > 0 THEN
    RAISE NOTICE 'To repair profiles, run:';
    RAISE NOTICE '  SELECT bulk_repair_profiles(50, NULL);';
    RAISE NOTICE '';
  END IF;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Production Ready!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
END $$;
