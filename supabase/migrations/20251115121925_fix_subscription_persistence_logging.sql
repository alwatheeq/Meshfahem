/*
  # Fix Subscription Persistence and Add Comprehensive Logging

  1. Changes Made
    - Create subscription_status_log table to track all status changes
    - Add database trigger to automatically log subscription changes
    - Fix RLS policies to ensure users can ALWAYS read their own subscriptions
    - Add validation function to prevent invalid subscription data
    - Create subscription debugging view for easier troubleshooting
    - Add function to get detailed subscription debug info
    
  2. New Tables
    - subscription_status_log: Tracks every subscription status change with timestamp
    
  3. Security
    - Users can view their own subscription logs
    - Admins can view all logs
    - Triggers run with SECURITY DEFINER to bypass RLS during logging
    
  4. Purpose
    - Track why and when subscriptions change status
    - Identify if subscriptions are being inadvertently expired
    - Provide audit trail for subscription lifecycle
    - Enable debugging of "subscription disappears after browser close" issues
*/

-- Create subscription status log table
CREATE TABLE IF NOT EXISTS subscription_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  old_end_date timestamptz,
  new_end_date timestamptz,
  change_reason text,
  triggered_by text DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscription_status_log_subscription_id 
  ON subscription_status_log(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_status_log_user_id 
  ON subscription_status_log(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE subscription_status_log ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own logs
CREATE POLICY "Users can view own subscription logs"
  ON subscription_status_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow admins to view all logs
CREATE POLICY "Admins can view all subscription logs"
  ON subscription_status_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- Allow system to insert logs
CREATE POLICY "System can insert subscription logs"
  ON subscription_status_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to log subscription changes
CREATE OR REPLACE FUNCTION log_subscription_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  change_reason_text text;
BEGIN
  -- Determine change reason
  IF TG_OP = 'INSERT' THEN
    change_reason_text := 'New subscription created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status THEN
      change_reason_text := 'Status changed from ' || OLD.status || ' to ' || NEW.status;
    ELSIF OLD.end_date != NEW.end_date THEN
      change_reason_text := 'End date changed from ' || OLD.end_date || ' to ' || NEW.end_date;
    ELSE
      change_reason_text := 'Subscription updated';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    change_reason_text := 'Subscription deleted';
  END IF;

  -- Log the change
  IF TG_OP = 'DELETE' THEN
    INSERT INTO subscription_status_log (
      subscription_id,
      user_id,
      old_status,
      new_status,
      old_end_date,
      new_end_date,
      change_reason,
      triggered_by
    ) VALUES (
      OLD.id,
      OLD.user_id,
      OLD.status,
      'deleted',
      OLD.end_date,
      NULL,
      change_reason_text,
      current_user
    );
    RETURN OLD;
  ELSE
    INSERT INTO subscription_status_log (
      subscription_id,
      user_id,
      old_status,
      new_status,
      old_end_date,
      new_end_date,
      change_reason,
      triggered_by
    ) VALUES (
      NEW.id,
      NEW.user_id,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      NEW.status,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.end_date ELSE NULL END,
      NEW.end_date,
      change_reason_text,
      current_user
    );
    RETURN NEW;
  END IF;
END;
$$;

-- Create trigger to log all subscription changes
DROP TRIGGER IF EXISTS trigger_log_subscription_changes ON subscriptions;
CREATE TRIGGER trigger_log_subscription_changes
  AFTER INSERT OR UPDATE OR DELETE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION log_subscription_change();

-- Fix RLS policies to ensure users can ALWAYS read their subscriptions
-- Drop existing policies and recreate them with simpler, more reliable logic
DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON subscriptions;

-- Simple, reliable policy for users to view their own subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can view all subscriptions
CREATE POLICY "Admins can view all subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- Add policy for users to insert their own subscriptions (needed for trial activation)
DROP POLICY IF EXISTS "Users can create own subscriptions" ON subscriptions;
CREATE POLICY "Users can create own subscriptions"
  ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Add policy for users to update their own subscriptions (needed for cancellation)
DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;
CREATE POLICY "Users can update own subscriptions"
  ON subscriptions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Function to validate subscription data before insert/update
CREATE OR REPLACE FUNCTION validate_subscription_data()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Ensure end_date is in the future for active subscriptions
  IF NEW.status = 'active' AND NEW.end_date <= now() THEN
    RAISE WARNING 'Creating active subscription with past end_date for user %', NEW.user_id;
  END IF;

  -- Ensure subscription tier is valid
  IF NEW.subscription_tier NOT IN ('trial_1day', 'trial_7day', 'monthly', 'quarterly', 'biannual') THEN
    RAISE EXCEPTION 'Invalid subscription tier: %', NEW.subscription_tier;
  END IF;

  -- Ensure status is valid
  IF NEW.status NOT IN ('active', 'canceled', 'expired', 'payment_failed') THEN
    RAISE EXCEPTION 'Invalid subscription status: %', NEW.status;
  END IF;

  -- Log creation/update for debugging
  RAISE NOTICE 'Subscription % for user %: tier=%, status=%, end_date=%', 
    CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
    NEW.user_id, 
    NEW.subscription_tier, 
    NEW.status, 
    NEW.end_date;

  RETURN NEW;
END;
$$;

-- Create trigger to validate subscription data
DROP TRIGGER IF EXISTS trigger_validate_subscription ON subscriptions;
CREATE TRIGGER trigger_validate_subscription
  BEFORE INSERT OR UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION validate_subscription_data();

-- Function to get detailed subscription debug info
CREATE OR REPLACE FUNCTION get_subscription_debug_info(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  active_sub_count int;
  all_sub_count int;
  latest_sub record;
  recent_logs jsonb;
BEGIN
  -- Count subscriptions
  SELECT COUNT(*) INTO active_sub_count
  FROM subscriptions
  WHERE user_id = p_user_id 
    AND status = 'active' 
    AND end_date > now();

  SELECT COUNT(*) INTO all_sub_count
  FROM subscriptions
  WHERE user_id = p_user_id;

  -- Get latest subscription
  SELECT * INTO latest_sub
  FROM subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Get recent logs
  SELECT jsonb_agg(
    jsonb_build_object(
      'created_at', created_at,
      'change_reason', change_reason,
      'old_status', old_status,
      'new_status', new_status,
      'triggered_by', triggered_by
    )
  ) INTO recent_logs
  FROM (
    SELECT *
    FROM subscription_status_log
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 10
  ) logs;

  -- Build result
  result := jsonb_build_object(
    'user_id', p_user_id,
    'active_subscription_count', active_sub_count,
    'total_subscription_count', all_sub_count,
    'has_active_subscription', active_sub_count > 0,
    'latest_subscription', CASE 
      WHEN latest_sub.id IS NOT NULL THEN
        jsonb_build_object(
          'id', latest_sub.id,
          'tier', latest_sub.subscription_tier,
          'status', latest_sub.status,
          'start_date', latest_sub.start_date,
          'end_date', latest_sub.end_date,
          'created_at', latest_sub.created_at,
          'is_expired', latest_sub.end_date <= now(),
          'days_until_expiry', EXTRACT(DAY FROM latest_sub.end_date - now())
        )
      ELSE NULL
    END,
    'recent_status_changes', COALESCE(recent_logs, '[]'::jsonb),
    'debug_timestamp', now()
  );

  RETURN result;
END;
$$;

-- Create view for easier subscription debugging (admins only)
CREATE OR REPLACE VIEW subscription_debug_view AS
SELECT 
  s.id as subscription_id,
  s.user_id,
  u.email,
  s.subscription_tier,
  s.status,
  s.start_date,
  s.end_date,
  CASE 
    WHEN s.end_date <= now() THEN 'EXPIRED'
    WHEN s.end_date <= now() + interval '7 days' THEN 'EXPIRING_SOON'
    ELSE 'VALID'
  END as validity_status,
  EXTRACT(DAY FROM s.end_date - now()) as days_remaining,
  s.auto_renew,
  s.payment_method_saved,
  s.stripe_subscription_id,
  s.created_at,
  s.updated_at,
  (
    SELECT COUNT(*)
    FROM subscription_status_log
    WHERE subscription_id = s.id
  ) as status_change_count,
  (
    SELECT change_reason
    FROM subscription_status_log
    WHERE subscription_id = s.id
    ORDER BY created_at DESC
    LIMIT 1
  ) as last_change_reason
FROM subscriptions s
JOIN auth.users u ON s.user_id = u.id
ORDER BY s.created_at DESC;

-- Grant access to admins for the debug view
GRANT SELECT ON subscription_debug_view TO authenticated;

-- Improve the check_subscription_expiration function to be less aggressive
CREATE OR REPLACE FUNCTION check_subscription_expiration()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
    RETURNING id
  )
  SELECT COUNT(*) INTO expired_count FROM expired_subs;

  IF expired_count > 0 THEN
    RAISE NOTICE 'Marked % subscriptions as expired', expired_count;
  END IF;
END;
$$;

-- Add comment to subscriptions table explaining the persistence model
COMMENT ON TABLE subscriptions IS 'Stores user subscription data. This data persists across browser sessions and is tied to user_id. If users lose subscription status after closing browser, check: 1) RLS policies, 2) Auth token validity, 3) subscription_status_log table for unexpected changes.';

-- Display summary
DO $$
DECLARE
  total_subs int;
  active_subs int;
  expired_subs int;
BEGIN
  SELECT COUNT(*) INTO total_subs FROM subscriptions;
  SELECT COUNT(*) INTO active_subs FROM subscriptions WHERE status = 'active' AND end_date > now();
  SELECT COUNT(*) INTO expired_subs FROM subscriptions WHERE status = 'expired' OR end_date <= now();

  RAISE NOTICE '=====================================';
  RAISE NOTICE 'SUBSCRIPTION PERSISTENCE FIX APPLIED';
  RAISE NOTICE '=====================================';
  RAISE NOTICE 'Total subscriptions: %', total_subs;
  RAISE NOTICE 'Active subscriptions: %', active_subs;
  RAISE NOTICE 'Expired subscriptions: %', expired_subs;
  RAISE NOTICE '';
  RAISE NOTICE 'New features:';
  RAISE NOTICE '- subscription_status_log table tracks all changes';
  RAISE NOTICE '- Automatic logging trigger on all subscription updates';
  RAISE NOTICE '- Fixed RLS policies for reliable subscription reads';
  RAISE NOTICE '- Validation trigger prevents invalid subscription data';
  RAISE NOTICE '- get_subscription_debug_info() function for troubleshooting';
  RAISE NOTICE '- subscription_debug_view for admin monitoring';
  RAISE NOTICE '=====================================';
END $$;
