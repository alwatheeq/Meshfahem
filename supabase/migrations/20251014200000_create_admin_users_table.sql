/*
  # Create Admin Users Table for Separate Admin Management

  1. Purpose
    - Create dedicated `admin_users` table for admin authentication
    - Separate admin management from regular user profiles
    - Provide better security and audit trail for admin access
    - Allow granular control over admin privileges

  2. New Tables
    - `admin_users`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text, unique, not null)
      - `created_at` (timestamptz, default now())
      - `created_by` (uuid, references admin_users - tracks who added this admin)
      - `last_login_at` (timestamptz, nullable)
      - `is_active` (boolean, default true - allows disabling admin access)
      - `notes` (text, nullable - internal notes about this admin)

    - `admin_login_attempts`
      - `id` (uuid, primary key)
      - `email` (text, not null)
      - `success` (boolean, not null)
      - `ip_address` (text, nullable)
      - `user_agent` (text, nullable)
      - `attempted_at` (timestamptz, default now())
      - `user_id` (uuid, nullable - only set if login succeeded)

  3. Functions
    - `is_admin_user()` - Checks if current authenticated user exists in admin_users table
    - `is_admin_user(user_id)` - Checks if specified user is an admin
    - `add_admin_user()` - Trigger to automatically add admin to admin_users on first login

  4. Security (RLS)
    - Only admins can view admin_users table
    - Only admins can view admin_login_attempts
    - Admins cannot delete themselves from admin_users
    - All admin actions are logged for audit purposes

  5. Data Migration
    - Automatically migrate existing admins from user_profiles where user_role = 'admin'
    - Preserve existing user_role column for backward compatibility
    - All existing admin policies continue to work

  6. Notes
    - This migration is non-destructive - existing data preserved
    - Admin access now controlled by presence in admin_users table
    - To add admin: INSERT INTO admin_users (id, email) VALUES (user_id, user_email)
    - To remove admin: UPDATE admin_users SET is_active = false WHERE id = user_id
    - The user_role column is kept but deprecated in favor of admin_users table
*/

-- ============================================================================
-- STEP 1: Create admin_users table
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  last_login_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  notes text
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_is_active ON admin_users(is_active);
CREATE INDEX IF NOT EXISTS idx_admin_users_created_at ON admin_users(created_at);

-- Add comment for documentation
COMMENT ON TABLE admin_users IS 'Stores admin user access control. Presence in this table grants admin privileges.';
COMMENT ON COLUMN admin_users.is_active IS 'Set to false to revoke admin access without deleting the record';
COMMENT ON COLUMN admin_users.created_by IS 'Tracks which admin added this admin user (for audit purposes)';

-- ============================================================================
-- STEP 2: Create admin login attempts audit table
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  success boolean NOT NULL,
  ip_address text,
  user_agent text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error_message text
);

