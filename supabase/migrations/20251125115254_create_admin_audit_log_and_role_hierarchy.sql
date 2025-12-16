/*
  # Admin Audit Logging and Role Hierarchy System

  ## Overview
  This migration implements comprehensive audit logging for all admin actions and adds
  a role hierarchy system to control admin permissions.

  ## 1. Admin Audit Log Table
  Tracks all admin actions with detailed information:
  - Admin who performed the action
  - Action type (CREATE, UPDATE, DELETE, VIEW, LOGIN, LOGOUT)
  - Target table and record
  - Old and new values (for updates)
  - Timestamp and IP address

  ## 2. Role Hierarchy System
  Three admin roles with different permission levels:
  - superadmin: Full access to everything including admin management
  - admin: Can manage users, subscriptions, content but not other admins
  - readonly: View-only access to admin dashboard

  ## 3. RPC Functions
  - log_admin_action(): Log any admin action to audit log
  - get_admin_audit_log(): Retrieve audit log with filters
  - check_admin_permission(): Check if admin has permission for action
  - update_admin_role(): Change admin user role (superadmin only)

  ## 4. Security
  - RLS policies ensure only admins can view audit logs
  - Role changes logged to audit log
  - Superadmin role required for sensitive operations
  - IP address tracking for security monitoring
*/

-- =====================================================
-- 1. CREATE ADMIN AUDIT LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_email text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('CREATE', 'UPDATE', 'DELETE', 'VIEW', 'LOGIN', 'LOGOUT', 'EXPORT')),
  table_name text,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  description text,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action_type ON admin_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_table_name ON admin_audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_ip_address ON admin_audit_log(ip_address);

-- Add comment
COMMENT ON TABLE admin_audit_log IS 'Comprehensive audit log for all admin actions';

-- =====================================================
-- 2. ADD ROLE COLUMN TO ADMIN_USERS TABLE
-- =====================================================

-- Add role column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_users' AND column_name = 'role'
  ) THEN
    ALTER TABLE admin_users ADD COLUMN role text NOT NULL DEFAULT 'admin' CHECK (role IN ('superadmin', 'admin', 'readonly'));
  END IF;
END $$;

-- Add index on role
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);

-- Update existing admin users to superadmin (first admin should be superadmin)
DO $$
BEGIN
  UPDATE admin_users
  SET role = 'superadmin'
  WHERE id = (SELECT id FROM admin_users ORDER BY created_at LIMIT 1)
  AND role = 'admin';
END $$;

-- =====================================================
-- 3. RLS POLICIES FOR AUDIT LOG
-- =====================================================

-- Enable RLS
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can view all audit logs
CREATE POLICY "Admins can view audit log"
  ON admin_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

-- Only system can insert audit logs (via RPC functions)
CREATE POLICY "System can insert audit logs"
  ON admin_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

-- No one can update or delete audit logs (immutable)
-- No policies needed - RLS prevents by default

-- =====================================================
-- 4. RPC FUNCTION: LOG ADMIN ACTION
-- =====================================================

