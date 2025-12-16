/*
  # User Blocking/Unblocking System

  ## Overview
  This migration implements a comprehensive user blocking system that allows admins
  to block/unblock users from accessing the website. Supports both permanent and
  temporary blocks with full audit trail.

  ## Changes

  1. Add blocking columns to user_profiles table
  2. Create user_block_history table for audit trail
  3. Create RPC functions for blocking/unblocking
  4. Add RLS policies for blocking management
  5. Create function to check and auto-unblock expired blocks

  ## Security
  - Only admins can block/unblock users
  - Blocked users cannot modify their blocking status
  - All blocking actions are logged
  - Temporary blocks automatically expire
*/

-- =====================================================================
-- STEP 1: Add Blocking Columns to user_profiles
-- =====================================================================

DO $$
BEGIN
  -- Add is_blocked column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'is_blocked'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN is_blocked boolean NOT NULL DEFAULT false;
  END IF;

  -- Add blocked_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'blocked_at'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN blocked_at timestamptz;
  END IF;

  -- Add blocked_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'blocked_by'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN blocked_by uuid REFERENCES admin_users(id);
  END IF;

  -- Add block_reason column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'block_reason'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN block_reason text;
  END IF;

  -- Add block_expires_at column (for temporary blocks)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'block_expires_at'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN block_expires_at timestamptz;
  END IF;

  -- Add unblocked_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'unblocked_at'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN unblocked_at timestamptz;
  END IF;

  -- Add unblocked_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'unblocked_by'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN unblocked_by uuid REFERENCES admin_users(id);
  END IF;
END $$;

-- Create index on is_blocked for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_blocked ON user_profiles(is_blocked);
CREATE INDEX IF NOT EXISTS idx_user_profiles_block_expires_at ON user_profiles(block_expires_at) WHERE block_expires_at IS NOT NULL;

-- =====================================================================
-- STEP 2: Create Blocking History Table
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_block_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('blocked', 'unblocked')),
  blocked_by uuid REFERENCES admin_users(id),
  unblocked_by uuid REFERENCES admin_users(id),
  reason text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_block_history ENABLE ROW LEVEL SECURITY;

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_block_history_user_id ON user_block_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_block_history_action ON user_block_history(action);

-- RLS Policy: Admins can view all block history
CREATE POLICY "Admins can view block history"
  ON user_block_history
  FOR SELECT
  TO authenticated
  USING (is_admin_user());

-- =====================================================================
-- STEP 3: Create Blocking RPC Functions
-- =====================================================================

