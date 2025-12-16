/*
  # Unify Token Limits to 520K for All Paid Subscriptions

  ## Overview
  This migration implements a unified token system where all paid subscription tiers
  (monthly, quarterly, biannual) receive exactly 520,000 tokens per 30-day billing cycle.
  The 7-day trial is updated to 121,000 tokens (7 days worth) for new paying customers only.

  ## Token Allocation
  - trial_1day: 10,000 tokens (unchanged - testing purposes)
  - trial_7day: 121,000 tokens (7 days worth for new subscribers)
  - monthly: 520,000 tokens per 30-day cycle
  - quarterly: 520,000 tokens per 30-day cycle
  - biannual: 520,000 tokens per 30-day cycle

  ## Changes

  1. **Update get_token_limit_for_tier Function**
     - Set all paid tiers to 520,000 tokens
     - Update trial_7day to 121,000 tokens
     - Keep trial_1day at 10,000 tokens

  2. **Add First-Time Subscriber Tracking**
     - Add has_had_paid_subscription column to user_profiles
     - Track if user has ever had a paid subscription
     - Prevents reuse of 7-day trial for returning customers

  3. **Update Existing Subscriptions**
     - Migrate all active paid subscriptions to 520,000 token limit
     - Update trial_7day subscriptions to 121,000 tokens
     - Preserve billing cycle dates and usage data

  4. **Data Validation**
     - Ensure all active subscriptions have correct token limits
     - Verify billing cycles are properly configured
     - Check for data integrity issues

  ## Migration Strategy
  - Safe for production: uses IF NOT EXISTS checks
  - Idempotent: can be run multiple times safely
  - Preserves existing usage data
  - Backward compatible with existing billing cycle system
*/

-- =====================================================================
-- STEP 1: Update get_token_limit_for_tier function with new limits
-- =====================================================================

