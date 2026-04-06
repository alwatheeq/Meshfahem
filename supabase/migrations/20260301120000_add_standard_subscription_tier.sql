-- Allow 'standard' subscription tier for the new Standard plan + add-ons flow.
-- Constraint name on subscriptions.subscription_tier is typically subscriptions_subscription_tier_check.

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_subscription_tier_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_subscription_tier_check
  CHECK (subscription_tier IN ('trial_1day', 'trial_7day', 'monthly', 'quarterly', 'biannual', 'standard'));

-- Update trigger that validates subscription_tier (from fix_subscription_persistence_logging).
-- We need to replace the trigger function to allow 'standard'.
CREATE OR REPLACE FUNCTION validate_subscription_data()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.end_date <= now() THEN
    RAISE WARNING 'Creating active subscription with past end_date for user %', NEW.user_id;
  END IF;

  IF NEW.subscription_tier NOT IN ('trial_1day', 'trial_7day', 'monthly', 'quarterly', 'biannual', 'standard') THEN
    RAISE EXCEPTION 'Invalid subscription tier: %', NEW.subscription_tier;
  END IF;

  IF NEW.status NOT IN ('active', 'canceled', 'expired', 'payment_failed') THEN
    RAISE EXCEPTION 'Invalid subscription status: %', NEW.status;
  END IF;

  RAISE NOTICE 'Subscription % for user %: tier=%, status=%, end_date=%',
    CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
    NEW.user_id,
    NEW.subscription_tier,
    NEW.status,
    NEW.end_date;

  RETURN NEW;
END;
$$;

-- Ensure get_token_limit_for_tier returns 520000 for 'standard' (same as monthly).
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
    WHEN 'standard' THEN 520000
    ELSE 520000
  END;
END;
$$;
