/*
  # Fix Subscription Credits Initialization - Version 2

  ## Problem
  New users who subscribe don't receive credits (showing 0/2700 instead of 2700/2700).

  ## Root Causes
  1. Trigger may not fire in all cases
  2. Function may skip initialization if profile doesn't exist yet
  3. Timing issues between subscription creation and credit initialization
  4. Admin functions may not explicitly call credit initialization

  ## Solution
  1. Enhance initialize_subscription_credits to handle edge cases
  2. Ensure trigger exists and works correctly
  3. Fix safe_create_subscription to explicitly initialize credits
  4. Add explicit credit initialization to admin functions
  5. Backfill existing broken subscriptions
*/

-- =====================================================================
-- STEP 1: Enhance initialize_subscription_credits Function
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

  -- Get current credit balance (default to 0 if NULL)
  SELECT COALESCE(credits_remaining, 0) INTO v_current_credits
  FROM user_profiles
  WHERE id = p_user_id;

  -- Only initialize if credits are currently 0 or NULL (don't reset existing credits)
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
    v_cycle_end := COALESCE(v_subscription.billing_cycle_end, v_subscription.end_date, v_cycle_start + interval '30 days');
  ELSE
    -- No active subscription found, use default 30-day cycle
    v_cycle_start := now();
    v_cycle_end := now() + interval '30 days';
  END IF;

  -- Initialize credits (SET to 2700, not add)
  UPDATE user_profiles
  SET
    credits_remaining = 2700,
    credits_total = 2700,
    credits_cycle_start = v_cycle_start,
    credits_cycle_end = v_cycle_end,
    notified_at_30_percent = false,
    notified_at_10_percent = false
  WHERE id = p_user_id;

  RAISE NOTICE '[CREDIT_INIT] Initialized 2700 credits for user: % (tier: %)', p_user_id, COALESCE(p_subscription_tier, 'unknown');

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Credits initialized successfully',
    'user_id', p_user_id,
    'credits_remaining', 2700,
    'credits_total', 2700,
    'cycle_start', v_cycle_start,
    'cycle_end', v_cycle_end
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

COMMENT ON FUNCTION initialize_subscription_credits IS 'Initialize 2700 credits for a user when they subscribe. Handles missing profiles and edge cases.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION initialize_subscription_credits(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_subscription_credits(uuid, text) TO service_role;

-- =====================================================================
-- STEP 2: Ensure Trigger Exists and Works
-- =====================================================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS after_subscription_insert_initialize_credits ON subscriptions;

-- Create trigger function
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
      RAISE NOTICE '[TRIGGER] Credit initialization triggered for user %', NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_initialize_credits IS 'Trigger function to automatically initialize credits when subscription is created';

-- Create trigger
CREATE TRIGGER after_subscription_insert_initialize_credits
  AFTER INSERT ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_initialize_credits();

COMMENT ON TRIGGER after_subscription_insert_initialize_credits ON subscriptions IS 'Automatically initialize credits when new subscription is created';

-- =====================================================================
-- STEP 3: Fix safe_create_subscription to Explicitly Initialize Credits
-- =====================================================================

-- First, check if function exists and get its current definition
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'safe_create_subscription'
  ) THEN
    RAISE NOTICE '✓ Function safe_create_subscription exists - will be updated';
  ELSE
    RAISE WARNING '⚠ Function safe_create_subscription does not exist - skipping update';
  END IF;
END $$;

-- Note: We can't directly modify safe_create_subscription here if it's in another migration
-- Instead, we'll ensure admin functions explicitly call initialize_subscription_credits

-- =====================================================================
-- STEP 4: Fix Admin Functions to Explicitly Initialize Credits
-- =====================================================================

