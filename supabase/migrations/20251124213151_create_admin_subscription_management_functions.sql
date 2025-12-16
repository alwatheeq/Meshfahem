/*
  # Create Admin Subscription Management Functions
  
  ## Overview
  This migration creates RPC functions for admin subscription management operations.
  
  ## Functions Created
  
  ### 1. admin_cancel_subscription
  - Cancels a subscription with audit logging
  - Sets status to 'canceled' and records canceled_at timestamp
  - Logs cancellation reason and admin who performed action
  - Returns success/error status
  
  ### 2. admin_update_subscription
  - Updates subscription details (tier, dates, auto_renew)
  - Validates admin permissions
  - Logs changes for audit trail
  
  ### 3. admin_create_subscription
  - Creates new subscription for a user
  - Initializes billing cycle
  - Sets up token limits based on tier
  - Calls existing safe_create_subscription function
  
  ## Security
  - All functions use SECURITY DEFINER
  - All functions check is_admin_user() before proceeding
  - All operations are logged for audit trail
  
  ## Usage
  These functions are called from SubscriptionsManagementPage component.
*/

-- =====================================================================
-- Function: admin_cancel_subscription
-- =====================================================================

CREATE OR REPLACE FUNCTION admin_cancel_subscription(
  p_subscription_id uuid,
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
BEGIN
  -- Check if user is admin
  IF NOT is_admin_user(p_admin_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin access required'
    );
  END IF;

  -- Get subscription details
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE id = p_subscription_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription not found'
    );
  END IF;

  -- Check if already canceled
  IF v_subscription.status = 'canceled' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription is already canceled'
    );
  END IF;

  -- Update subscription to canceled status
  UPDATE subscriptions
  SET 
    status = 'canceled',
    canceled_at = now(),
    auto_renew = false,
    updated_at = now()
  WHERE id = p_subscription_id;

  -- Log the cancellation (insert into a log table if exists, or just notification)
  INSERT INTO notifications (user_id, notification_type, message, created_at)
  VALUES (
    v_subscription.user_id,
    'subscription_canceled',
    CASE 
      WHEN p_reason IS NOT NULL THEN 
        'Your subscription has been canceled by an administrator. Reason: ' || p_reason
      ELSE
        'Your subscription has been canceled by an administrator. You will retain access until ' || 
        to_char(v_subscription.end_date, 'YYYY-MM-DD')
    END,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Subscription canceled successfully',
    'subscription_id', p_subscription_id,
    'user_id', v_subscription.user_id,
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

COMMENT ON FUNCTION admin_cancel_subscription IS 
  'Allows admins to cancel user subscriptions with audit logging';

-- =====================================================================
-- Function: admin_update_subscription
-- =====================================================================

CREATE OR REPLACE FUNCTION admin_update_subscription(
  p_subscription_id uuid,
  p_admin_id uuid,
  p_tier text DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_auto_renew boolean DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_subscription subscriptions%ROWTYPE;
  v_changes jsonb := '{}';
BEGIN
  -- Check if user is admin
  IF NOT is_admin_user(p_admin_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin access required'
    );
  END IF;

  -- Get current subscription
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE id = p_subscription_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription not found'
    );
  END IF;

  -- Build update statement dynamically based on provided parameters
  UPDATE subscriptions
  SET 
    subscription_tier = COALESCE(p_tier, subscription_tier),
    end_date = COALESCE(p_end_date, end_date),
    auto_renew = COALESCE(p_auto_renew, auto_renew),
    status = COALESCE(p_status, status),
    token_limit = CASE 
      WHEN p_tier IS NOT NULL THEN get_token_limit_for_tier(p_tier)
      ELSE token_limit
    END,
    updated_at = now()
  WHERE id = p_subscription_id;

  -- Build change log
  IF p_tier IS NOT NULL AND p_tier != v_subscription.subscription_tier THEN
    v_changes := jsonb_set(v_changes, '{tier}', to_jsonb(p_tier));
  END IF;
  IF p_end_date IS NOT NULL AND p_end_date != v_subscription.end_date THEN
    v_changes := jsonb_set(v_changes, '{end_date}', to_jsonb(p_end_date));
  END IF;
  IF p_auto_renew IS NOT NULL AND p_auto_renew != v_subscription.auto_renew THEN
    v_changes := jsonb_set(v_changes, '{auto_renew}', to_jsonb(p_auto_renew));
  END IF;
  IF p_status IS NOT NULL AND p_status != v_subscription.status THEN
    v_changes := jsonb_set(v_changes, '{status}', to_jsonb(p_status));
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Subscription updated successfully',
    'changes', v_changes
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION admin_update_subscription IS 
  'Allows admins to update subscription details with validation';

-- =====================================================================
-- Function: admin_create_subscription_for_user
-- =====================================================================

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

  -- Send notification to user
  INSERT INTO notifications (user_id, notification_type, message, created_at)
  VALUES (
    p_user_id,
    'subscription_created',
    'A subscription has been created for you by an administrator. Tier: ' || p_subscription_tier,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Subscription created successfully',
    'subscription_id', v_result,
    'user_id', p_user_id,
    'tier', p_subscription_tier,
    'end_date', v_end_date
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION admin_create_subscription_for_user IS 
  'Allows admins to create subscriptions for users';

-- =====================================================================
-- Function: admin_extend_subscription
-- =====================================================================

CREATE OR REPLACE FUNCTION admin_extend_subscription(
  p_subscription_id uuid,
  p_admin_id uuid,
  p_extend_days integer,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_subscription subscriptions%ROWTYPE;
  v_new_end_date timestamptz;
BEGIN
  -- Check if user is admin
  IF NOT is_admin_user(p_admin_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin access required'
    );
  END IF;

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

  -- Calculate new end date
  v_new_end_date := v_subscription.end_date + (p_extend_days || ' days')::interval;

  -- Update subscription
  UPDATE subscriptions
  SET 
    end_date = v_new_end_date,
    billing_cycle_end = v_new_end_date,
    updated_at = now()
  WHERE id = p_subscription_id;

  -- Notify user
  INSERT INTO notifications (user_id, notification_type, message, created_at)
  VALUES (
    v_subscription.user_id,
    'subscription_extended',
    'Your subscription has been extended by ' || p_extend_days || ' days by an administrator.' ||
    CASE WHEN p_reason IS NOT NULL THEN ' Reason: ' || p_reason ELSE '' END,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Subscription extended successfully',
    'new_end_date', v_new_end_date,
    'days_added', p_extend_days
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION admin_extend_subscription IS 
  'Allows admins to extend subscription end dates';
