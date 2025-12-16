/*
  # Optional Field Initialization System

  ## Overview
  Provides separate initialization for optional user_profiles fields like credits,
  roles, and other features. This decouples optional features from core profile creation,
  ensuring that signup never fails even if these fields are missing.

  ## Philosophy
  - Base profile created first (minimal: id, email)
  - Optional fields initialized separately by this system
  - Failures in optional initialization don't block signup
  - Dynamic column checking ensures compatibility
  - Can be re-run to repair incomplete profiles

  ## Changes

  1. **initialize_user_defaults Function**
     - Checks which optional columns exist
     - Initializes credits if credit system available
     - Sets user_role if column exists
     - Idempotent: safe to run multiple times
     - Returns status of what was initialized

  2. **AFTER INSERT Trigger on user_profiles**
     - Runs immediately after profile creation
     - Calls initialize_user_defaults() automatically
     - Failure doesn't roll back profile creation
     - Logs all operations for debugging

  3. **Manual Initialization Function**
     - Allows frontend to retry initialization
     - Useful for profile repair scenarios
     - Returns detailed status report
     - Can be called by user or admin

  ## Use Cases
  - New user signup (automatic initialization)
  - Profile repair (manual re-initialization)
  - Migration rollout (gradual feature enablement)
  - Schema evolution (new fields added over time)
*/

-- =====================================================================
-- STEP 1: Create Optional Field Initialization Function
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
  IF column_exists('user_profiles', 'credits_remaining') AND column_exists('user_profiles', 'credits_total') THEN
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
          -- User has subscription, give them full credits
          UPDATE user_profiles
          SET
            credits_remaining = COALESCE(credits_remaining, 0) + 2700,
            credits_total = 2700,
            credits_cycle_start = CASE
              WHEN column_exists('user_profiles', 'credits_cycle_start')
              THEN COALESCE(credits_cycle_start, now())
              ELSE NULL
            END,
            credits_cycle_end = CASE
              WHEN column_exists('user_profiles', 'credits_cycle_end')
              THEN COALESCE(credits_cycle_end, now() + interval '30 days')
              ELSE NULL
            END
          WHERE id = p_user_id;

          v_initialized := jsonb_set(v_initialized, '{credits}', '"initialized_with_subscription"'::jsonb);
          RAISE NOTICE '[INIT_DEFAULTS] ✓ Initialized credits (2700) with subscription for %', p_user_id;
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
   Safe to run multiple times. Returns status of what was initialized.';

-- =====================================================================
-- STEP 2: Create Trigger to Auto-Initialize After Profile Creation
-- =====================================================================

CREATE OR REPLACE FUNCTION trigger_initialize_user_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Run initialization asynchronously (don't block on errors)
  BEGIN
    v_result := initialize_user_defaults(NEW.id);
    RAISE NOTICE '[TRIGGER_INIT] Initialization result for %: %', NEW.id, v_result;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[TRIGGER_INIT] Initialization failed for %: %. Profile still usable.', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION trigger_initialize_user_defaults() OWNER TO postgres;

-- Create trigger
DROP TRIGGER IF EXISTS initialize_user_defaults_trigger ON user_profiles;

CREATE TRIGGER initialize_user_defaults_trigger
  AFTER INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_initialize_user_defaults();

COMMENT ON TRIGGER initialize_user_defaults_trigger ON user_profiles IS
  'Automatically initializes optional fields after profile creation';

-- =====================================================================
-- STEP 3: Create Manual Initialization Endpoint for Repairs
-- =====================================================================

CREATE OR REPLACE FUNCTION repair_user_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_check jsonb;
  v_init_result jsonb;
BEGIN
  RAISE NOTICE '[PROFILE_REPAIR] Starting profile repair for user: %', p_user_id;

  -- First, validate profile exists
  v_profile_check := validate_profile_completeness(p_user_id);

  IF (v_profile_check->>'exists')::boolean = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Profile does not exist',
      'user_id', p_user_id,
      'action', 'create_profile_first'
    );
  END IF;

  -- Run initialization
  v_init_result := initialize_user_defaults(p_user_id);

  -- Validate again after repair
  v_profile_check := validate_profile_completeness(p_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'initialization', v_init_result,
    'profile_status', v_profile_check,
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
$$;

ALTER FUNCTION repair_user_profile(uuid) OWNER TO postgres;

COMMENT ON FUNCTION repair_user_profile IS
  'Repairs an incomplete user profile by re-running initialization.
   Returns detailed status report. Can be called manually or by admin.';

-- =====================================================================
-- STEP 4: Backfill Existing Incomplete Profiles
-- =====================================================================

DO $$
DECLARE
  v_user record;
  v_result jsonb;
  v_repaired_count integer := 0;
  v_failed_count integer := 0;
BEGIN
  RAISE NOTICE '[BACKFILL] Starting backfill of incomplete profiles...';

  -- Find profiles that might need initialization
  FOR v_user IN
    SELECT id, email
    FROM user_profiles
    WHERE (
      -- Missing credits (if column exists)
      (column_exists('user_profiles', 'credits_remaining') AND (credits_remaining IS NULL OR credits_remaining = 0))
      OR
      -- Missing user_role (if column exists)
      (column_exists('user_profiles', 'user_role') AND user_role IS NULL)
    )
    LIMIT 100  -- Process in batches
  LOOP
    BEGIN
      v_result := initialize_user_defaults(v_user.id);

      IF (v_result->>'success')::boolean THEN
        v_repaired_count := v_repaired_count + 1;
        RAISE NOTICE '[BACKFILL] ✓ Repaired profile for user: % (%)', v_user.id, v_user.email;
      ELSE
        v_failed_count := v_failed_count + 1;
        RAISE WARNING '[BACKFILL] Failed to repair profile for user %: %', v_user.id, v_result->>'error';
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_failed_count := v_failed_count + 1;
        RAISE WARNING '[BACKFILL] Error repairing profile for user %: %', v_user.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '[BACKFILL] Backfill complete. Repaired: %, Failed: %', v_repaired_count, v_failed_count;
END $$;

-- =====================================================================
-- STEP 5: Verification and Summary
-- =====================================================================

DO $$
DECLARE
  v_trigger record;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Optional Field Initialization System';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';

  RAISE NOTICE 'New Functions Created:';
  RAISE NOTICE '  ✓ initialize_user_defaults(user_id) - Initialize optional fields';
  RAISE NOTICE '  ✓ repair_user_profile(user_id) - Repair incomplete profiles';
  RAISE NOTICE '';

  RAISE NOTICE 'Triggers on user_profiles:';
  FOR v_trigger IN
    SELECT
      trigger_name,
      action_timing,
      event_manipulation
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'user_profiles'
      AND trigger_name = 'initialize_user_defaults_trigger'
  LOOP
    RAISE NOTICE '  ✓ % (% %)', v_trigger.trigger_name, v_trigger.action_timing, v_trigger.event_manipulation;
  END LOOP;
  RAISE NOTICE '';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'How It Works:';
  RAISE NOTICE '========================================';
  RAISE NOTICE '1. User signs up → Minimal profile created';
  RAISE NOTICE '2. AFTER INSERT trigger → Initializes optional fields';
  RAISE NOTICE '3. If initialization fails → Profile still usable';
  RAISE NOTICE '4. Frontend can call repair_user_profile() to retry';
  RAISE NOTICE '';
  RAISE NOTICE 'Test: SELECT repair_user_profile(''<user_id>'');';
  RAISE NOTICE '';
END $$;
