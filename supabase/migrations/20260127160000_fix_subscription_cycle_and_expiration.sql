/*
  # Fix Subscription Cycle and Expiration Logic

  ## Purpose
  Ensure that:
  1. Subscriptions are automatically marked as expired when end_date passes
  2. Billing cycles refresh correctly for active subscriptions (30-day cycles)
  3. Credits refresh to 2700 when billing cycle refreshes
  4. Access is stopped when subscription expires (status = 'expired')
  5. Cycle refresh only happens for active subscriptions (end_date > now())

  ## Issues Fixed
  - Subscriptions with end_date < now() but status = 'active' are not being marked as expired
  - Credits are not being refreshed when billing cycle refreshes
  - Subscription expiration check is not called automatically
  - Cycle refresh logic needs to also refresh credits in user_profiles

  ## Changes
  1. Update `get_user_credit_balance` to call `check_subscription_expiration` first
  2. Update `refresh_billing_cycle_if_expired` to refresh credits when cycle refreshes
  3. Ensure subscription status is checked before any credit operations
  4. Add automatic expiration check in credit balance function
*/

-- =====================================================================
-- STEP 1: Update refresh_billing_cycle_if_expired to Refresh Credits
-- =====================================================================

CREATE OR REPLACE FUNCTION refresh_billing_cycle_if_expired(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription_id uuid;
  v_current_cycle_end timestamptz;
  v_new_cycle_start timestamptz;
  v_new_cycle_end timestamptz;
  v_subscription_tier text;
  v_end_date timestamptz;
  v_cycles_advanced integer := 0;
BEGIN
  -- First, check and mark expired subscriptions
  PERFORM check_subscription_expiration();

  -- Get active subscription (after expiration check)
  SELECT id, billing_cycle_end, subscription_tier, end_date
  INTO v_subscription_id, v_current_cycle_end, v_subscription_tier, v_end_date
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > now()
  ORDER BY created_at DESC
  LIMIT 1;

  -- No active subscription
  IF v_subscription_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No active subscription found'
    );
  END IF;

  -- Check if billing cycle has expired
  IF v_current_cycle_end IS NULL OR now() > v_current_cycle_end THEN
    -- For paid subscriptions, advance by 30 days
    IF v_subscription_tier IN ('monthly', 'quarterly', 'biannual') THEN
      -- Calculate new cycle (multiple 30-day periods if needed)
      -- Calculate how many complete 30-day cycles have passed
      v_cycles_advanced := GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (now() - v_current_cycle_end)) / (30 * 24 * 60 * 60)) + 1);

      v_new_cycle_start := v_current_cycle_end;
      v_new_cycle_end := v_current_cycle_end + (interval '30 days' * v_cycles_advanced);

      -- Don't extend beyond subscription end date
      IF v_new_cycle_end > v_end_date THEN
        v_new_cycle_end := v_end_date;
      END IF;

      -- Update the subscription with new billing cycle
      UPDATE subscriptions
      SET
        billing_cycle_start = v_new_cycle_start,
        billing_cycle_end = v_new_cycle_end,
        tokens_used_current_cycle = 0,
        updated_at = now()
      WHERE id = v_subscription_id;

      -- Refresh credits in user_profiles to 2700 when cycle refreshes
      UPDATE user_profiles
      SET
        credits_remaining = 2700,
        credits_total = 2700,
        credits_cycle_start = v_new_cycle_start,
        credits_cycle_end = v_new_cycle_end,
        notified_at_1000 = false,
        notified_at_500 = false,
        notified_at_250 = false
      WHERE id = p_user_id;

      RAISE NOTICE '[CYCLE_REFRESH] Billing cycle refreshed for subscription % (user %): advanced % cycles, credits refreshed to 2700', 
        v_subscription_id, p_user_id, v_cycles_advanced;

      RETURN jsonb_build_object(
        'success', true,
        'message', 'Billing cycle refreshed and credits refilled',
        'cycles_advanced', v_cycles_advanced,
        'new_cycle_start', v_new_cycle_start,
        'new_cycle_end', v_new_cycle_end,
        'credits_refreshed', true
      );
    ELSE
      -- For trials, don't refresh - they expire
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Trial subscription - cycle does not refresh'
      );
    END IF;
  END IF;

  -- Billing cycle is still valid
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Billing cycle is current',
    'cycle_end', v_current_cycle_end
  );
END;
$$;

COMMENT ON FUNCTION refresh_billing_cycle_if_expired IS 'Refreshes billing cycle for active subscriptions when cycle expires. Also refreshes credits to 2700 in user_profiles. Only works for active subscriptions (end_date > now()).';

-- =====================================================================
-- STEP 2: Update get_user_credit_balance to Check Expiration First
-- =====================================================================

