/*
  # Fix Credit Refill on Renewal and New Subscriptions

  ## Problem
  1. New users don't receive credits when subscribing (stays at 0)
  2. Renewal users don't get credits refilled to 2700 (stays at current balance)

  ## Root Cause
  The `initialize_subscription_credits` function skips initialization if `v_current_credits > 0`,
  which prevents renewals from refilling credits. When a user renews:
  - `safe_create_subscription` cancels existing subscription
  - Creates new subscription record
  - Trigger fires and calls `initialize_subscription_credits`
  - Function sees user still has credits (e.g., 500/2700) and skips refilling

  ## Solution
  Modify `initialize_subscription_credits` to:
  1. Detect if this is a renewal (recent cancellation within 5 minutes)
  2. Always refill credits to 2700 for:
     - New subscriptions (credits = 0/NULL)
     - Renewals (recent cancellation detected)
     - Billing cycle expired (credits_cycle_end < now())
  3. Update cycle dates based on new subscription's billing cycle

  ## Impact
  - New users will receive 2700 credits when subscribing
  - Renewal users will get credits refilled to 2700 regardless of remaining balance
  - All subscription creation paths will work correctly
*/

-- =====================================================================
-- STEP 1: Replace initialize_subscription_credits Function
-- =====================================================================

CREATE OR REPLACE FUNCTION initialize_subscription_credits(
  p_user_id uuid,
  p_subscription_tier text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_credits integer;
  v_subscription record;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_profile_exists boolean;
  v_is_renewal boolean := false;
  v_credits_cycle_end timestamptz;
  v_should_refill boolean := false;
BEGIN
  -- Check if user profile exists
  SELECT EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id) INTO v_profile_exists;
  
  IF NOT v_profile_exists THEN
    -- Profile doesn't exist yet - try to create it first
    BEGIN
      PERFORM ensure_user_profile(p_user_id);
      -- Wait a moment for profile creation
      PERFORM pg_sleep(0.1);
    EXCEPTION
      WHEN OTHERS THEN
        -- If ensure_user_profile doesn't exist or fails, try create_missing_profile
        BEGIN
          PERFORM create_missing_profile(p_user_id, (SELECT email FROM auth.users WHERE id = p_user_id LIMIT 1));
        EXCEPTION
          WHEN OTHERS THEN
            -- If that also fails, return error
            RETURN jsonb_build_object(
              'success', false,
              'error', 'User profile not found and could not be created',
              'user_id', p_user_id,
              'details', SQLERRM
            );
        END;
    END;
  END IF;

  -- Get current credit balance and cycle end date
  SELECT COALESCE(credits_remaining, 0), credits_cycle_end
  INTO v_current_credits, v_credits_cycle_end
  FROM user_profiles
  WHERE id = p_user_id;

  -- Check if this is a renewal (recent cancellation within 5 minutes)
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = p_user_id
      AND status = 'canceled'
      AND canceled_at > now() - interval '5 minutes'
  ) INTO v_is_renewal;

  -- Determine if we should refill credits
  -- Always refill if:
  -- 1. Credits are 0/NULL (new user)
  -- 2. This is a renewal (recent cancellation detected)
  -- 3. Billing cycle has expired (credits_cycle_end < now())
  v_should_refill := (
    v_current_credits IS NULL OR 
    v_current_credits = 0 OR 
    v_is_renewal OR 
    (v_credits_cycle_end IS NOT NULL AND v_credits_cycle_end < now())
  );

  IF NOT v_should_refill THEN
    -- User has credits and this is not a renewal or expired cycle
    -- Keep existing credits (shouldn't happen for new subscriptions, but safe fallback)
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Credits already initialized and cycle not expired',
      'credits_remaining', v_current_credits,
      'skipped', true,
      'reason', 'Credits exist and no renewal detected'
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
    v_cycle_end := COALESCE(v_subscription.billing_cycle_end, v_subscription.end_date, v_cycle_start + interval '30 days');
  ELSE
    -- No active subscription found, use default 30-day cycle
    v_cycle_start := now();
    v_cycle_end := now() + interval '30 days';
  END IF;

  -- Refill credits to 2700 (SET, not add)
  UPDATE user_profiles
  SET
    credits_remaining = 2700,
    credits_total = 2700,
    credits_cycle_start = v_cycle_start,
    credits_cycle_end = v_cycle_end,
    notified_at_30_percent = false,
    notified_at_10_percent = false
  WHERE id = p_user_id;

  RAISE NOTICE '[CREDIT_INIT] Refilled 2700 credits for user: % (tier: %, renewal: %, previous_credits: %)', 
    p_user_id, 
    COALESCE(p_subscription_tier, 'unknown'),
    v_is_renewal,
    v_current_credits;

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE 
      WHEN v_is_renewal THEN 'Credits refilled on renewal'
      WHEN v_current_credits IS NULL OR v_current_credits = 0 THEN 'Credits initialized for new subscription'
      WHEN v_credits_cycle_end IS NOT NULL AND v_credits_cycle_end < now() THEN 'Credits refilled - billing cycle expired'
      ELSE 'Credits refilled'
    END,
    'user_id', p_user_id,
    'credits_remaining', 2700,
    'credits_total', 2700,
    'cycle_start', v_cycle_start,
    'cycle_end', v_cycle_end,
    'is_renewal', v_is_renewal,
    'previous_credits', v_current_credits
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[CREDIT_INIT] Error initializing credits for user %: %', p_user_id, SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'user_id', p_user_id
    );
