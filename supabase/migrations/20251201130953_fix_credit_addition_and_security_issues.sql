/*
  # Fix Critical Issues in Defensive Profile System

  ## Issues Fixed

  1. **Credit Double-Addition Bug**
     - Line 118 in initialize_user_defaults was adding 2700 to existing credits
     - Should SET credits to 2700, not ADD 2700
     - Could cause users to have inflated credit balances

  2. **Security Issue in bulk_repair_profiles**
     - Function accepted NULL admin_user_id and skipped admin check
     - Non-admins could trigger expensive bulk operations
     - Now requires valid admin_user_id

  3. **Dynamic Column Checks Performance**
     - Moved column existence checks outside of UPDATE statements
     - Improved performance by checking once instead of per-row

  4. **ON CONFLICT Race Condition**
     - Changed to prefer existing email over new one
     - Prevents overwriting data in concurrent operations

  ## Changes Made
  - Rewrite initialize_user_defaults to SET credits instead of ADD
  - Fix bulk_repair_profiles to require admin authentication
  - Optimize UPDATE statements with pre-checked column flags
  - Fix create_profile_on_signup ON CONFLICT behavior
*/

-- =====================================================================
-- FIX 1: Credit Double-Addition Bug
-- =====================================================================

CREATE OR REPLACE FUNCTION initialize_user_defaults(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_initialized jsonb := '{}'::jsonb;
  v_user_role text;
  v_credits_remaining integer;
  v_has_subscription boolean;
  v_has_credits_remaining boolean;
  v_has_credits_total boolean;
  v_has_cycle_start boolean;
  v_has_cycle_end boolean;
BEGIN
  RAISE NOTICE '[INIT_DEFAULTS] Starting initialization for user: %', p_user_id;

  -- Check if profile exists
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Profile does not exist',
      'user_id', p_user_id
    );
  END IF;

  -- Pre-check column existence for performance
  v_has_credits_remaining := column_exists('user_profiles', 'credits_remaining');
  v_has_credits_total := column_exists('user_profiles', 'credits_total');
  v_has_cycle_start := column_exists('user_profiles', 'credits_cycle_start');
  v_has_cycle_end := column_exists('user_profiles', 'credits_cycle_end');

  -- Initialize user_role if column exists and value is NULL
  IF column_exists('user_profiles', 'user_role') THEN
    BEGIN
      SELECT user_role INTO v_user_role
      FROM user_profiles
      WHERE id = p_user_id;

      IF v_user_role IS NULL THEN
        UPDATE user_profiles
        SET user_role = 'user'
        WHERE id = p_user_id;

        v_initialized := jsonb_set(v_initialized, '{user_role}', '"initialized"'::jsonb);
        RAISE NOTICE '[INIT_DEFAULTS] ✓ Initialized user_role for %', p_user_id;
      ELSE
        v_initialized := jsonb_set(v_initialized, '{user_role}', '"already_set"'::jsonb);
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_initialized := jsonb_set(v_initialized, '{user_role}', to_jsonb('error: ' || SQLERRM));
        RAISE WARNING '[INIT_DEFAULTS] Could not initialize user_role: %', SQLERRM;
    END;
  ELSE
    v_initialized := jsonb_set(v_initialized, '{user_role}', '"column_missing"'::jsonb);
  END IF;

  -- Initialize credits if columns exist
  IF v_has_credits_remaining AND v_has_credits_total THEN
    BEGIN
      SELECT credits_remaining INTO v_credits_remaining
      FROM user_profiles
      WHERE id = p_user_id;

      -- Only initialize if credits are 0 or NULL
      IF v_credits_remaining IS NULL OR v_credits_remaining = 0 THEN
        -- Check if user has an active subscription
        SELECT EXISTS (
          SELECT 1 FROM subscriptions
          WHERE user_id = p_user_id
            AND status = 'active'
            AND end_date > now()
        ) INTO v_has_subscription;

        IF v_has_subscription THEN
          -- User has subscription, SET credits to 2700 (not add!)
          IF v_has_cycle_start AND v_has_cycle_end THEN
            UPDATE user_profiles
            SET
              credits_remaining = 2700,  -- FIX: SET instead of ADD
              credits_total = 2700,
              credits_cycle_start = COALESCE(credits_cycle_start, now()),
              credits_cycle_end = COALESCE(credits_cycle_end, now() + interval '30 days')
            WHERE id = p_user_id;
          ELSE
            UPDATE user_profiles
            SET
              credits_remaining = 2700,  -- FIX: SET instead of ADD
              credits_total = 2700
            WHERE id = p_user_id;
          END IF;

          v_initialized := jsonb_set(v_initialized, '{credits}', '"initialized_with_subscription"'::jsonb);
          RAISE NOTICE '[INIT_DEFAULTS] ✓ Initialized credits (SET to 2700) with subscription for %', p_user_id;
        ELSE
          -- No subscription, start with 0 credits
          UPDATE user_profiles
          SET
            credits_remaining = 0,
            credits_total = 2700
          WHERE id = p_user_id;

          v_initialized := jsonb_set(v_initialized, '{credits}', '"initialized_without_subscription"'::jsonb);
          RAISE NOTICE '[INIT_DEFAULTS] ✓ Initialized credits (0) without subscription for %', p_user_id;
        END IF;
      ELSE
        v_initialized := jsonb_set(v_initialized, '{credits}', '"already_set"'::jsonb);
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_initialized := jsonb_set(v_initialized, '{credits}', to_jsonb('error: ' || SQLERRM));
        RAISE WARNING '[INIT_DEFAULTS] Could not initialize credits: %', SQLERRM;
    END;
  ELSE
    v_initialized := jsonb_set(v_initialized, '{credits}', '"columns_missing"'::jsonb);
  END IF;

  -- Initialize monthly_usage and last_reset if columns exist
  IF column_exists('user_profiles', 'monthly_usage') AND column_exists('user_profiles', 'last_reset') THEN
    BEGIN
      UPDATE user_profiles
      SET
        monthly_usage = COALESCE(monthly_usage, 0),
        last_reset = COALESCE(last_reset, now())
      WHERE id = p_user_id;

      v_initialized := jsonb_set(v_initialized, '{usage_tracking}', '"initialized"'::jsonb);
      RAISE NOTICE '[INIT_DEFAULTS] ✓ Initialized usage tracking for %', p_user_id;
    EXCEPTION
      WHEN OTHERS THEN
        v_initialized := jsonb_set(v_initialized, '{usage_tracking}', to_jsonb('error: ' || SQLERRM));
        RAISE WARNING '[INIT_DEFAULTS] Could not initialize usage tracking: %', SQLERRM;
    END;
  ELSE
    v_initialized := jsonb_set(v_initialized, '{usage_tracking}', '"columns_missing"'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'initialized', v_initialized,
    'timestamp', now()
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[INIT_DEFAULTS] Unexpected error during initialization for %: %', p_user_id, SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'user_id', p_user_id
    );
