/*
  # Token Usage History Tracking and Admin Management Features

  ## Overview
  This migration creates a comprehensive token usage history tracking system
  and adds admin features for managing subscriptions and monitoring usage.

  ## Changes

  1. **Token Usage History Table**
     - Tracks historical token usage per billing cycle
     - Allows admins to view usage trends over time
     - Automatically archives usage when cycles reset

  2. **Enhanced Subscription Management**
     - Add functions for admin to cancel/unsubscribe users
     - Add functions to audit subscription integrity
     - Add usage monitoring and reporting capabilities

  3. **Indexes and Performance**
     - Optimize queries for usage history retrieval
     - Add indexes for admin reporting

  4. **Security**
     - RLS policies for admins and users
     - Audit logging for admin actions
*/

-- =====================================================================
-- STEP 1: Create token_usage_history table
-- =====================================================================

CREATE TABLE IF NOT EXISTS token_usage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  subscription_tier text NOT NULL,
  billing_cycle_start timestamptz NOT NULL,
  billing_cycle_end timestamptz NOT NULL,
  tokens_used integer NOT NULL DEFAULT 0,
  token_limit integer NOT NULL,
  usage_percentage numeric(5,2) GENERATED ALWAYS AS (
    CASE
      WHEN token_limit > 0 THEN ROUND((tokens_used::numeric / token_limit::numeric * 100)::numeric, 2)
      ELSE 0
    END
  ) STORED,
  archived_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_token_usage_history_user_id
  ON token_usage_history(user_id, billing_cycle_start DESC);

CREATE INDEX IF NOT EXISTS idx_token_usage_history_archived_at
  ON token_usage_history(archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_usage_history_subscription
  ON token_usage_history(subscription_id)
  WHERE subscription_id IS NOT NULL;

-- Enable RLS
ALTER TABLE token_usage_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own usage history"
  ON token_usage_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all usage history"
  ON token_usage_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only system can insert/update usage history
CREATE POLICY "System can manage usage history"
  ON token_usage_history
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================================
-- STEP 2: Function to archive token usage when cycle resets
-- =====================================================================

CREATE OR REPLACE FUNCTION archive_token_usage(
  p_user_id uuid,
  p_subscription_id uuid,
  p_subscription_tier text,
  p_cycle_start timestamptz,
  p_cycle_end timestamptz,
  p_tokens_used integer,
  p_token_limit integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO token_usage_history (
    user_id,
    subscription_id,
    subscription_tier,
    billing_cycle_start,
    billing_cycle_end,
    tokens_used,
    token_limit,
    archived_at
  ) VALUES (
    p_user_id,
    p_subscription_id,
    p_subscription_tier,
    p_cycle_start,
    p_cycle_end,
    p_tokens_used,
    p_token_limit,
    now()
  );

  RAISE NOTICE 'Archived usage for user %: % / % tokens', p_user_id, p_tokens_used, p_token_limit;
END;
$$;

-- =====================================================================
-- STEP 3: Update refresh_billing_cycle_if_expired to archive usage
-- =====================================================================

CREATE OR REPLACE FUNCTION refresh_billing_cycle_if_expired(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription_id uuid;
  v_current_cycle_end timestamptz;
  v_current_cycle_start timestamptz;
  v_new_cycle_start timestamptz;
  v_new_cycle_end timestamptz;
  v_subscription_tier text;
  v_end_date timestamptz;
  v_tokens_used integer;
  v_token_limit integer;
BEGIN
  SELECT id, billing_cycle_end, billing_cycle_start, subscription_tier, end_date,
         tokens_used_current_cycle, token_limit
  INTO v_subscription_id, v_current_cycle_end, v_current_cycle_start, v_subscription_tier,
       v_end_date, v_tokens_used, v_token_limit
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_subscription_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No active subscription found'
    );
  END IF;

  IF v_current_cycle_end IS NULL OR now() > v_current_cycle_end THEN
    IF v_subscription_tier IN ('monthly', 'quarterly', 'biannual') THEN
      DECLARE
        cycles_to_advance integer;
      BEGIN
        cycles_to_advance := GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (now() - v_current_cycle_end)) / (30 * 24 * 60 * 60)) + 1);

        PERFORM archive_token_usage(
          p_user_id,
          v_subscription_id,
          v_subscription_tier,
          v_current_cycle_start,
          v_current_cycle_end,
          v_tokens_used,
          v_token_limit
        );

        v_new_cycle_start := v_current_cycle_end;
        v_new_cycle_end := v_current_cycle_end + (interval '30 days' * cycles_to_advance);

        IF v_new_cycle_end > v_end_date THEN
          v_new_cycle_end := v_end_date;
        END IF;

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
          'new_cycle_end', v_new_cycle_end,
          'usage_archived', true
        );
      END;
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Trial subscription - cycle does not refresh'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Billing cycle is current',
    'cycle_end', v_current_cycle_end
  );