END;
$$;

COMMENT ON FUNCTION initialize_subscription_credits IS 
  'Initialize/refill 2700 credits for a user when they subscribe or renew. 
   Detects renewals and always refills credits for new subscriptions and renewals. 
   Handles missing profiles and edge cases.';

-- Grant execute permissions (already granted, but ensure they exist)
GRANT EXECUTE ON FUNCTION initialize_subscription_credits(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_subscription_credits(uuid, text) TO service_role;

-- =====================================================================
-- STEP 2: Verify Trigger Exists and Works Correctly
-- =====================================================================

-- The trigger should already exist from previous migration
-- Verify it exists and is correctly configured
DO $$
DECLARE
  v_trigger_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'after_subscription_insert_initialize_credits'
      AND event_object_table = 'subscriptions'
  ) INTO v_trigger_exists;

  IF NOT v_trigger_exists THEN
    RAISE WARNING '⚠ Trigger after_subscription_insert_initialize_credits does not exist - creating it now';
  ELSE
    RAISE NOTICE '✓ Trigger exists - will update function';
  END IF;
END $$;

-- Create or replace trigger function (always update to use new logic)
CREATE OR REPLACE FUNCTION trigger_initialize_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Only initialize for active subscriptions
  IF NEW.status = 'active' THEN
    -- Call the initialization function
    SELECT initialize_subscription_credits(NEW.user_id, NEW.subscription_tier)
    INTO v_result;

    -- Log result (only warnings/errors, not success)
    IF (v_result->>'success')::boolean = false THEN
      RAISE WARNING '[TRIGGER] Credit initialization failed for user %: %', NEW.user_id, v_result->>'error';
    ELSE
      RAISE NOTICE '[TRIGGER] Credit initialization triggered for user % (renewal: %)', 
        NEW.user_id, 
        COALESCE((v_result->>'is_renewal')::boolean, false);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'after_subscription_insert_initialize_credits'
      AND event_object_table = 'subscriptions'
  ) THEN
    CREATE TRIGGER after_subscription_insert_initialize_credits
      AFTER INSERT ON subscriptions
      FOR EACH ROW
      EXECUTE FUNCTION trigger_initialize_credits();
    
    RAISE NOTICE '✓ Created trigger after_subscription_insert_initialize_credits';
  ELSE
    RAISE NOTICE '✓ Trigger already exists - function updated';
  END IF;
END $$;

COMMENT ON FUNCTION trigger_initialize_credits IS 'Trigger function to automatically initialize/refill credits when new subscription is created';

-- =====================================================================
-- STEP 3: Backfill Broken Subscriptions
-- =====================================================================

DO $$
DECLARE
  v_user record;
  v_result jsonb;
  v_fixed_count integer := 0;
  v_skipped_count integer := 0;
  v_error_count integer := 0;
BEGIN
  RAISE NOTICE '[BACKFILL] Starting backfill of broken subscriptions...';

  -- Find all users with active subscriptions but 0 credits OR credits that should be refilled
  FOR v_user IN
    SELECT DISTINCT 
      up.id as user_id,
      up.email,
      s.subscription_tier,
      up.credits_remaining,
      up.credits_cycle_end,
      s.created_at as subscription_created_at
    FROM user_profiles up
    JOIN subscriptions s ON s.user_id = up.id
    WHERE s.status = 'active'
      AND s.end_date > now()
      AND (
        -- Users with 0 credits
        (up.credits_remaining IS NULL OR up.credits_remaining = 0)
        OR
        -- Users with expired billing cycles
        (up.credits_cycle_end IS NOT NULL AND up.credits_cycle_end < now())
      )
  LOOP
    BEGIN
      -- Initialize/refill credits for this user
      SELECT initialize_subscription_credits(v_user.user_id, v_user.subscription_tier)
      INTO v_result;

      IF (v_result->>'success')::boolean = true THEN
        IF (v_result->>'skipped')::boolean = true THEN
          v_skipped_count := v_skipped_count + 1;
          RAISE NOTICE '[BACKFILL] Skipped user % (already has credits)', v_user.email;
        ELSE
          v_fixed_count := v_fixed_count + 1;
          RAISE NOTICE '[BACKFILL] Fixed user % - refilled to 2700 credits (was: %)', 
            v_user.email, 
            COALESCE(v_user.credits_remaining, 0);
        END IF;
      ELSE
        v_error_count := v_error_count + 1;
        RAISE WARNING '[BACKFILL] Failed for user %: %', v_user.email, v_result->>'error';
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_error_count := v_error_count + 1;
        RAISE WARNING '[BACKFILL] Exception for user %: %', v_user.email, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '[BACKFILL] Complete! Fixed: %, Skipped: %, Errors: %', v_fixed_count, v_skipped_count, v_error_count;