CREATE OR REPLACE FUNCTION get_token_limit_for_tier(p_tier text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE p_tier
    WHEN 'trial_1day' THEN 10000
    WHEN 'trial_7day' THEN 121000
    WHEN 'monthly' THEN 520000
    WHEN 'quarterly' THEN 520000
    WHEN 'biannual' THEN 520000
    ELSE 520000
  END;
END;
$$;

-- =====================================================================
-- STEP 2: Add first-time subscriber tracking to user_profiles
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'has_had_paid_subscription'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN has_had_paid_subscription boolean NOT NULL DEFAULT false;

    COMMENT ON COLUMN user_profiles.has_had_paid_subscription IS 'Tracks if user has ever had a paid subscription (prevents trial_7day reuse)';
  END IF;
END $$;

-- =====================================================================
-- STEP 3: Mark existing users with active paid subscriptions
-- =====================================================================

UPDATE user_profiles
SET has_had_paid_subscription = true
WHERE id IN (
  SELECT DISTINCT user_id
  FROM subscriptions
  WHERE subscription_tier IN ('monthly', 'quarterly', 'biannual')
    AND status = 'active'
);

-- Also mark users who have had paid subscriptions in the past
UPDATE user_profiles
SET has_had_paid_subscription = true
WHERE id IN (
  SELECT DISTINCT user_id
  FROM subscriptions
  WHERE subscription_tier IN ('monthly', 'quarterly', 'biannual')
);

-- =====================================================================
-- STEP 4: Update token limits for all existing subscriptions
-- =====================================================================

-- Update all monthly subscriptions to 520K tokens
UPDATE subscriptions
SET token_limit = 520000
WHERE subscription_tier = 'monthly'
  AND (token_limit != 520000 OR token_limit IS NULL);

-- Update all quarterly subscriptions to 520K tokens
UPDATE subscriptions
SET token_limit = 520000
WHERE subscription_tier = 'quarterly'
  AND (token_limit != 520000 OR token_limit IS NULL);

-- Update all biannual subscriptions to 520K tokens
UPDATE subscriptions
SET token_limit = 520000
WHERE subscription_tier = 'biannual'
  AND (token_limit != 520000 OR token_limit IS NULL);

-- Update all trial_7day subscriptions to 121K tokens
UPDATE subscriptions
SET token_limit = 121000
WHERE subscription_tier = 'trial_7day'
  AND (token_limit != 121000 OR token_limit IS NULL);

-- Update all trial_1day subscriptions to 10K tokens (in case any were set incorrectly)
UPDATE subscriptions
SET token_limit = 10000
WHERE subscription_tier = 'trial_1day'
  AND (token_limit != 10000 OR token_limit IS NULL);

-- =====================================================================
-- STEP 5: Create function to mark user as having paid subscription
-- =====================================================================

CREATE OR REPLACE FUNCTION mark_user_has_paid_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark user as having had a paid subscription when they get a paid tier
  IF NEW.subscription_tier IN ('monthly', 'quarterly', 'biannual') THEN
    UPDATE user_profiles
    SET has_had_paid_subscription = true
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- STEP 6: Create trigger to track paid subscriptions
-- =====================================================================

DROP TRIGGER IF EXISTS trigger_mark_paid_subscription ON subscriptions;
CREATE TRIGGER trigger_mark_paid_subscription
  AFTER INSERT OR UPDATE OF subscription_tier ON subscriptions
  FOR EACH ROW
  WHEN (NEW.subscription_tier IN ('monthly', 'quarterly', 'biannual'))
  EXECUTE FUNCTION mark_user_has_paid_subscription();

-- =====================================================================
-- STEP 7: Create function to check trial_7day eligibility
-- =====================================================================

CREATE OR REPLACE FUNCTION check_trial_7day_eligibility(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_had_paid boolean;
  v_has_trial_7day_history boolean;
BEGIN
  -- Check if user has ever had a paid subscription
  SELECT has_had_paid_subscription INTO v_has_had_paid
  FROM user_profiles
  WHERE id = p_user_id;

  -- Check if user has ever had a trial_7day subscription
  SELECT EXISTS(
    SELECT 1 FROM subscriptions
    WHERE user_id = p_user_id
      AND subscription_tier = 'trial_7day'
  ) INTO v_has_trial_7day_history;

  RETURN jsonb_build_object(
    'eligible', NOT COALESCE(v_has_had_paid, false) AND NOT COALESCE(v_has_trial_7day_history, false),
    'has_had_paid_subscription', COALESCE(v_has_had_paid, false),
    'has_trial_7day_history', COALESCE(v_has_trial_7day_history, false)
  );
END;
$$;

-- =====================================================================
-- STEP 8: Update initialize_billing_cycle to use new token limits
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
  -- Get token limit for the tier using updated function
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
-- STEP 9: Grant permissions on new functions
-- =====================================================================

GRANT EXECUTE ON FUNCTION get_token_limit_for_tier(text) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_user_has_paid_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION check_trial_7day_eligibility(uuid) TO authenticated;

-- =====================================================================
-- STEP 10: Create index for efficient trial eligibility checks
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_paid_subscription
  ON user_profiles(has_had_paid_subscription)
  WHERE has_had_paid_subscription = false;

CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_history
  ON subscriptions(user_id, subscription_tier)
  WHERE subscription_tier = 'trial_7day';

-- =====================================================================
-- STEP 11: Data validation and integrity checks
-- =====================================================================

DO $$
DECLARE
  v_incorrect_limits integer;
  v_missing_cycles integer;
  v_total_active integer;
BEGIN
  -- Count subscriptions with incorrect token limits
  SELECT COUNT(*) INTO v_incorrect_limits
  FROM subscriptions
  WHERE status = 'active'
    AND (
      (subscription_tier = 'monthly' AND token_limit != 520000) OR
      (subscription_tier = 'quarterly' AND token_limit != 520000) OR
      (subscription_tier = 'biannual' AND token_limit != 520000) OR
      (subscription_tier = 'trial_7day' AND token_limit != 121000) OR
      (subscription_tier = 'trial_1day' AND token_limit != 10000)
    );

  -- Count subscriptions with missing billing cycles
  SELECT COUNT(*) INTO v_missing_cycles
  FROM subscriptions
  WHERE status = 'active'
    AND (billing_cycle_start IS NULL OR billing_cycle_end IS NULL);

  -- Total active subscriptions
  SELECT COUNT(*) INTO v_total_active
  FROM subscriptions
  WHERE status = 'active';

  IF v_incorrect_limits > 0 THEN
    RAISE WARNING '⚠️  Found % active subscriptions with incorrect token limits', v_incorrect_limits;
  ELSE
    RAISE NOTICE '✅ All % active subscriptions have correct token limits', v_total_active;
  END IF;

  IF v_missing_cycles > 0 THEN
    RAISE WARNING '⚠️  Found % active subscriptions with missing billing cycles', v_missing_cycles;
  ELSE
    RAISE NOTICE '✅ All % active subscriptions have valid billing cycles', v_total_active;
  END IF;

  RAISE NOTICE '📊 Migration Summary:';
  RAISE NOTICE '   - Total active subscriptions: %', v_total_active;
  RAISE NOTICE '   - Token limits updated: % subscriptions', v_total_active - v_incorrect_limits;
  RAISE NOTICE '   - Users marked with paid history: % users', (
    SELECT COUNT(*) FROM user_profiles WHERE has_had_paid_subscription = true
  );
END $$;

-- =====================================================================
-- Migration Complete
-- =====================================================================

COMMENT ON FUNCTION get_token_limit_for_tier(text) IS 'Returns unified token limit: 520K for all paid tiers, 121K for trial_7day, 10K for trial_1day';
COMMENT ON FUNCTION check_trial_7day_eligibility(uuid) IS 'Checks if user is eligible for 7-day trial (new paying customers only)';
COMMENT ON COLUMN user_profiles.has_had_paid_subscription IS 'Prevents reuse of trial_7day - only first-time subscribers get 7-day trial';
