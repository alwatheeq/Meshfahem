/*
  # Implement Credit System with Low Credit Warnings

  ## Overview
  This migration implements a complete credit-based system where 1 credit = 1,000 tokens.
  Users receive 2,700 credits per 30-day billing cycle.
  
  ## Key Features
  1. Credit tracking columns in user_profiles
  2. Audit log table for all credit operations
  3. Low credit warnings at 1000, 500, and 250 credits
  4. Atomic credit deduction functions
  5. Monthly credit reset functionality
  6. Free credit claim system (300 credits)
  
  ## Security
  - RLS policies prevent direct credit manipulation
  - Only database functions can modify credits
  - Row-level locking prevents race conditions
  - Admin-only access to audit logs
  
  ## Changes
  1. Add credit columns to user_profiles
     - credits_remaining, credits_total, cycle dates
     - Warning flags: notified_at_1000, notified_at_500, notified_at_250
  2. Create credit_operations audit table
  3. Create functions: check_sufficient_credits, deduct_credits_atomic, 
     refund_credits, claim_free_credits, reset_monthly_credits, get_user_credit_balance
  4. Initialize credits for existing subscribed users
*/

-- =====================================================================
-- STEP 1: Add credit tracking columns to user_profiles
-- =====================================================================

DO $$
BEGIN
  -- Add credits_remaining column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'credits_remaining'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN credits_remaining integer NOT NULL DEFAULT 0;
    COMMENT ON COLUMN user_profiles.credits_remaining IS 'Current credit balance (1 credit = 1,000 tokens)';
  END IF;

  -- Add credits_total column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'credits_total'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN credits_total integer NOT NULL DEFAULT 2700;
    COMMENT ON COLUMN user_profiles.credits_total IS 'Total credits allocated per billing cycle';
  END IF;

  -- Add credits_cycle_start column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'credits_cycle_start'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN credits_cycle_start timestamptz;
    COMMENT ON COLUMN user_profiles.credits_cycle_start IS 'Start of current credit billing cycle';
  END IF;

  -- Add credits_cycle_end column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'credits_cycle_end'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN credits_cycle_end timestamptz;
    COMMENT ON COLUMN user_profiles.credits_cycle_end IS 'End of current credit billing cycle';
  END IF;

  -- Add free_credits_claimed column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'free_credits_claimed'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN free_credits_claimed boolean NOT NULL DEFAULT false;
    COMMENT ON COLUMN user_profiles.free_credits_claimed IS 'Has user claimed their one-time 300 free credits';
  END IF;

  -- Add warning notification flags
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'notified_at_1000'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN notified_at_1000 boolean NOT NULL DEFAULT false;
    COMMENT ON COLUMN user_profiles.notified_at_1000 IS 'Has user been notified when credits dropped below 1000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'notified_at_500'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN notified_at_500 boolean NOT NULL DEFAULT false;
    COMMENT ON COLUMN user_profiles.notified_at_500 IS 'Has user been notified when credits dropped below 500';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'notified_at_250'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN notified_at_250 boolean NOT NULL DEFAULT false;
    COMMENT ON COLUMN user_profiles.notified_at_250 IS 'Has user been notified when credits dropped below 250';
  END IF;
END $$;

-- =====================================================================
-- STEP 2: Create credit_operations audit table
-- =====================================================================

CREATE TABLE IF NOT EXISTS credit_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_type text NOT NULL CHECK (operation_type IN ('deduction', 'refund', 'reset', 'claim_free', 'admin_adjustment')),
  tokens_used integer NOT NULL,
  credits_deducted integer NOT NULL,
  credits_before integer NOT NULL,
  credits_after integer NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded', 'failed')),
  refunded_at timestamptz,
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_credit_operations_user_id ON credit_operations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_operations_status ON credit_operations(status) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_credit_operations_created_at ON credit_operations(created_at DESC);