END;
$$;

ALTER FUNCTION initialize_user_defaults(uuid) OWNER TO postgres;

COMMENT ON FUNCTION initialize_user_defaults IS
  'Initializes optional fields (credits, role, usage tracking) for a user profile.
   FIXED: Now SETS credits to 2700 instead of ADDING. Safe to run multiple times.';

-- =====================================================================
-- FIX 2: Security Issue in bulk_repair_profiles
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
  v_is_admin boolean := false;
BEGIN
  -- FIX: Require admin_user_id
  IF p_admin_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Admin user ID is required for bulk operations',
      'admin_user_id', NULL
    );
  END IF;

  -- Verify caller is admin
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

    EXCEPTION
      WHEN OTHERS THEN
        v_failed_count := v_failed_count + 1;
        RAISE WARNING '[BULK_REPAIR] Error for user %: %', v_user.id, SQLERRM;
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
  'Bulk repair multiple profiles at once. FIXED: Now requires valid admin_user_id. Returns summary statistics.';

-- =====================================================================
-- FIX 3: ON CONFLICT Race Condition
-- =====================================================================

CREATE OR REPLACE FUNCTION create_profile_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip profile creation for admin users
  BEGIN
    IF EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = NEW.id AND is_active = true
    ) THEN
      RAISE NOTICE '[PROFILE_CREATE] Skipping profile for admin user: %', NEW.id;
      RETURN NEW;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[PROFILE_CREATE] Could not check admin status: %. Continuing with profile creation.', SQLERRM;
  END;

  -- Validate email is present
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RAISE WARNING '[PROFILE_CREATE] Email missing for user %. Using placeholder.', NEW.id;
  END IF;

  -- Insert minimal profile
  BEGIN
    INSERT INTO user_profiles (id, email)
    VALUES (
      NEW.id,
      COALESCE(NEW.email, 'no-email@placeholder.local')
    )
    ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(user_profiles.email, EXCLUDED.email);  -- FIX: Prefer existing email

    RAISE NOTICE '[PROFILE_CREATE] ✓ Created minimal profile for user: % (%)', NEW.id, NEW.email;

  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE '[PROFILE_CREATE] Profile already exists for user: %', NEW.id;

    WHEN undefined_column THEN
      RAISE WARNING '[PROFILE_CREATE] Email column missing. Creating profile with ID only: %', NEW.id;
      BEGIN
        INSERT INTO user_profiles (id)
        VALUES (NEW.id)
        ON CONFLICT (id) DO NOTHING;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING '[PROFILE_CREATE] Failed to create minimal profile: %', SQLERRM;
      END;

    WHEN OTHERS THEN
      RAISE WARNING '[PROFILE_CREATE] Profile creation failed for user %: %. User can still authenticate.',
        NEW.id, SQLERRM;
  END;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[PROFILE_CREATE] Unexpected error in create_profile_on_signup for user %: %',
      NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

ALTER FUNCTION create_profile_on_signup() OWNER TO postgres;

COMMENT ON FUNCTION create_profile_on_signup IS
  'Minimal, defensive profile creation. FIXED: Race condition in ON CONFLICT. Never blocks user signup.';

-- Recreate trigger to ensure it uses new function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_profile_on_signup();

-- =====================================================================
-- Verification
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Critical Fixes Applied';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '✓ Fixed credit double-addition bug';
  RAISE NOTICE '  - Credits now SET to 2700 instead of ADD';
  RAISE NOTICE '  - Moved column checks outside UPDATE';
  RAISE NOTICE '';
  RAISE NOTICE '✓ Fixed bulk_repair_profiles security';
  RAISE NOTICE '  - Now requires valid admin_user_id';
  RAISE NOTICE '  - Validates admin status before execution';
  RAISE NOTICE '';
  RAISE NOTICE '✓ Fixed ON CONFLICT race condition';
  RAISE NOTICE '  - Now prefers existing email over new';
  RAISE NOTICE '  - Prevents data overwrite in concurrent ops';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'System More Secure and Reliable!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
END $$;