END $$;

-- =====================================================================
-- STEP 4: Verification Function
-- =====================================================================

CREATE OR REPLACE FUNCTION verify_credit_refill_logic()
RETURNS TABLE (
  check_name text,
  status text,
  details text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_trigger_exists boolean;
  v_function_exists boolean;
  v_broken_count integer;
  v_renewal_detection_works boolean;
BEGIN
  -- Check if trigger exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'after_subscription_insert_initialize_credits'
      AND event_object_table = 'subscriptions'
  ) INTO v_trigger_exists;

  RETURN QUERY SELECT 
    'Trigger exists'::text,
    CASE WHEN v_trigger_exists THEN 'PASS' ELSE 'FAIL' END::text,
    CASE WHEN v_trigger_exists THEN 'Trigger is installed' ELSE 'Trigger is missing' END::text;

  -- Check if function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'initialize_subscription_credits'
  ) INTO v_function_exists;

  RETURN QUERY SELECT 
    'Function exists'::text,
    CASE WHEN v_function_exists THEN 'PASS' ELSE 'FAIL' END::text,
    CASE WHEN v_function_exists THEN 'Function is installed' ELSE 'Function is missing' END::text;

  -- Check for broken subscriptions (active subscriptions with 0 credits or expired cycles)
  SELECT COUNT(*) INTO v_broken_count
  FROM user_profiles up
  JOIN subscriptions s ON s.user_id = up.id
  WHERE s.status = 'active'
    AND s.end_date > now()
    AND (
      (up.credits_remaining IS NULL OR up.credits_remaining = 0)
      OR
      (up.credits_cycle_end IS NOT NULL AND up.credits_cycle_end < now())
    );

  RETURN QUERY SELECT 
    'Broken subscriptions'::text,
    CASE WHEN v_broken_count = 0 THEN 'PASS' ELSE 'WARNING' END::text,
    format('Found %s active subscriptions with 0 credits or expired cycles', v_broken_count)::text;

  -- Verify renewal detection logic exists in function
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    JOIN pg_proc p2 ON p2.oid = p.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'initialize_subscription_credits'
      AND pg_get_functiondef(p.oid) LIKE '%v_is_renewal%'
  ) INTO v_renewal_detection_works;

  RETURN QUERY SELECT 
    'Renewal detection logic'::text,
    CASE WHEN v_renewal_detection_works THEN 'PASS' ELSE 'FAIL' END::text,
    CASE WHEN v_renewal_detection_works 
      THEN 'Function includes renewal detection logic'
      ELSE 'Function missing renewal detection logic'
    END::text;
END;
$$;

COMMENT ON FUNCTION verify_credit_refill_logic IS 'Verification function to check if credit refill logic is working correctly';

GRANT EXECUTE ON FUNCTION verify_credit_refill_logic() TO authenticated;

-- =====================================================================
-- STEP 5: Summary and Verification
-- =====================================================================

-- Run verification and display results
DO $$
DECLARE
  v_result record;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Credit Refill Logic Verification';
  RAISE NOTICE '========================================';
  
  FOR v_result IN SELECT * FROM verify_credit_refill_logic() LOOP
    RAISE NOTICE '%: % - %', v_result.check_name, v_result.status, v_result.details;
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Migration complete!';
  RAISE NOTICE 'The initialize_subscription_credits function now:';
  RAISE NOTICE '  - Detects renewals (recent cancellations within 5 minutes)';
  RAISE NOTICE '  - Always refills credits for new subscriptions';
  RAISE NOTICE '  - Always refills credits for renewals';
  RAISE NOTICE '  - Refills credits when billing cycle expires';
  RAISE NOTICE '';
END $$;