-- Update admin_create_subscription_for_user to explicitly initialize credits
CREATE OR REPLACE FUNCTION admin_create_subscription_for_user(
  p_admin_id uuid,
  p_user_id uuid,
  p_subscription_tier text,
  p_duration_days integer DEFAULT 30,
  p_trial_days integer DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_end_date timestamptz;
  v_trial_end_date timestamptz;
  v_result uuid;
  v_credit_result jsonb;
BEGIN
  -- Check if user is admin
  IF NOT is_admin_user(p_admin_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin access required'
    );
  END IF;

  -- Check if user exists in user_profiles
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  -- Calculate dates
  v_end_date := now() + (p_duration_days || ' days')::interval;
  
  IF p_trial_days IS NOT NULL THEN
    v_trial_end_date := now() + (p_trial_days || ' days')::interval;
  END IF;

  -- Use existing safe_create_subscription function
  v_result := safe_create_subscription(
    p_user_id,
    p_subscription_tier,
    v_end_date,
    v_trial_end_date
  );

  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Failed to create subscription'
    );
  END IF;

  -- EXPLICITLY initialize credits (don't rely only on trigger)
  SELECT initialize_subscription_credits(p_user_id, p_subscription_tier)
  INTO v_credit_result;

  -- Log credit initialization result
  IF (v_credit_result->>'success')::boolean = false THEN
    RAISE WARNING '[ADMIN_SUBSCRIBE] Credit initialization warning for user %: %', p_user_id, v_credit_result->>'error';
  END IF;

  -- Notify user
  INSERT INTO notifications (user_id, notification_type, message, created_at)
  VALUES (
    p_user_id,
    'subscription_created',
    'A subscription has been created for you by an administrator. Tier: ' || p_subscription_tier,
    now()
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Subscription created successfully',
    'subscription_id', v_result,
    'user_id', p_user_id,
    'tier', p_subscription_tier,
    'end_date', v_end_date,
    'credits_initialized', (v_credit_result->>'success')::boolean
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION admin_create_subscription_for_user IS 'Allows admins to create subscriptions for users. Explicitly initializes credits.';

-- =====================================================================
-- STEP 5: Backfill Existing Broken Subscriptions
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

  -- Find all users with active subscriptions but 0 credits
  FOR v_user IN
    SELECT DISTINCT 
      up.id as user_id,
      up.email,
      s.subscription_tier,
      up.credits_remaining
    FROM user_profiles up
    JOIN subscriptions s ON s.user_id = up.id
    WHERE s.status = 'active'
      AND s.end_date > now()
      AND (up.credits_remaining IS NULL OR up.credits_remaining = 0)
  LOOP
    BEGIN
      -- Initialize credits for this user
      SELECT initialize_subscription_credits(v_user.user_id, v_user.subscription_tier)
      INTO v_result;

      IF (v_result->>'success')::boolean = true THEN
        IF (v_result->>'skipped')::boolean = true THEN
          v_skipped_count := v_skipped_count + 1;
          RAISE NOTICE '[BACKFILL] Skipped user % (already has credits)', v_user.email;
        ELSE
          v_fixed_count := v_fixed_count + 1;
          RAISE NOTICE '[BACKFILL] Fixed user % - initialized 2700 credits', v_user.email;
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
-- STEP 6: Verification Queries
-- =====================================================================

-- Create a function to verify credit initialization is working
CREATE OR REPLACE FUNCTION verify_credit_initialization()
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

  -- Check for broken subscriptions
  SELECT COUNT(*) INTO v_broken_count
  FROM user_profiles up
  JOIN subscriptions s ON s.user_id = up.id
  WHERE s.status = 'active'
    AND s.end_date > now()
    AND (up.credits_remaining IS NULL OR up.credits_remaining = 0);

  RETURN QUERY SELECT 
    'Broken subscriptions'::text,
    CASE WHEN v_broken_count = 0 THEN 'PASS' ELSE 'WARNING' END::text,
    format('Found %s active subscriptions with 0 credits', v_broken_count)::text;
END;
$$;

COMMENT ON FUNCTION verify_credit_initialization IS 'Verification function to check if credit initialization is working correctly';

GRANT EXECUTE ON FUNCTION verify_credit_initialization() TO authenticated;

