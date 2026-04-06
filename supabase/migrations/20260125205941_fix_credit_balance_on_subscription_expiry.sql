/*
  # Fix Credit Balance on Subscription Expiry

  ## Purpose
  Update the `get_user_credit_balance` function to return 0 credits when subscription expires.
  Currently, the function returns credits from user_profiles even when subscription is expired.

  ## Changes
  1. Update `get_user_credit_balance` function to check subscription status
  2. Return 0 credits if subscription is expired or doesn't exist
  3. Return actual credits only if subscription is active
  4. Handle both subscription expiry and cycle expiry correctly
*/

-- =====================================================================
-- STEP 1: Update get_user_credit_balance Function
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
BEGIN
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
      'subscription_expired', true
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
    'subscription_expired', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_credit_balance(uuid) TO authenticated;

COMMENT ON FUNCTION get_user_credit_balance IS 'Get current credit balance for a user. Returns 0 credits if subscription is expired, otherwise returns actual credits from user_profiles.';

-- =====================================================================
-- STEP 2: Verification
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Migration complete!';
  RAISE NOTICE 'The get_user_credit_balance function now:';
  RAISE NOTICE '  - Returns 0 credits when subscription is expired';
  RAISE NOTICE '  - Returns 0 credits when no active subscription exists';
  RAISE NOTICE '  - Returns actual credits when subscription is active';
  RAISE NOTICE '';
END $$;