-- Enable RLS
ALTER TABLE credit_operations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can view all credit operations" ON credit_operations;
DROP POLICY IF EXISTS "System can insert credit operations" ON credit_operations;

-- RLS Policy: Only admins can view credit operations
CREATE POLICY "Admins can view all credit operations"
  ON credit_operations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND user_role = 'admin'
    )
  );

-- RLS Policy: System can insert credit operations
CREATE POLICY "System can insert credit operations"
  ON credit_operations FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMENT ON TABLE credit_operations IS 'Audit log for all credit operations (admin only access)';

-- =====================================================================
-- STEP 3: Create indexes for credit columns
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_credits_remaining
  ON user_profiles(credits_remaining)
  WHERE credits_remaining < 1000;

CREATE INDEX IF NOT EXISTS idx_user_profiles_credit_cycle
  ON user_profiles(credits_cycle_end)
  WHERE credits_cycle_end IS NOT NULL;

-- =====================================================================
-- STEP 4: Function to check sufficient credits
-- =====================================================================

CREATE OR REPLACE FUNCTION check_sufficient_credits(
  p_user_id uuid,
  p_estimated_credits integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credits_remaining integer;
  v_cycle_end timestamptz;
BEGIN
  -- Get current credit balance with row lock
  SELECT credits_remaining, credits_cycle_end
  INTO v_credits_remaining, v_cycle_end
  FROM user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- Return status
  RETURN jsonb_build_object(
    'sufficient', v_credits_remaining >= p_estimated_credits,
    'credits_remaining', v_credits_remaining,
    'cycle_end', v_cycle_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_sufficient_credits(uuid, integer) TO authenticated;

COMMENT ON FUNCTION check_sufficient_credits IS 'Check if user has sufficient credits before operation';

-- =====================================================================
-- STEP 5: Function to deduct credits atomically with warnings
-- =====================================================================

CREATE OR REPLACE FUNCTION deduct_credits_atomic(
  p_user_id uuid,
  p_tokens_used integer,
  p_operation_type text DEFAULT 'deduction'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credits_to_deduct integer;
  v_credits_before integer;
  v_credits_after integer;
  v_credits_total integer;
  v_notify_1000 boolean := false;
  v_notify_500 boolean := false;
  v_notify_250 boolean := false;
  v_was_notified_1000 boolean;
  v_was_notified_500 boolean;
  v_was_notified_250 boolean;
  v_cycle_end timestamptz;
BEGIN
  -- Calculate credits to deduct (round up: tokens / 1000)
  v_credits_to_deduct := CEIL(p_tokens_used::numeric / 1000);

  -- Get current state with row lock
  SELECT
    credits_remaining,
    credits_total,
    notified_at_1000,
    notified_at_500,
    notified_at_250,
    credits_cycle_end
  INTO
    v_credits_before,
    v_credits_total,
    v_was_notified_1000,
    v_was_notified_500,
    v_was_notified_250,
    v_cycle_end
  FROM user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- Check if user has enough credits
  IF v_credits_before < v_credits_to_deduct THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_credits',
      'credits_remaining', v_credits_before,
      'credits_needed', v_credits_to_deduct,
      'cycle_end', v_cycle_end
    );
  END IF;

  -- Deduct credits
  v_credits_after := v_credits_before - v_credits_to_deduct;

  UPDATE user_profiles
  SET credits_remaining = v_credits_after
  WHERE id = p_user_id;

  -- Check warning thresholds
  -- 1000 credits threshold
  IF v_credits_after <= 1000 AND v_credits_before > 1000 AND NOT v_was_notified_1000 THEN
    v_notify_1000 := true;
    UPDATE user_profiles
    SET notified_at_1000 = true
    WHERE id = p_user_id;
  END IF;

  -- 500 credits threshold
  IF v_credits_after <= 500 AND v_credits_before > 500 AND NOT v_was_notified_500 THEN
    v_notify_500 := true;
    UPDATE user_profiles
    SET notified_at_500 = true
    WHERE id = p_user_id;
  END IF;

  -- 250 credits threshold
  IF v_credits_after <= 250 AND v_credits_before > 250 AND NOT v_was_notified_250 THEN
    v_notify_250 := true;
    UPDATE user_profiles
    SET notified_at_250 = true
    WHERE id = p_user_id;
  END IF;

  -- Log the operation
  INSERT INTO credit_operations (
    user_id,
    operation_type,
    tokens_used,
    credits_deducted,
    credits_before,
    credits_after,
    status
  ) VALUES (
    p_user_id,
    p_operation_type,
    p_tokens_used,
    v_credits_to_deduct,
    v_credits_before,
    v_credits_after,
    'completed'
  );

  -- Return success with notification flags
  RETURN jsonb_build_object(
    'success', true,
    'credits_deducted', v_credits_to_deduct,
    'credits_remaining', v_credits_after,
    'credits_total', v_credits_total,
    'notify_1000', v_notify_1000,
    'notify_500', v_notify_500,
    'notify_250', v_notify_250,
    'cycle_end', v_cycle_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION deduct_credits_atomic(uuid, integer, text) TO authenticated;

COMMENT ON FUNCTION deduct_credits_atomic IS 'Atomically deduct credits based on token usage and check warning thresholds (1000, 500, 250)';

-- =====================================================================
-- STEP 6: Function to refund credits
-- =====================================================================

CREATE OR REPLACE FUNCTION refund_credits(
  p_operation_id uuid,
  p_reason text DEFAULT 'API failure'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_operation record;
  v_new_balance integer;
BEGIN
  -- Get the operation details
  SELECT *
  INTO v_operation
  FROM credit_operations
  WHERE id = p_operation_id
    AND status = 'completed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Operation not found or already refunded'
    );
  END IF;

  -- Refund the credits
  UPDATE user_profiles
  SET credits_remaining = credits_remaining + v_operation.credits_deducted
  WHERE id = v_operation.user_id
  RETURNING credits_remaining INTO v_new_balance;

  -- Mark operation as refunded
  UPDATE credit_operations
  SET
    status = 'refunded',
    refunded_at = now(),
    error_message = p_reason
  WHERE id = p_operation_id;

  -- Log the refund
  INSERT INTO credit_operations (
    user_id,
    operation_type,
    tokens_used,
    credits_deducted,
    credits_before,
    credits_after,
    status,
    metadata
  ) VALUES (
    v_operation.user_id,
    'refund',
    v_operation.tokens_used,
    v_operation.credits_deducted,
    v_new_balance - v_operation.credits_deducted,
    v_new_balance,
    'completed',
    jsonb_build_object('original_operation_id', p_operation_id, 'reason', p_reason)
  );

  RETURN jsonb_build_object(
    'success', true,
    'credits_refunded', v_operation.credits_deducted,
    'new_balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION refund_credits(uuid, text) TO authenticated;

COMMENT ON FUNCTION refund_credits IS 'Refund credits if an operation fails';

-- =====================================================================
-- STEP 7: Function to claim free credits
-- =====================================================================

CREATE OR REPLACE FUNCTION claim_free_credits(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_already_claimed boolean;
  v_new_balance integer;
BEGIN
  -- Check if already claimed
  SELECT free_credits_claimed
  INTO v_already_claimed
  FROM user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_already_claimed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Free credits already claimed'
    );
  END IF;

  -- Add 300 credits and mark as claimed
  UPDATE user_profiles
  SET
    credits_remaining = credits_remaining + 300,
    free_credits_claimed = true
  WHERE id = p_user_id
  RETURNING credits_remaining INTO v_new_balance;

  -- Log the operation
  INSERT INTO credit_operations (
    user_id,
    operation_type,
    tokens_used,
    credits_deducted,
    credits_before,
    credits_after,
    status
  ) VALUES (
    p_user_id,
    'claim_free',
    0,
    -300,
    v_new_balance - 300,
    v_new_balance,
    'completed'
  );

  RETURN jsonb_build_object(
    'success', true,
    'credits_added', 300,
    'new_balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION claim_free_credits(uuid) TO authenticated;

COMMENT ON FUNCTION claim_free_credits IS 'One-time claim of 300 free credits';

-- =====================================================================
-- STEP 8: Function to reset monthly credits
-- =====================================================================

CREATE OR REPLACE FUNCTION reset_monthly_credits()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user record;
  v_reset_count integer := 0;
BEGIN
  -- Find users whose cycle has ended
  FOR v_user IN
    SELECT id, credits_total, credits_remaining, credits_cycle_end
    FROM user_profiles
    WHERE credits_cycle_end IS NOT NULL
      AND credits_cycle_end <= now()
      AND credits_total > 0
  LOOP
    -- Reset credits to total
    UPDATE user_profiles
    SET
      credits_remaining = credits_total,
      credits_cycle_start = now(),
      credits_cycle_end = now() + interval '30 days',
      notified_at_1000 = false,
      notified_at_500 = false,
      notified_at_250 = false
    WHERE id = v_user.id;

    -- Log the reset
    INSERT INTO credit_operations (
      user_id,
      operation_type,
      tokens_used,
      credits_deducted,
      credits_before,
      credits_after,
      status
    ) VALUES (
      v_user.id,
      'reset',
      0,
      0,
      v_user.credits_remaining,
      v_user.credits_total,
      'completed'
    );

    -- Create notification for user
    INSERT INTO notifications (
      user_id,
      notification_type,
      message,
      is_read
    ) VALUES (
      v_user.id,
      'subscription_renewed',
      'Your monthly credits have been refreshed! You now have ' || v_user.credits_total || ' credits.',
      false
    );

    v_reset_count := v_reset_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'users_reset', v_reset_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION reset_monthly_credits() TO authenticated;

COMMENT ON FUNCTION reset_monthly_credits IS 'Reset credits for users whose billing cycle has ended (called by cron job)';

-- =====================================================================
-- STEP 9: Function to get user credit balance
-- =====================================================================

CREATE OR REPLACE FUNCTION get_user_credit_balance(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance record;
BEGIN
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

  RETURN jsonb_build_object(
    'success', true,
    'credits_remaining', v_balance.credits_remaining,
    'credits_total', v_balance.credits_total,
    'cycle_start', v_balance.credits_cycle_start,
    'cycle_end', v_balance.credits_cycle_end,
    'free_credits_claimed', v_balance.free_credits_claimed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_credit_balance(uuid) TO authenticated;

COMMENT ON FUNCTION get_user_credit_balance IS 'Get current credit balance for a user (frontend display)';

-- =====================================================================
-- STEP 10: Initialize credits for existing users with active subscriptions
-- =====================================================================

DO $$
DECLARE
  v_user record;
  v_subscription record;
BEGIN
  -- Initialize credits for users with active subscriptions
  FOR v_user IN
    SELECT DISTINCT up.id, up.credits_remaining
    FROM user_profiles up
    INNER JOIN subscriptions s ON s.user_id = up.id
    WHERE s.status = 'active'
      AND s.end_date > now()
      AND up.credits_remaining = 0
  LOOP
    -- Find their active subscription
    SELECT *
    INTO v_subscription
    FROM subscriptions
    WHERE user_id = v_user.id
      AND status = 'active'
      AND end_date > now()
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      -- Initialize credits based on subscription
      UPDATE user_profiles
      SET
        credits_remaining = 2700,
        credits_total = 2700,
        credits_cycle_start = COALESCE(v_subscription.billing_cycle_start, v_subscription.start_date, now()),
        credits_cycle_end = COALESCE(v_subscription.billing_cycle_end, now() + interval '30 days')
      WHERE id = v_user.id;

      RAISE NOTICE 'Initialized credits for user: %', v_user.id;
    END IF;
  END LOOP;
END $$;