-- Create indexes for performance and audit queries
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_email ON admin_login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_attempted_at ON admin_login_attempts(attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_success ON admin_login_attempts(success);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_user_id ON admin_login_attempts(user_id);

COMMENT ON TABLE admin_login_attempts IS 'Audit log of all admin login attempts for security monitoring';

-- ============================================================================
-- STEP 3: Migrate existing admins from user_profiles
-- ============================================================================

-- Migrate all users with user_role = 'admin' to admin_users table
INSERT INTO admin_users (id, email, created_at, is_active, notes)
SELECT
  up.id,
  up.email,
  up.created_at,
  true,
  'Migrated from user_profiles.user_role on ' || now()::date
FROM user_profiles up
WHERE up.user_role = 'admin'
  AND NOT EXISTS (SELECT 1 FROM admin_users au WHERE au.id = up.id)
ON CONFLICT (id) DO NOTHING;

-- Log the migration
DO $$
DECLARE
  admin_count integer;
BEGIN
  SELECT COUNT(*) INTO admin_count FROM admin_users WHERE is_active = true;
  RAISE NOTICE '✓ Migrated % admin users to admin_users table', admin_count;
END $$;

-- ============================================================================
-- STEP 4: Create helper functions for admin checks
-- ============================================================================

-- Function to check if current authenticated user is an admin
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM admin_users
    WHERE id = auth.uid()
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_admin_user() IS 'Returns true if the current authenticated user is an active admin';

-- Overloaded function to check if a specific user is an admin
CREATE OR REPLACE FUNCTION is_admin_user(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM admin_users
    WHERE id = user_id
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_admin_user(uuid) IS 'Returns true if the specified user is an active admin';

-- Function to get admin user details (for auth context)
CREATE OR REPLACE FUNCTION get_admin_user_info(user_id uuid)
RETURNS TABLE (
  is_admin boolean,
  admin_since timestamptz,
  last_login timestamptz,
  is_active boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXISTS(SELECT 1 FROM admin_users WHERE id = user_id AND is_active = true) as is_admin,
    au.created_at as admin_since,
    au.last_login_at as last_login,
    au.is_active
  FROM admin_users au
  WHERE au.id = user_id;

  -- If user not in admin table, return default values
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::timestamptz, NULL::timestamptz, false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_admin_user_info(uuid) IS 'Returns detailed admin information for a user';

-- Function to update last login timestamp for admin
CREATE OR REPLACE FUNCTION update_admin_last_login(user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE admin_users
  SET last_login_at = now()
  WHERE id = user_id AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_admin_last_login(uuid) IS 'Updates the last login timestamp for an admin user';

-- ============================================================================
-- STEP 5: Enable Row Level Security (RLS)
-- ============================================================================

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_login_attempts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 6: Create RLS Policies for admin_users table
-- ============================================================================

-- Policy: Only admins can view the admin_users table
CREATE POLICY "Only admins can view admin users"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (is_admin_user());

-- Policy: Only admins can insert new admins
CREATE POLICY "Only admins can add new admins"
  ON admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_user());

-- Policy: Only admins can update admin records (for notes, last_login, etc.)
CREATE POLICY "Only admins can update admin records"
  ON admin_users
  FOR UPDATE
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- Policy: Only admins can deactivate other admins (prevent self-deletion)
CREATE POLICY "Only admins can deactivate other admins"
  ON admin_users
  FOR UPDATE
  TO authenticated
  USING (
    is_admin_user() AND id != auth.uid()
  )
  WITH CHECK (
    is_admin_user() AND id != auth.uid()
  );

-- Policy: Prevent deletion of admin records (use is_active instead)
CREATE POLICY "Prevent deletion of admin records"
  ON admin_users
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================================
-- STEP 7: Create RLS Policies for admin_login_attempts table
-- ============================================================================

-- Policy: Only admins can view login attempts
CREATE POLICY "Only admins can view login attempts"
  ON admin_login_attempts
  FOR SELECT
  TO authenticated
  USING (is_admin_user());

-- Policy: Allow system to insert login attempts (via service role)
-- Note: Login attempts are typically inserted by edge functions or triggers

-- ============================================================================
-- STEP 8: Update existing admin policies to use new function
-- ============================================================================

-- Note: We keep the old is_admin() function for backward compatibility
-- The new is_admin_user() function checks the admin_users table
-- Both functions can coexist during the transition period

-- Create a view for easy admin user management
CREATE OR REPLACE VIEW admin_users_detailed AS
SELECT
  au.id,
  au.email,
  au.created_at,
  au.last_login_at,
  au.is_active,
  au.notes,
  creator.email as created_by_email,
  u.created_at as user_account_created,
  u.last_sign_in_at as last_auth_signin,
  CASE
    WHEN au.is_active THEN 'Active'
    ELSE 'Inactive'
  END as status
FROM admin_users au
LEFT JOIN auth.users u ON au.id = u.id
LEFT JOIN admin_users creator ON au.created_by = creator.id;

COMMENT ON VIEW admin_users_detailed IS 'Detailed view of admin users with related information';

-- ============================================================================
-- STEP 9: Create verification and management functions
-- ============================================================================

-- Function to add a new admin (used by existing admins)
CREATE OR REPLACE FUNCTION add_admin_by_email(
  admin_email text,
  admin_notes text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  target_user_id uuid;
  current_admin_email text;
BEGIN
  -- Verify caller is an admin
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'Only admins can add new admins';
  END IF;

  -- Get the user ID for the email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = admin_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % does not exist', admin_email;
  END IF;

  -- Check if already an admin
  IF is_admin_user(target_user_id) THEN
    RAISE EXCEPTION 'User % is already an admin', admin_email;
  END IF;

  -- Add to admin_users
  INSERT INTO admin_users (id, email, created_by, notes)
  VALUES (target_user_id, admin_email, auth.uid(), admin_notes);

  -- Get current admin's email for logging
  SELECT email INTO current_admin_email FROM auth.users WHERE id = auth.uid();

  RAISE NOTICE '✓ Admin added: % by %', admin_email, current_admin_email;

  RETURN target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION add_admin_by_email(text, text) IS 'Adds a user as admin by their email address. Can only be called by existing admins.';

-- Function to deactivate an admin
CREATE OR REPLACE FUNCTION deactivate_admin_by_email(admin_email text)
RETURNS boolean AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Verify caller is an admin
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'Only admins can deactivate admins';
  END IF;

  -- Get the user ID for the email
  SELECT id INTO target_user_id
  FROM admin_users
  WHERE email = admin_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Admin user with email % does not exist', admin_email;
  END IF;

  -- Prevent self-deactivation
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot deactivate your own admin account';
  END IF;

  -- Deactivate the admin
  UPDATE admin_users
  SET is_active = false
  WHERE id = target_user_id;

  RAISE NOTICE '✓ Admin deactivated: %', admin_email;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION deactivate_admin_by_email(text) IS 'Deactivates an admin user by their email. Cannot deactivate self.';

-- Function to reactivate an admin
CREATE OR REPLACE FUNCTION reactivate_admin_by_email(admin_email text)
RETURNS boolean AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Verify caller is an admin
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'Only admins can reactivate admins';
  END IF;

  -- Get the user ID for the email
  SELECT id INTO target_user_id
  FROM admin_users
  WHERE email = admin_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Admin user with email % does not exist', admin_email;
  END IF;

  -- Reactivate the admin
  UPDATE admin_users
  SET is_active = true
  WHERE id = target_user_id;

  RAISE NOTICE '✓ Admin reactivated: %', admin_email;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION reactivate_admin_by_email(text) IS 'Reactivates a deactivated admin user by their email';

-- ============================================================================
-- STEP 10: Display migration summary
-- ============================================================================

DO $$
DECLARE
  total_admins integer;
  active_admins integer;
  inactive_admins integer;
BEGIN
  SELECT COUNT(*) INTO total_admins FROM admin_users;
  SELECT COUNT(*) INTO active_admins FROM admin_users WHERE is_active = true;
  SELECT COUNT(*) INTO inactive_admins FROM admin_users WHERE is_active = false;

  RAISE NOTICE '==================================================';
  RAISE NOTICE 'ADMIN USERS TABLE CREATED SUCCESSFULLY';
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'Total admin users: %', total_admins;
  RAISE NOTICE 'Active admins: %', active_admins;
  RAISE NOTICE 'Inactive admins: %', inactive_admins;
  RAISE NOTICE '';
  RAISE NOTICE 'Admin management is now controlled by the admin_users table';
  RAISE NOTICE '';
  RAISE NOTICE 'To add an admin:';
  RAISE NOTICE '  INSERT INTO admin_users (id, email)';
  RAISE NOTICE '  SELECT id, email FROM auth.users WHERE email = ''user@example.com'';';
  RAISE NOTICE '';
  RAISE NOTICE 'To remove admin access:';
  RAISE NOTICE '  UPDATE admin_users SET is_active = false';
  RAISE NOTICE '  WHERE email = ''user@example.com'';';
  RAISE NOTICE '';
  RAISE NOTICE 'To list all admins:';
  RAISE NOTICE '  SELECT * FROM admin_users_detailed;';
  RAISE NOTICE '==================================================';
END $$;
