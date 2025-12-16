/*
  # Fix prevent_admin Functions - Add SECURITY DEFINER

  ## Problem
  prevent_admin_user_profile() and prevent_admin_subscription() functions
  lack SECURITY DEFINER, causing them to run with regular user privileges.
  
  When these functions try to query admin_users table, RLS blocks the query
  because regular users don't have SELECT permission on admin_users.
  
  This causes ALL email/password sign-ups to fail with "Database error saving new user".

  ## Solution
  Add SECURITY DEFINER to both functions so they can bypass RLS when checking
  if a user is an admin. This doesn't expose admin data - it only allows the
  security check to complete.

  ## Security Impact
  - Functions already only check admin status (read-only)
  - Don't return or expose any admin data
  - Don't allow privilege escalation
  - Adding SECURITY DEFINER is safe and necessary
*/

-- Fix #1: Add SECURITY DEFINER to prevent_admin_user_profile()
CREATE OR REPLACE FUNCTION prevent_admin_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is in admin_users table
  IF EXISTS (
    SELECT 1 FROM admin_users 
    WHERE id = NEW.id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Cannot create user_profile for admin user. Admin users are managed separately in admin_users table.';
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_admin_user_profile() IS 
  'Prevents admin users from being added to user_profiles table. Uses SECURITY DEFINER to bypass RLS when checking admin status.';

-- Fix #2: Add SECURITY DEFINER to prevent_admin_subscription()
CREATE OR REPLACE FUNCTION prevent_admin_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is in admin_users table
  IF EXISTS (
    SELECT 1 FROM admin_users 
    WHERE id = NEW.user_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Cannot create subscription for admin user. Admin users have unrestricted access.';
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_admin_subscription() IS 
  'Prevents admin users from being added to subscriptions table. Uses SECURITY DEFINER to bypass RLS when checking admin status.';

-- Verification: Log the fix
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Fixed prevent_admin Functions';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Added SECURITY DEFINER to:';
  RAISE NOTICE '  ✓ prevent_admin_user_profile()';
  RAISE NOTICE '  ✓ prevent_admin_subscription()';
  RAISE NOTICE '';
  RAISE NOTICE 'Email/password sign-ups should now work correctly.';
  RAISE NOTICE '========================================';
END $$;