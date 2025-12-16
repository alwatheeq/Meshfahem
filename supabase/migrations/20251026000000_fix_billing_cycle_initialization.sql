/*
  # Fix Billing Cycle Initialization for New Subscriptions

  ## Overview
  This migration ensures that all subscriptions (both new and existing) have properly
  initialized billing cycle fields. It creates triggers to automatically populate these
  fields when subscriptions are created.

  ## Changes

  1. **Create Auto-Initialization Trigger**
     - Automatically sets billing_cycle_start, billing_cycle_end, token_limit, and tokens_used_current_cycle
     - Runs before INSERT on subscriptions table
     - Uses subscription tier to determine appropriate token limits

  2. **Fix Existing Subscriptions**
     - Updates all subscriptions with NULL or 0 values in billing cycle fields
     - Ensures every active subscription has proper billing cycle dates
     - Sets token limits based on subscription tier

  3. **Add Billing Cycle Refresh on Read**
     - Creates a view that automatically checks and refreshes expired billing cycles
     - Ensures cycles reset every 30 days automatically
     - Resets token usage when cycle refreshes

  ## Migration Strategy
  - Safe for production: uses IF NOT EXISTS and conditional updates
  - Idempotent: can be run multiple times safely
  - No data loss: preserves all existing data while adding missing fields
*/

-- =====================================================================
-- STEP 1: Create function to initialize billing cycle on insert
-- =====================================================================

CREATE OR REPLACE FUNCTION initialize_billing_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_limit integer;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
BEGIN
  -- Get token limit for the tier
  v_token_limit := get_token_limit_for_tier(NEW.subscription_tier);

  -- Set billing cycle start (use start_date or current time)
  v_cycle_start := COALESCE(NEW.billing_cycle_start, NEW.start_date, now());

  -- Calculate billing cycle end based on subscription type
  IF NEW.subscription_tier IN ('trial_1day', 'trial_7day') THEN
    -- For trials, cycle end matches trial/subscription end
    v_cycle_end := COALESCE(NEW.billing_cycle_end, NEW.trial_end_date, NEW.end_date);
  ELSE
    -- For paid subscriptions, 30-day billing cycles
    v_cycle_end := COALESCE(NEW.billing_cycle_end, v_cycle_start + interval '30 days');
  END IF;

  -- Set all billing cycle fields if not already set
  NEW.billing_cycle_start := v_cycle_start;
  NEW.billing_cycle_end := v_cycle_end;
  NEW.token_limit := COALESCE(NULLIF(NEW.token_limit, 0), v_token_limit);
  NEW.tokens_used_current_cycle := COALESCE(NEW.tokens_used_current_cycle, 0);

  RAISE NOTICE 'Initialized billing cycle for subscription: tier=%, limit=%, cycle_end=%',
    NEW.subscription_tier, NEW.token_limit, NEW.billing_cycle_end;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- STEP 2: Create trigger for automatic initialization
-- =====================================================================

DROP TRIGGER IF EXISTS trigger_initialize_billing_cycle ON subscriptions;
CREATE TRIGGER trigger_initialize_billing_cycle
  BEFORE INSERT ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION initialize_billing_cycle();

-- =====================================================================
-- STEP 3: Fix all existing subscriptions with missing data
-- =====================================================================

-- Update subscriptions with missing billing cycle dates
UPDATE subscriptions
SET
  billing_cycle_start = COALESCE(
    billing_cycle_start,
    start_date,
    created_at
  ),
  billing_cycle_end = COALESCE(
    billing_cycle_end,
    CASE
      WHEN subscription_tier IN ('trial_1day', 'trial_7day') THEN
        COALESCE(trial_end_date, end_date)
      ELSE
        COALESCE(start_date, created_at) + interval '30 days'
    END
  ),
  token_limit = COALESCE(
    NULLIF(token_limit, 0),
    get_token_limit_for_tier(subscription_tier)
  ),
  tokens_used_current_cycle = COALESCE(tokens_used_current_cycle, 0)
WHERE
  billing_cycle_start IS NULL
  OR billing_cycle_end IS NULL
  OR token_limit = 0
  OR token_limit IS NULL
  OR tokens_used_current_cycle IS NULL;

-- =====================================================================
-- STEP 4: Create function to auto-refresh expired billing cycles
-- =====================================================================

CREATE OR REPLACE FUNCTION refresh_billing_cycle_if_expired(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription_id uuid;
  v_current_cycle_end timestamptz;
  v_new_cycle_start timestamptz;
  v_new_cycle_end timestamptz;
  v_subscription_tier text;
  v_end_date timestamptz;
BEGIN
  -- Get active subscription
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
      DECLARE
        cycles_to_advance integer;
      BEGIN
        -- Calculate how many complete 30-day cycles have passed
        cycles_to_advance := GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (now() - v_current_cycle_end)) / (30 * 24 * 60 * 60)) + 1);

        v_new_cycle_start := v_current_cycle_end;
        v_new_cycle_end := v_current_cycle_end + (interval '30 days' * cycles_to_advance);

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

        RAISE NOTICE 'Billing cycle refreshed for subscription %: advanced % cycles', v_subscription_id, cycles_to_advance;

        RETURN jsonb_build_object(
          'success', true,
          'message', 'Billing cycle refreshed',
          'cycles_advanced', cycles_to_advance,
          'new_cycle_end', v_new_cycle_end
        );
      END;
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

