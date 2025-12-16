/*
  # Implement 30-Day Billing Cycle System with Token-Based Usage Tracking

  ## Overview
  This migration transforms the usage tracking system from calendar-month resets to a proper
  30-day billing cycle model with token-based limits per subscription tier.

  ## Changes

  1. **Add Billing Cycle Columns to subscriptions table**
     - `billing_cycle_start` (timestamptz) - Start of current 30-day billing cycle
     - `billing_cycle_end` (timestamptz) - End of current 30-day billing cycle
     - `tokens_used_current_cycle` (integer, default 0) - Tokens consumed in current cycle
     - `token_limit` (integer) - Maximum tokens allowed per billing cycle based on tier

  2. **Token Limits Per Tier**
     - trial_1day: 10,000 tokens (try each feature once)
     - trial_7day: 50,000 tokens (full access for 7 days)
     - monthly: 100,000 tokens per 30-day cycle
     - quarterly: 300,000 tokens per 30-day cycle
     - biannual: 600,000 tokens per 30-day cycle

  3. **Migrate Existing Data**
     - Set billing_cycle_start to subscription start_date
     - Calculate billing_cycle_end as 30 days from start
     - Migrate monthly_usage from user_profiles to tokens_used_current_cycle
     - Set token_limit based on subscription_tier

  4. **Database Functions**
     - Create check_and_reset_billing_cycle() function for automatic cycle management
     - Create get_token_limit_for_tier() helper function
     - Update subscription management triggers

  5. **Indexes**
     - Add index on (user_id, billing_cycle_end) for efficient cycle queries
     - Add index on tokens_used_current_cycle for usage reporting

  6. **Security**
     - Maintain existing RLS policies
     - Ensure users can only update their own token usage through application logic

  ## Migration Strategy
  - Backward compatible: keeps user_profiles.monthly_usage for reference
  - Safe rollback: all changes are additive with IF NOT EXISTS checks
  - Data validation: includes checks to ensure data integrity after migration
*/

-- =====================================================================
-- STEP 1: Add new columns to subscriptions table
-- =====================================================================

DO $$
BEGIN
  -- Add billing_cycle_start column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'billing_cycle_start'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN billing_cycle_start timestamptz;
  END IF;

  -- Add billing_cycle_end column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'billing_cycle_end'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN billing_cycle_end timestamptz;
  END IF;

  -- Add tokens_used_current_cycle column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'tokens_used_current_cycle'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN tokens_used_current_cycle integer NOT NULL DEFAULT 0;
  END IF;

  -- Add token_limit column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'token_limit'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN token_limit integer NOT NULL DEFAULT 100000;
  END IF;
END $$;

-- =====================================================================
-- STEP 2: Create helper function to get token limit for tier
-- =====================================================================