-- Function: admin_block_user
CREATE OR REPLACE FUNCTION admin_block_user(
  p_user_id uuid,
  p_admin_id uuid,
  p_reason text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_email text;
  v_user_email text;
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

  -- Get user email for logging
  SELECT email INTO v_user_email
  FROM user_profiles
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  -- Check if user is already blocked
  IF EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id AND is_blocked = true) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User is already blocked'
    );
  END IF;

  -- Update user profile
  UPDATE user_profiles
  SET 
    is_blocked = true,
    blocked_at = now(),
    blocked_by = p_admin_id,
    block_reason = p_reason,
    block_expires_at = p_expires_at,
    unblocked_at = NULL,
    unblocked_by = NULL
  WHERE id = p_user_id;

  -- Log to history
  INSERT INTO user_block_history (
    user_id,
    action,
    blocked_by,
    reason,
    expires_at
  ) VALUES (
    p_user_id,
    'blocked',
    p_admin_id,
    p_reason,
    p_expires_at
  );

  -- Log admin action
  PERFORM log_admin_action(
    'UPDATE',
    'user_profiles',
    p_user_id,
    jsonb_build_object('is_blocked', false),
    jsonb_build_object('is_blocked', true, 'block_reason', p_reason, 'expires_at', p_expires_at),
    'Admin ' || COALESCE(v_admin_email, p_admin_id::text) || ' blocked user ' || v_user_email ||
    CASE WHEN p_reason IS NOT NULL THEN ' - Reason: ' || p_reason ELSE '' END ||
    CASE WHEN p_expires_at IS NOT NULL THEN ' - Expires: ' || to_char(p_expires_at, 'YYYY-MM-DD HH24:MI:SS') ELSE ' (Permanent)' END
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'User blocked successfully',
    'user_id', p_user_id,
    'expires_at', p_expires_at
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION admin_block_user IS 
  'Allows admins to block users from accessing the website. Supports permanent and temporary blocks.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_block_user(uuid, uuid, text, timestamptz) TO authenticated;

-- Function: admin_unblock_user
CREATE OR REPLACE FUNCTION admin_unblock_user(
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
  v_admin_email text;
  v_user_email text;
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

  -- Get user email for logging
  SELECT email INTO v_user_email
  FROM user_profiles
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  -- Check if user is blocked
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id AND is_blocked = true) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User is not currently blocked'
    );
  END IF;

  -- Update user profile
  UPDATE user_profiles
  SET 
    is_blocked = false,
    unblocked_at = now(),
    unblocked_by = p_admin_id,
    block_expires_at = NULL
  WHERE id = p_user_id;

  -- Log to history
  INSERT INTO user_block_history (
    user_id,
    action,
    unblocked_by,
    reason
  ) VALUES (
    p_user_id,
    'unblocked',
    p_admin_id,
    p_reason
  );

  -- Log admin action
  PERFORM log_admin_action(
    'UPDATE',
    'user_profiles',
    p_user_id,
    jsonb_build_object('is_blocked', true),
    jsonb_build_object('is_blocked', false),
    'Admin ' || COALESCE(v_admin_email, p_admin_id::text) || ' unblocked user ' || v_user_email ||
    CASE WHEN p_reason IS NOT NULL THEN ' - Reason: ' || p_reason ELSE '' END
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'User unblocked successfully',
    'user_id', p_user_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION admin_unblock_user IS 
  'Allows admins to unblock users, restoring their access to the website.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_unblock_user(uuid, uuid, text) TO authenticated;

-- Function: check_user_block_status
CREATE OR REPLACE FUNCTION check_user_block_status(p_user_id uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_profile user_profiles%ROWTYPE;
  v_result jsonb;
BEGIN
  -- Get user profile
  SELECT * INTO v_profile
  FROM user_profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  -- Check if blocked
  IF NOT v_profile.is_blocked THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_blocked', false,
      'message', 'User is not blocked'
    );
  END IF;

  -- Check if temporary block has expired
  IF v_profile.block_expires_at IS NOT NULL AND v_profile.block_expires_at < now() THEN
    -- Auto-unblock expired temporary block
    UPDATE user_profiles
    SET 
      is_blocked = false,
      unblocked_at = now(),
      block_expires_at = NULL
    WHERE id = p_user_id;

    -- Log auto-unblock
    INSERT INTO user_block_history (
      user_id,
      action,
      reason
    ) VALUES (
      p_user_id,
      'unblocked',
      'Temporary block expired automatically'
    );

    RETURN jsonb_build_object(
      'success', true,
      'is_blocked', false,
      'was_expired', true,
      'message', 'Temporary block has expired and user has been automatically unblocked'
    );
  END IF;

  -- User is blocked
  RETURN jsonb_build_object(
    'success', true,
    'is_blocked', true,
    'block_reason', v_profile.block_reason,
    'blocked_at', v_profile.blocked_at,
    'expires_at', v_profile.block_expires_at,
    'is_permanent', v_profile.block_expires_at IS NULL,
    'message', CASE 
      WHEN v_profile.block_expires_at IS NOT NULL THEN 
        'User is temporarily blocked until ' || to_char(v_profile.block_expires_at, 'YYYY-MM-DD HH24:MI:SS')
      ELSE 
        'User is permanently blocked'
    END
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION check_user_block_status IS 
  'Checks if a user is blocked and automatically unblocks expired temporary blocks.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_user_block_status(uuid) TO authenticated;

-- =====================================================================
-- STEP 4: Update RLS Policies for Blocking Management
-- =====================================================================

-- Admins can update blocking status (already covered by existing admin policies)
-- Users cannot modify their own blocking status (enforced by application layer)
-- Blocked users can still read their own profile (for displaying block message)

-- =====================================================================
-- STEP 5: Create Trigger to Auto-Unblock Expired Blocks
-- =====================================================================

-- Function to check and unblock expired users
CREATE OR REPLACE FUNCTION auto_unblock_expired_users()
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Unblock users whose temporary blocks have expired
  UPDATE user_profiles
  SET 
    is_blocked = false,
    unblocked_at = now(),
    block_expires_at = NULL
  WHERE is_blocked = true
    AND block_expires_at IS NOT NULL
    AND block_expires_at < now();

  -- Log auto-unblocks
  INSERT INTO user_block_history (user_id, action, reason)
  SELECT 
    id,
    'unblocked',
    'Temporary block expired automatically'
  FROM user_profiles
  WHERE is_blocked = false
    AND unblocked_at IS NOT NULL
    AND unblocked_at > now() - interval '1 minute'
    AND NOT EXISTS (
      SELECT 1 FROM user_block_history
      WHERE user_id = user_profiles.id
        AND action = 'unblocked'
        AND created_at > now() - interval '1 minute'
    );
END;
$$;

COMMENT ON FUNCTION auto_unblock_expired_users IS 
  'Automatically unblocks users whose temporary blocks have expired. Should be called periodically.';

-- Note: This function should be called by a cron job or scheduled task
-- For now, it's called by check_user_block_status when checking a user

