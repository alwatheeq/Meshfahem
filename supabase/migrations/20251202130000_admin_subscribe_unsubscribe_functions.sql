/*
  # Admin Subscribe/Unsubscribe/Reactivate Functions

  ## Overview
  This migration adds simplified admin functions for subscribing/unsubscribing users
  and reactivating canceled subscriptions. These functions provide a cleaner API
  for admin operations.

  ## Functions Created

  1. admin_subscribe_user - Simplified subscription creation
  2. admin_unsubscribe_user - Simplified subscription cancellation
  3. admin_reactivate_subscription - Reactivate canceled/expired subscriptions

  ## Security
  - All functions use SECURITY DEFINER
  - All functions check is_admin_user() before proceeding
  - All operations are logged for audit trail via log_admin_action

  ## Usage
  These functions are called from UsersPage and SubscriptionsManagementPage components.
*/

-- =====================================================================
-- Function: admin_subscribe_user
-- =====================================================================

CREATE OR REPLACE FUNCTION admin_subscribe_user(
  p_user_id uuid,
  p_subscription_tier text,
  p_admin_id uuid,
  p_duration_days integer DEFAULT 30,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
  v_subscription_id uuid;
  v_admin_email text;
BEGIN
  -- Check if user is admin
  IF NOT is_admin_user(p_admin_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin access required'
    );
  END IF;

  -- Get admin email for logging
  SELECT email INTO v_admin_email
  FROM admin_users
  WHERE id = p_admin_id;

  -- Check if user exists
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  -- Check if user is admin (admins shouldn't have subscriptions)
  IF EXISTS (SELECT 1 FROM admin_users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot create subscription for admin user'
    );
  END IF;

  -- Use existing admin_create_subscription_for_user function
  SELECT admin_create_subscription_for_user(
    p_admin_id,
    p_user_id,
    p_subscription_tier,
    p_duration_days,
    NULL -- no trial days
  ) INTO v_result;

  IF (v_result->>'success')::boolean = false THEN
    RETURN v_result;
  END IF;

  v_subscription_id := (v_result->>'subscription_id')::uuid;

  -- Log admin action
  PERFORM log_admin_action(
    'INSERT',
    'subscriptions',
    v_subscription_id,
    '{}'::jsonb,
    jsonb_build_object(
      'user_id', p_user_id,
      'subscription_tier', p_subscription_tier,
      'duration_days', p_duration_days
    ),
    'Admin ' || COALESCE(v_admin_email, p_admin_id::text) || ' subscribed user to ' || p_subscription_tier || 
    CASE WHEN p_notes IS NOT NULL THEN ' - Notes: ' || p_notes ELSE '' END
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'User subscribed successfully',
    'subscription_id', v_subscription_id,
    'user_id', p_user_id,
    'tier', p_subscription_tier
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION admin_subscribe_user IS 
  'Simplified function for admins to subscribe users. Wraps admin_create_subscription_for_user with audit logging.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_subscribe_user(uuid, text, uuid, integer, text) TO authenticated;

-- =====================================================================
-- Function: admin_unsubscribe_user
-- =====================================================================

CREATE OR REPLACE FUNCTION admin_unsubscribe_user(
  p_user_id uuid,
  p_admin_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_subscription subscriptions%ROWTYPE;
  v_result jsonb;
  v_admin_email text;
BEGIN
  -- Check if user is admin
  IF NOT is_admin_user(p_admin_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin access required'
    );
  END IF;

  -- Get admin email for logging
  SELECT email INTO v_admin_email
  FROM admin_users
  WHERE id = p_admin_id;

  -- Find active subscription for user
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No active subscription found for this user'
    );
  END IF;

  -- Use existing admin_cancel_subscription function
  SELECT admin_cancel_subscription(
    v_subscription.id,
    p_admin_id,
    p_reason
  ) INTO v_result;

  IF (v_result->>'success')::boolean = false THEN
    RETURN v_result;
  END IF;

  -- Log admin action
  PERFORM log_admin_action(
    'UPDATE',
    'subscriptions',
    v_subscription.id,
    jsonb_build_object('status', 'active'),
    jsonb_build_object('status', 'canceled'),
    'Admin ' || COALESCE(v_admin_email, p_admin_id::text) || ' unsubscribed user' ||
    CASE WHEN p_reason IS NOT NULL THEN ' - Reason: ' || p_reason ELSE '' END
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'User unsubscribed successfully',
    'subscription_id', v_subscription.id,
    'user_id', p_user_id,
    'end_date', v_subscription.end_date
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION admin_unsubscribe_user IS 
  'Simplified function for admins to unsubscribe users. Cancels active subscription with audit logging.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_unsubscribe_user(uuid, uuid, text) TO authenticated;

-- =====================================================================
-- Function: admin_reactivate_subscription
-- =====================================================================

CREATE OR REPLACE FUNCTION admin_reactivate_subscription(
  p_subscription_id uuid,
  p_admin_id uuid,
  p_extend_days integer DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_subscription subscriptions%ROWTYPE;
  v_new_end_date timestamptz;
  v_admin_email text;
BEGIN
  -- Check if user is admin
  IF NOT is_admin_user(p_admin_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin access required'
    );
  END IF;

  -- Get admin email for logging
  SELECT email INTO v_admin_email
  FROM admin_users
  WHERE id = p_admin_id;

  -- Get subscription
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE id = p_subscription_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription not found'
    );
  END IF;

  -- Check if already active
  IF v_subscription.status = 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription is already active'
    );
  END IF;

  -- Calculate new end date
  IF p_extend_days IS NOT NULL AND p_extend_days > 0 THEN
    -- Extend from now
    v_new_end_date := now() + (p_extend_days || ' days')::interval;
  ELSIF v_subscription.end_date < now() THEN
    -- If expired, extend 30 days from now
    v_new_end_date := now() + interval '30 days';
  ELSE
    -- Use existing end_date if still in future
    v_new_end_date := v_subscription.end_date;
  END IF;

  -- Reactivate subscription
  UPDATE subscriptions
  SET 
    status = 'active',
    end_date = v_new_end_date,
    canceled_at = NULL,
    auto_renew = false,
    updated_at = now(),
    billing_cycle_start = now(),
    billing_cycle_end = v_new_end_date
  WHERE id = p_subscription_id;

  -- Re-initialize credits if needed
  PERFORM initialize_subscription_credits(v_subscription.user_id, v_subscription.subscription_tier);

  -- Notify user
  INSERT INTO notifications (user_id, notification_type, message, created_at)
  VALUES (
    v_subscription.user_id,
    'subscription_reactivated',
    'Your subscription has been reactivated by an administrator. New end date: ' || 
    to_char(v_new_end_date, 'YYYY-MM-DD'),
    now()
  )
  ON CONFLICT DO NOTHING; -- Ignore if notifications table doesn't exist or has conflicts

  -- Log admin action
  PERFORM log_admin_action(
    'UPDATE',
    'subscriptions',
    p_subscription_id,
    jsonb_build_object('status', v_subscription.status),
    jsonb_build_object('status', 'active', 'end_date', v_new_end_date),
    'Admin ' || COALESCE(v_admin_email, p_admin_id::text) || ' reactivated subscription'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Subscription reactivated successfully',
    'subscription_id', p_subscription_id,
    'user_id', v_subscription.user_id,
    'new_end_date', v_new_end_date
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION admin_reactivate_subscription IS 
  'Allows admins to reactivate canceled or expired subscriptions with optional extension.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_reactivate_subscription(uuid, uuid, integer) TO authenticated;