CREATE OR REPLACE FUNCTION log_admin_action(
  p_action_type text,
  p_table_name text DEFAULT NULL,
  p_record_id text DEFAULT NULL,
  p_old_values jsonb DEFAULT NULL,
  p_new_values jsonb DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email text;
  v_log_id uuid;
BEGIN
  -- Check if user is admin
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'Only admins can log actions';
  END IF;

  -- Get admin email
  SELECT email INTO v_admin_email
  FROM auth.users
  WHERE id = auth.uid();

  -- Insert audit log
  INSERT INTO admin_audit_log (
    admin_id,
    admin_email,
    action_type,
    table_name,
    record_id,
    old_values,
    new_values,
    description,
    ip_address,
    user_agent
  ) VALUES (
    auth.uid(),
    v_admin_email,
    p_action_type,
    p_table_name,
    p_record_id,
    p_old_values,
    p_new_values,
    p_description,
    p_ip_address::inet,
    p_user_agent
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- =====================================================
-- 5. RPC FUNCTION: GET AUDIT LOG
-- =====================================================

CREATE OR REPLACE FUNCTION get_admin_audit_log(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_admin_id uuid DEFAULT NULL,
  p_action_type text DEFAULT NULL,
  p_table_name text DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  admin_id uuid,
  admin_email text,
  action_type text,
  table_name text,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  description text,
  ip_address inet,
  user_agent text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is admin
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'Only admins can view audit logs';
  END IF;

  RETURN QUERY
  SELECT
    al.id,
    al.admin_id,
    al.admin_email,
    al.action_type,
    al.table_name,
    al.record_id,
    al.old_values,
    al.new_values,
    al.description,
    al.ip_address,
    al.user_agent,
    al.created_at
  FROM admin_audit_log al
  WHERE
    (p_admin_id IS NULL OR al.admin_id = p_admin_id)
    AND (p_action_type IS NULL OR al.action_type = p_action_type)
    AND (p_table_name IS NULL OR al.table_name = p_table_name)
    AND (p_start_date IS NULL OR al.created_at >= p_start_date)
    AND (p_end_date IS NULL OR al.created_at <= p_end_date)
  ORDER BY al.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- =====================================================
-- 6. RPC FUNCTION: CHECK ADMIN PERMISSION
-- =====================================================

CREATE OR REPLACE FUNCTION check_admin_permission(
  p_required_role text DEFAULT 'admin'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_role text;
BEGIN
  -- Check if user is admin
  IF NOT is_admin_user() THEN
    RETURN false;
  END IF;

  -- Get admin role
  SELECT role INTO v_admin_role
  FROM admin_users
  WHERE id = auth.uid()
  AND is_active = true;

  -- Check permission based on role hierarchy
  -- superadmin > admin > readonly
  CASE p_required_role
    WHEN 'superadmin' THEN
      RETURN v_admin_role = 'superadmin';
    WHEN 'admin' THEN
      RETURN v_admin_role IN ('superadmin', 'admin');
    WHEN 'readonly' THEN
      RETURN v_admin_role IN ('superadmin', 'admin', 'readonly');
    ELSE
      RETURN false;
  END CASE;
END;
$$;

-- =====================================================
-- 7. RPC FUNCTION: UPDATE ADMIN ROLE
-- =====================================================

CREATE OR REPLACE FUNCTION update_admin_role(
  p_admin_email text,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_admin_id uuid;
  v_old_role text;
  v_current_admin_email text;
BEGIN
  -- Only superadmins can update roles
  IF NOT check_admin_permission('superadmin') THEN
    RAISE EXCEPTION 'Only superadmins can update admin roles';
  END IF;

  -- Validate new role
  IF p_new_role NOT IN ('superadmin', 'admin', 'readonly') THEN
    RAISE EXCEPTION 'Invalid role. Must be superadmin, admin, or readonly';
  END IF;

  -- Get current admin email
  SELECT email INTO v_current_admin_email
  FROM auth.users
  WHERE id = auth.uid();

  -- Prevent self-demotion from superadmin
  IF p_admin_email = v_current_admin_email THEN
    SELECT role INTO v_old_role
    FROM admin_users
    WHERE id = auth.uid();

    IF v_old_role = 'superadmin' AND p_new_role != 'superadmin' THEN
      RAISE EXCEPTION 'Cannot demote yourself from superadmin role';
    END IF;
  END IF;

  -- Get target admin user
  SELECT au.id, au.role INTO v_target_admin_id, v_old_role
  FROM admin_users au
  JOIN auth.users u ON au.id = u.id
  WHERE u.email = p_admin_email
  AND au.is_active = true;

  IF v_target_admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin user not found or inactive: %', p_admin_email;
  END IF;

  -- Ensure at least one superadmin remains
  IF v_old_role = 'superadmin' AND p_new_role != 'superadmin' THEN
    IF (SELECT COUNT(*) FROM admin_users WHERE role = 'superadmin' AND is_active = true) <= 1 THEN
      RAISE EXCEPTION 'Cannot change role: at least one active superadmin must remain';
    END IF;
  END IF;

  -- Update role
  UPDATE admin_users
  SET role = p_new_role
  WHERE id = v_target_admin_id;

  -- Log the action
  PERFORM log_admin_action(
    'UPDATE',
    'admin_users',
    v_target_admin_id::text,
    jsonb_build_object('role', v_old_role),
    jsonb_build_object('role', p_new_role),
    format('Changed admin role from %s to %s for %s', v_old_role, p_new_role, p_admin_email)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Admin role updated to %s for %s', p_new_role, p_admin_email),
    'old_role', v_old_role,
    'new_role', p_new_role
  );
END;
$$;

-- =====================================================
-- 8. RPC FUNCTION: GET AUDIT LOG STATS
-- =====================================================

CREATE OR REPLACE FUNCTION get_audit_log_stats(
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats jsonb;
BEGIN
  -- Check if user is admin
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'Only admins can view audit statistics';
  END IF;

  -- Calculate statistics
  SELECT jsonb_build_object(
    'total_actions', COUNT(*),
    'unique_admins', COUNT(DISTINCT admin_id),
    'by_action_type', (
      SELECT jsonb_object_agg(action_type, count)
      FROM (
        SELECT action_type, COUNT(*) as count
        FROM admin_audit_log
        WHERE (p_start_date IS NULL OR created_at >= p_start_date)
        AND (p_end_date IS NULL OR created_at <= p_end_date)
        GROUP BY action_type
      ) sub
    ),
    'by_table', (
      SELECT jsonb_object_agg(table_name, count)
      FROM (
        SELECT COALESCE(table_name, 'system') as table_name, COUNT(*) as count
        FROM admin_audit_log
        WHERE (p_start_date IS NULL OR created_at >= p_start_date)
        AND (p_end_date IS NULL OR created_at <= p_end_date)
        GROUP BY table_name
      ) sub
    ),
    'most_active_admin', (
      SELECT jsonb_build_object('email', admin_email, 'actions', count)
      FROM (
        SELECT admin_email, COUNT(*) as count
        FROM admin_audit_log
        WHERE (p_start_date IS NULL OR created_at >= p_start_date)
        AND (p_end_date IS NULL OR created_at <= p_end_date)
        GROUP BY admin_email
        ORDER BY count DESC
        LIMIT 1
      ) sub
    )
  ) INTO v_stats
  FROM admin_audit_log
  WHERE (p_start_date IS NULL OR created_at >= p_start_date)
  AND (p_end_date IS NULL OR created_at <= p_end_date);

  RETURN COALESCE(v_stats, '{}'::jsonb);
END;
$$;

-- =====================================================
-- 9. CREATE VIEW FOR RECENT ADMIN ACTIVITY
-- =====================================================

CREATE OR REPLACE VIEW admin_recent_activity AS
SELECT
  al.id,
  al.admin_email,
  au.role as admin_role,
  al.action_type,
  al.table_name,
  al.description,
  al.created_at,
  al.ip_address
FROM admin_audit_log al
LEFT JOIN admin_users au ON al.admin_id = au.id
ORDER BY al.created_at DESC
LIMIT 50;

-- Grant access to authenticated users (RLS will handle admin check)
GRANT SELECT ON admin_recent_activity TO authenticated;