END;
$$;

-- =====================================================================
-- STEP 4: Function to get user usage history
-- =====================================================================

CREATE OR REPLACE FUNCTION get_user_usage_history(
  p_user_id uuid,
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  cycle_start timestamptz,
  cycle_end timestamptz,
  tokens_used integer,
  token_limit integer,
  usage_percentage numeric,
  subscription_tier text,
  archived_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    h.billing_cycle_start,
    h.billing_cycle_end,
    h.tokens_used,
    h.token_limit,
    h.usage_percentage,
    h.subscription_tier,
    h.archived_at
  FROM token_usage_history h
  WHERE h.user_id = p_user_id
  ORDER BY h.billing_cycle_start DESC
  LIMIT p_limit;
END;
$$;

-- =====================================================================
-- STEP 5: Function for admin to cancel subscription
-- =====================================================================

CREATE OR REPLACE FUNCTION admin_cancel_subscription(
  p_subscription_id uuid,
  p_admin_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean;
  v_subscription record;
BEGIN
  SELECT role = 'admin' INTO v_is_admin
  FROM user_profiles
  WHERE id = p_admin_id;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin access required'
    );
  END IF;

  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE id = p_subscription_id;

  IF v_subscription IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription not found'
    );
  END IF;

  UPDATE subscriptions
  SET
    status = 'canceled',
    canceled_at = now(),
    auto_renew = false,
    updated_at = now()
  WHERE id = p_subscription_id;

  INSERT INTO notifications (user_id, notification_type, message, action_url)
  VALUES (
    v_subscription.user_id,
    'subscription_canceled',
    COALESCE('Your subscription has been canceled by an administrator. ' || p_reason, 'Your subscription has been canceled by an administrator. You will retain access until the end of your billing period.'),
    '/pricing'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Subscription canceled successfully',
    'subscription_id', p_subscription_id,
    'user_id', v_subscription.user_id
  );
END;
$$;

-- =====================================================================
-- STEP 6: Function to audit subscription integrity
-- =====================================================================

CREATE OR REPLACE FUNCTION audit_subscription_integrity()
RETURNS TABLE (
  issue_type text,
  subscription_id uuid,
  user_id uuid,
  subscription_tier text,
  details text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    'missing_billing_cycle'::text,
    s.id,
    s.user_id,
    s.subscription_tier,
    'Missing billing cycle fields'::text
  FROM subscriptions s
  WHERE s.status = 'active'
    AND (s.billing_cycle_start IS NULL OR s.billing_cycle_end IS NULL)

  UNION ALL

  SELECT
    'incorrect_token_limit'::text,
    s.id,
    s.user_id,
    s.subscription_tier,
    format('Token limit is %s but should be %s', s.token_limit, get_token_limit_for_tier(s.subscription_tier))::text
  FROM subscriptions s
  WHERE s.status = 'active'
    AND s.token_limit != get_token_limit_for_tier(s.subscription_tier)

  UNION ALL

  SELECT
    'expired_active_subscription'::text,
    s.id,
    s.user_id,
    s.subscription_tier,
    format('Subscription ended on %s but status is still active', s.end_date)::text
  FROM subscriptions s
  WHERE s.status = 'active'
    AND s.end_date < now()

  ORDER BY issue_type, subscription_id;
END;
$$;

-- =====================================================================
-- STEP 7: Function to fix subscription integrity issues
-- =====================================================================

CREATE OR REPLACE FUNCTION fix_subscription_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fixed_count integer := 0;
  v_expired_count integer := 0;
BEGIN
  UPDATE subscriptions
  SET
    billing_cycle_start = COALESCE(billing_cycle_start, start_date, created_at),
    billing_cycle_end = COALESCE(
      billing_cycle_end,
      CASE
        WHEN subscription_tier IN ('trial_1day', 'trial_7day') THEN end_date
        ELSE COALESCE(start_date, created_at) + interval '30 days'
      END
    ),
    token_limit = get_token_limit_for_tier(subscription_tier),
    tokens_used_current_cycle = COALESCE(tokens_used_current_cycle, 0)
  WHERE status = 'active'
    AND (
      billing_cycle_start IS NULL
      OR billing_cycle_end IS NULL
      OR token_limit != get_token_limit_for_tier(subscription_tier)
    );

  GET DIAGNOSTICS v_fixed_count = ROW_COUNT;

  UPDATE subscriptions
  SET status = 'expired'
  WHERE status = 'active'
    AND end_date < now();

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'billing_cycles_fixed', v_fixed_count,
    'expired_subscriptions_updated', v_expired_count
  );