CREATE OR REPLACE FUNCTION get_user_credit_balance(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance record;
  v_has_active_subscription boolean := false;
  v_subscription record;
  v_refresh_result jsonb;
BEGIN
  -- First, check and mark expired subscriptions
  PERFORM check_subscription_expiration();

  -- Then, refresh billing cycle if expired (for active subscriptions)
  v_refresh_result := refresh_billing_cycle_if_expired(p_user_id);

  -- Get credit balance from user_profiles
  SELECT
    credits_remaining,
    credits_total,
    credits_cycle_start,
    credits_cycle_end,
    free_credits_claimed
  INTO v_balance
  FROM user_profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  -- Check if user has an active subscription
  -- Active subscription means: status = 'active' AND end_date > now()
  SELECT *
  INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > now()
  ORDER BY created_at DESC
  LIMIT 1;

  -- If subscription found and active, user has active subscription
  IF FOUND THEN
    v_has_active_subscription := true;
  END IF;

  -- If no active subscription, return 0 credits
  IF NOT v_has_active_subscription THEN
    RETURN jsonb_build_object(
      'success', true,
      'credits_remaining', 0,
      'credits_total', 0,
      'cycle_start', v_balance.credits_cycle_start,
      'cycle_end', v_balance.credits_cycle_end,
      'free_credits_claimed', v_balance.free_credits_claimed,
      'subscription_expired', true,
      'refreshed', (v_refresh_result->>'success')::boolean
    );
  END IF;

  -- User has active subscription, return actual credits
  RETURN jsonb_build_object(
    'success', true,
    'credits_remaining', COALESCE(v_balance.credits_remaining, 0),
    'credits_total', COALESCE(v_balance.credits_total, 0),
    'cycle_start', v_balance.credits_cycle_start,
    'cycle_end', v_balance.credits_cycle_end,
    'free_credits_claimed', v_balance.free_credits_claimed,
    'subscription_expired', false,
    'refreshed', (v_refresh_result->>'success')::boolean
  );
END;
$$;

COMMENT ON FUNCTION get_user_credit_balance IS 'Get current credit balance for a user. Automatically checks subscription expiration and refreshes billing cycles before returning balance. Returns 0 credits if subscription is expired.';

-- =====================================================================
-- STEP 3: Update check_subscription_expiration to Also Update user_profiles
-- =====================================================================

CREATE OR REPLACE FUNCTION check_subscription_expiration()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count int;
BEGIN
  -- Mark expired subscriptions (only those clearly past end_date with buffer)
  WITH expired_subs AS (
    UPDATE subscriptions
    SET status = 'expired',
        updated_at = now()
    WHERE status = 'active'
      AND end_date < now() - interval '1 hour'  -- Add 1 hour buffer to prevent premature expiration
    RETURNING id, user_id
  )
  SELECT COUNT(*) INTO expired_count FROM expired_subs;

  -- Update user_profiles for expired subscriptions
  UPDATE user_profiles up
  SET subscription_tier = 'none'
  WHERE NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = up.id
      AND s.status = 'active'
      AND s.end_date > now()
  )
  AND up.subscription_tier != 'none';

  IF expired_count > 0 THEN
    RAISE NOTICE '[EXPIRATION] Marked % subscriptions as expired', expired_count;
  END IF;
END;
$$;

COMMENT ON FUNCTION check_subscription_expiration IS 'Marks subscriptions as expired when end_date passes. Also updates user_profiles.subscription_tier to none for expired subscriptions.';

-- =====================================================================
-- STEP 4: Verification
-- =====================================================================

DO $$
DECLARE
  v_expired_count integer;
  v_active_expired_count integer;
  v_cycle_refresh_count integer;
BEGIN
  -- Check for subscriptions that should be expired
  SELECT COUNT(*) INTO v_expired_count
  FROM subscriptions
  WHERE status = 'active'
    AND end_date < now() - interval '1 hour';

  -- Check for active subscriptions with expired cycles
  SELECT COUNT(*) INTO v_cycle_refresh_count
  FROM subscriptions
  WHERE status = 'active'
    AND end_date > now()
    AND billing_cycle_end < now()
    AND subscription_tier IN ('monthly', 'quarterly', 'biannual');

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Subscription Cycle and Expiration Fix';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Current Status:';
  RAISE NOTICE '  - Subscriptions that should be expired: %', v_expired_count;
  RAISE NOTICE '  - Active subscriptions with expired cycles: %', v_cycle_refresh_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Functions Updated:';
  RAISE NOTICE '  ✓ check_subscription_expiration() - Marks expired subscriptions';
  RAISE NOTICE '  ✓ refresh_billing_cycle_if_expired() - Refreshes cycles AND credits';
  RAISE NOTICE '  ✓ get_user_credit_balance() - Checks expiration before returning balance';
  RAISE NOTICE '';
  RAISE NOTICE 'Behavior:';
  RAISE NOTICE '  1. When credits are accessed, expiration is checked automatically';
  RAISE NOTICE '  2. If subscription expired (end_date < now()), status = expired';
  RAISE NOTICE '  3. If subscription active AND cycle expired, cycle refreshes + credits = 2700';
  RAISE NOTICE '  4. If subscription expired, access stops (0 credits returned)';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
END $$;