CREATE OR REPLACE FUNCTION get_token_limit_for_tier(p_tier text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE p_tier
    WHEN 'trial_1day' THEN 10000
    WHEN 'trial_7day' THEN 50000
    WHEN 'monthly' THEN 100000
    WHEN 'quarterly' THEN 300000
    WHEN 'biannual' THEN 600000
    ELSE 100000  -- Default fallback
  END;
END;
$$;

-- =====================================================================
-- STEP 3: Migrate existing data
-- =====================================================================

-- Set billing cycles for existing subscriptions
UPDATE subscriptions
SET
  billing_cycle_start = COALESCE(billing_cycle_start, start_date),
  billing_cycle_end = COALESCE(billing_cycle_end, start_date + interval '30 days'),
  token_limit = COALESCE(NULLIF(token_limit, 0), get_token_limit_for_tier(subscription_tier))
WHERE billing_cycle_start IS NULL OR billing_cycle_end IS NULL OR token_limit = 0;

-- Migrate monthly_usage from user_profiles to subscriptions for active subscriptions
UPDATE subscriptions s
SET tokens_used_current_cycle = COALESCE(
  (SELECT monthly_usage FROM user_profiles WHERE id = s.user_id),
  0
)
WHERE s.status = 'active'
  AND s.end_date > now()
  AND s.tokens_used_current_cycle = 0;

-- =====================================================================
-- STEP 4: Create billing cycle management function
-- =====================================================================

CREATE OR REPLACE FUNCTION check_and_reset_billing_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if we're past the billing cycle end date
  IF NEW.billing_cycle_end IS NOT NULL AND now() > NEW.billing_cycle_end THEN
    -- Calculate how many full 30-day cycles have passed
    DECLARE
      cycles_passed integer;
      new_cycle_start timestamptz;
      new_cycle_end timestamptz;
    BEGIN
      -- Calculate number of complete cycles that have passed
      cycles_passed := FLOOR(EXTRACT(EPOCH FROM (now() - NEW.billing_cycle_end)) / (30 * 24 * 60 * 60)) + 1;

      -- Set new cycle dates
      new_cycle_start := NEW.billing_cycle_end;
      new_cycle_end := NEW.billing_cycle_end + (interval '30 days' * cycles_passed);

      -- Reset the cycle
      NEW.billing_cycle_start := new_cycle_start;
      NEW.billing_cycle_end := new_cycle_end;
      NEW.tokens_used_current_cycle := 0;

      -- Log the reset for audit purposes (optional)
      RAISE NOTICE 'Billing cycle reset for subscription % (user %): % cycles passed',
        NEW.id, NEW.user_id, cycles_passed;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- STEP 5: Create trigger for automatic billing cycle reset
-- =====================================================================

DROP TRIGGER IF EXISTS trigger_check_billing_cycle_reset ON subscriptions;
CREATE TRIGGER trigger_check_billing_cycle_reset
  BEFORE UPDATE OF tokens_used_current_cycle ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION check_and_reset_billing_cycle();

-- =====================================================================
-- STEP 6: Create function to safely update token usage
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
BEGIN
  -- Get active subscription
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

  -- Update token usage (trigger will handle cycle reset if needed)
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
    'usage_percentage', ROUND((v_current_usage::numeric / NULLIF(v_token_limit, 0)::numeric * 100)::numeric, 2)
  );
END;
$$;

-- =====================================================================
-- STEP 7: Create function to get current token usage info
-- =====================================================================

CREATE OR REPLACE FUNCTION get_token_usage_info(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
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
-- STEP 8: Create indexes for performance
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_billing_cycle
  ON subscriptions(user_id, billing_cycle_end)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_subscriptions_token_usage
  ON subscriptions(tokens_used_current_cycle, token_limit)
  WHERE status = 'active';

-- =====================================================================
-- STEP 9: Add constraint to ensure token_limit is positive
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_token_limit_positive'
  ) THEN
    ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_token_limit_positive
    CHECK (token_limit > 0);
  END IF;
END $$;

-- =====================================================================
-- STEP 10: Grant execute permissions on functions
-- =====================================================================

GRANT EXECUTE ON FUNCTION get_token_limit_for_tier(text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_token_usage(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_token_usage_info(uuid) TO authenticated;

-- =====================================================================
-- STEP 11: Data validation and integrity checks
-- =====================================================================

-- Ensure all active subscriptions have valid billing cycles
DO $$
DECLARE
  invalid_count integer;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM subscriptions
  WHERE status = 'active'
    AND (billing_cycle_start IS NULL
         OR billing_cycle_end IS NULL
         OR token_limit <= 0);

  IF invalid_count > 0 THEN
    RAISE WARNING 'Found % active subscriptions with invalid billing cycle data', invalid_count;
  ELSE
    RAISE NOTICE 'All active subscriptions have valid billing cycle data';
  END IF;
END $$;

-- =====================================================================
-- Migration Complete
-- =====================================================================

-- Add comment to document the migration
COMMENT ON COLUMN subscriptions.billing_cycle_start IS 'Start date of current 30-day billing cycle';
COMMENT ON COLUMN subscriptions.billing_cycle_end IS 'End date of current 30-day billing cycle';
COMMENT ON COLUMN subscriptions.tokens_used_current_cycle IS 'Number of tokens consumed in current billing cycle';
COMMENT ON COLUMN subscriptions.token_limit IS 'Maximum tokens allowed per 30-day billing cycle based on subscription tier';