-- =====================================================================
-- STEP 5: Update get_token_usage_info to auto-refresh cycles
-- =====================================================================

CREATE OR REPLACE FUNCTION get_token_usage_info(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_refresh_result jsonb;
BEGIN
  -- First, check and refresh billing cycle if expired
  v_refresh_result := refresh_billing_cycle_if_expired(p_user_id);

  -- Now get the current usage info
  SELECT jsonb_build_object(
    'tokens_used', COALESCE(tokens_used_current_cycle, 0),
    'token_limit', COALESCE(token_limit, 0),
    'tokens_remaining', GREATEST(0, COALESCE(token_limit, 0) - COALESCE(tokens_used_current_cycle, 0)),
    'billing_cycle_start', billing_cycle_start,
    'billing_cycle_end', billing_cycle_end,
    'usage_percentage', ROUND((COALESCE(tokens_used_current_cycle, 0)::numeric / NULLIF(COALESCE(token_limit, 1), 0)::numeric * 100)::numeric, 2),
    'subscription_tier', subscription_tier,
    'days_remaining_in_cycle', GREATEST(0, EXTRACT(DAY FROM (billing_cycle_end - now())))
  )
  INTO v_result
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > now()
  ORDER BY created_at DESC
  LIMIT 1;

  -- Return default values if no active subscription
  IF v_result IS NULL THEN
    v_result := jsonb_build_object(
      'tokens_used', 0,
      'token_limit', 0,
      'tokens_remaining', 0,
      'billing_cycle_start', null,
      'billing_cycle_end', null,
      'usage_percentage', 0,
      'subscription_tier', 'none',
      'days_remaining_in_cycle', 0
    );
  END IF;

  RETURN v_result;
END;
$$;

-- =====================================================================
-- STEP 6: Update update_token_usage to auto-refresh cycles
-- =====================================================================

CREATE OR REPLACE FUNCTION update_token_usage(
  p_user_id uuid,
  p_tokens_used integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription_id uuid;
  v_current_usage integer;
  v_token_limit integer;
  v_cycle_end timestamptz;
  v_result jsonb;
  v_refresh_result jsonb;
BEGIN
  -- First, check and refresh billing cycle if expired
  v_refresh_result := refresh_billing_cycle_if_expired(p_user_id);

  -- Get active subscription (after potential refresh)
  SELECT id, tokens_used_current_cycle, token_limit, billing_cycle_end
  INTO v_subscription_id, v_current_usage, v_token_limit, v_cycle_end
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > now()
  ORDER BY created_at DESC
  LIMIT 1;

  -- No active subscription found
  IF v_subscription_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No active subscription found',
      'tokens_used', 0,
      'token_limit', 0
    );
  END IF;

  -- Update token usage
  UPDATE subscriptions
  SET tokens_used_current_cycle = tokens_used_current_cycle + p_tokens_used,
      updated_at = now()
  WHERE id = v_subscription_id
  RETURNING tokens_used_current_cycle, token_limit, billing_cycle_end
  INTO v_current_usage, v_token_limit, v_cycle_end;

  -- Return success with usage info
  RETURN jsonb_build_object(
    'success', true,
    'tokens_used', v_current_usage,
    'token_limit', v_token_limit,
    'tokens_remaining', GREATEST(0, v_token_limit - v_current_usage),
    'billing_cycle_end', v_cycle_end,
    'usage_percentage', ROUND((v_current_usage::numeric / NULLIF(v_token_limit, 0)::numeric * 100)::numeric, 2),
    'cycle_refreshed', v_refresh_result->'success'
  );
END;
$$;

-- =====================================================================
-- STEP 7: Grant permissions on new functions
-- =====================================================================

GRANT EXECUTE ON FUNCTION initialize_billing_cycle() TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_billing_cycle_if_expired(uuid) TO authenticated;

-- =====================================================================
-- STEP 8: Validate all subscriptions have proper billing cycles
-- =====================================================================

DO $$
DECLARE
  invalid_count integer;
  total_count integer;
BEGIN
  -- Count subscriptions with invalid billing cycle data
  SELECT COUNT(*) INTO invalid_count
  FROM subscriptions
  WHERE status = 'active'
    AND (billing_cycle_start IS NULL
         OR billing_cycle_end IS NULL
         OR token_limit <= 0
         OR tokens_used_current_cycle IS NULL);

  SELECT COUNT(*) INTO total_count
  FROM subscriptions
  WHERE status = 'active';

  IF invalid_count > 0 THEN
    RAISE WARNING 'Found % out of % active subscriptions with invalid billing cycle data', invalid_count, total_count;
  ELSE
    RAISE NOTICE 'SUCCESS: All % active subscriptions have valid billing cycle data', total_count;
  END IF;
END $$;

-- =====================================================================
-- Migration Complete
-- =====================================================================

COMMENT ON FUNCTION initialize_billing_cycle() IS 'Automatically initializes billing cycle fields when new subscriptions are created';
COMMENT ON FUNCTION refresh_billing_cycle_if_expired(uuid) IS 'Checks and refreshes billing cycle if expired, advancing by 30 days for paid subscriptions';