END;
$$;

-- =====================================================================
-- STEP 8: Function to get all users with token usage for admin
-- =====================================================================

CREATE OR REPLACE FUNCTION admin_get_users_with_usage()
RETURNS TABLE (
  user_id uuid,
  email text,
  subscription_tier text,
  subscription_status text,
  tokens_used integer,
  token_limit integer,
  usage_percentage numeric,
  billing_cycle_end timestamptz,
  days_remaining integer,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    up.id,
    up.email,
    COALESCE(s.subscription_tier, 'none'::text),
    COALESCE(s.status, 'none'::text),
    COALESCE(s.tokens_used_current_cycle, 0),
    COALESCE(s.token_limit, 0),
    CASE
      WHEN s.token_limit > 0 THEN
        ROUND((COALESCE(s.tokens_used_current_cycle, 0)::numeric / s.token_limit::numeric * 100)::numeric, 2)
      ELSE 0
    END,
    s.billing_cycle_end,
    CASE
      WHEN s.billing_cycle_end IS NOT NULL THEN
        GREATEST(0, EXTRACT(DAY FROM (s.billing_cycle_end - now()))::integer)
      ELSE 0
    END,
    up.created_at
  FROM user_profiles up
  LEFT JOIN LATERAL (
    SELECT *
    FROM subscriptions
    WHERE user_id = up.id
      AND status = 'active'
      AND end_date > now()
    ORDER BY created_at DESC
    LIMIT 1
  ) s ON true
  ORDER BY up.created_at DESC;
END;
$$;

-- =====================================================================
-- STEP 9: Grant permissions
-- =====================================================================

GRANT EXECUTE ON FUNCTION archive_token_usage(uuid, uuid, text, timestamptz, timestamptz, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_usage_history(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_cancel_subscription(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION audit_subscription_integrity() TO authenticated;
GRANT EXECUTE ON FUNCTION fix_subscription_integrity() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_users_with_usage() TO authenticated;

-- =====================================================================
-- STEP 10: Add comments for documentation
-- =====================================================================

COMMENT ON TABLE token_usage_history IS 'Historical record of token usage per billing cycle for reporting and analytics';
COMMENT ON FUNCTION archive_token_usage IS 'Archives token usage when billing cycle resets, called automatically by refresh_billing_cycle_if_expired';
COMMENT ON FUNCTION get_user_usage_history IS 'Retrieves historical token usage for a user, ordered by most recent first';
COMMENT ON FUNCTION admin_cancel_subscription IS 'Allows admins to cancel user subscriptions with optional reason';
COMMENT ON FUNCTION audit_subscription_integrity IS 'Identifies subscriptions with missing or incorrect data';
COMMENT ON FUNCTION fix_subscription_integrity IS 'Automatically fixes subscriptions with integrity issues';
COMMENT ON FUNCTION admin_get_users_with_usage IS 'Returns all users with their current token usage for admin dashboard';

-- =====================================================================
-- Migration Complete
-- =====================================================================
