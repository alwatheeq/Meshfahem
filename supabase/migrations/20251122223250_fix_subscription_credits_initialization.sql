/*
  # Fix Subscription Credits Initialization

  ## Overview
  Fixes issue where new subscriptions show 0 credits instead of 2,700.
  Creates automatic credit initialization when subscriptions are created.

  ## Changes

  1. **Create initialize_subscription_credits Function**
     - Automatically sets credits_remaining = 2700
     - Sets credits_total = 2700
     - Initializes billing cycle dates
     - Idempotent: won't reset existing non-zero credits

  2. **Create Trigger on Subscriptions Table**
     - Fires AFTER INSERT on subscriptions
     - Only for active subscriptions
     - Calls initialize_subscription_credits automatically

  3. **Backfill Existing Broken Subscriptions**
     - Finds active subscriptions with 0 credits
     - Initializes credits for these users
     - Logs results for verification

  ## Fixes
  - New subscriptions will automatically get 2,700 credits
  - Existing users with 0 credits will be fixed
  - Future-proof for all subscription creation methods
*/

-- =====================================================================
-- STEP 1: Create function to initialize subscription credits
-- =====================================================================

CREATE OR REPLACE FUNCTION initialize_subscription_credits(
  p_user_id uuid,
  p_subscription_tier text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_credits integer;
  v_subscription record;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
BEGIN
  -- Get current credit balance
  SELECT credits_remaining INTO v_current_credits
  FROM user_profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User profile not found',
      'user_id', p_user_id
    );
  END IF;

  -- Only initialize if credits are currently 0 (don't reset existing credits)
  IF v_current_credits > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Credits already initialized',
      'credits_remaining', v_current_credits,
      'skipped', true
    );
  END IF;

  -- Get the user's active subscription to determine cycle dates
  SELECT *
  INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Use subscription's billing cycle dates if available
    v_cycle_start := COALESCE(v_subscription.billing_cycle_start, v_subscription.start_date, now());
    v_cycle_end := COALESCE(v_subscription.billing_cycle_end, v_cycle_start + interval '30 days');
  ELSE
    -- No active subscription found, use default 30-day cycle
    v_cycle_start := now();
    v_cycle_end := now() + interval '30 days';
  END IF;

  -- Initialize credits
  UPDATE user_profiles
  SET
    credits_remaining = 2700,
    credits_total = 2700,
    credits_cycle_start = v_cycle_start,
    credits_cycle_end = v_cycle_end,
    notified_at_30_percent = false,
    notified_at_10_percent = false
  WHERE id = p_user_id;

  RAISE NOTICE 'Initialized 2700 credits for user: %', p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Credits initialized successfully',
    'user_id', p_user_id,
    'credits_remaining', 2700,
    'credits_total', 2700,
    'cycle_start', v_cycle_start,
    'cycle_end', v_cycle_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION initialize_subscription_credits(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_subscription_credits(uuid, text) TO service_role;

COMMENT ON FUNCTION initialize_subscription_credits IS 'Initialize credits for a user when they subscribe. Only sets credits if currently 0.';

-- =====================================================================
-- STEP 2: Create trigger function
-- =====================================================================

CREATE OR REPLACE FUNCTION trigger_initialize_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Only initialize for active subscriptions
  IF NEW.status = 'active' THEN
    -- Call the initialization function
    SELECT initialize_subscription_credits(NEW.user_id, NEW.subscription_tier)
    INTO v_result;

    RAISE NOTICE 'Credit initialization result: %', v_result;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_initialize_credits IS 'Trigger function to automatically initialize credits when subscription is created';

-- =====================================================================
-- STEP 3: Create trigger on subscriptions table
-- =====================================================================

DROP TRIGGER IF EXISTS after_subscription_insert_initialize_credits ON subscriptions;

CREATE TRIGGER after_subscription_insert_initialize_credits
  AFTER INSERT ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_initialize_credits();

COMMENT ON TRIGGER after_subscription_insert_initialize_credits ON subscriptions IS 'Automatically initialize credits when new subscription is created';

-- =====================================================================
-- STEP 4: Backfill existing broken subscriptions
-- =====================================================================

DO $$
DECLARE
  v_user record;
  v_result jsonb;
  v_fixed_count integer := 0;
  v_skipped_count integer := 0;
  v_error_count integer := 0;
BEGIN
  RAISE NOTICE 'Starting backfill of broken subscriptions...';

  -- Find all users with active subscriptions but 0 credits
  FOR v_user IN
    SELECT DISTINCT up.id, up.credits_remaining, s.subscription_tier
    FROM user_profiles up
    INNER JOIN subscriptions s ON s.user_id = up.id
    WHERE s.status = 'active'
      AND s.end_date > now()
      AND up.credits_remaining = 0
  LOOP
    BEGIN
      -- Initialize credits
      SELECT initialize_subscription_credits(v_user.id, v_user.subscription_tier)
      INTO v_result;

      IF (v_result->>'success')::boolean = true THEN
        IF (v_result->>'skipped')::boolean = true THEN
          v_skipped_count := v_skipped_count + 1;
        ELSE
          v_fixed_count := v_fixed_count + 1;
          RAISE NOTICE 'Fixed credits for user: % (tier: %)', v_user.id, v_user.subscription_tier;
        END IF;
      ELSE
        v_error_count := v_error_count + 1;
        RAISE WARNING 'Failed to initialize credits for user %: %', v_user.id, v_result->>'error';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Exception initializing credits for user %: %', v_user.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Backfill complete:';
  RAISE NOTICE '  - Fixed: % users', v_fixed_count;
  RAISE NOTICE '  - Skipped: % users', v_skipped_count;
  RAISE NOTICE '  - Errors: % users', v_error_count;
END $$;

-- =====================================================================
-- STEP 5: Verify the fix
-- =====================================================================

DO $$
DECLARE
  v_total_active_subs integer;
  v_users_with_zero_credits integer;
  v_users_with_credits integer;
BEGIN
  -- Count total active subscriptions
  SELECT COUNT(DISTINCT user_id)
  INTO v_total_active_subs
  FROM subscriptions
  WHERE status = 'active' AND end_date > now();

  -- Count users with active subscription but 0 credits
  SELECT COUNT(DISTINCT up.id)
  INTO v_users_with_zero_credits
  FROM user_profiles up
  INNER JOIN subscriptions s ON s.user_id = up.id
  WHERE s.status = 'active'
    AND s.end_date > now()
    AND up.credits_remaining = 0;

  -- Count users with active subscription and credits
  SELECT COUNT(DISTINCT up.id)
  INTO v_users_with_credits
  FROM user_profiles up
  INNER JOIN subscriptions s ON s.user_id = up.id
  WHERE s.status = 'active'
    AND s.end_date > now()
    AND up.credits_remaining > 0;

  RAISE NOTICE '=== Credit Initialization Verification ===';
  RAISE NOTICE 'Total active subscriptions: %', v_total_active_subs;
  RAISE NOTICE 'Users with credits: %', v_users_with_credits;
  RAISE NOTICE 'Users still with 0 credits: %', v_users_with_zero_credits;

  IF v_users_with_zero_credits > 0 THEN
    RAISE WARNING 'There are still % users with active subscriptions but 0 credits!', v_users_with_zero_credits;
  ELSE
    RAISE NOTICE '✓ All users with active subscriptions have credits initialized!';
  END IF;
END $$;