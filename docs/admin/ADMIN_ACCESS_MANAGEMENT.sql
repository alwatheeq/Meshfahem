/*
  # Admin Access Management Script

  This script contains helpful queries for managing admin access in your application.

  ## Usage:
  1. Open your Supabase Dashboard (https://supabase.com/dashboard)
  2. Navigate to SQL Editor
  3. Copy and run the relevant queries below
*/

-- ============================================================================
-- CHECK ADMIN USERS
-- ============================================================================
-- View all users with admin role
SELECT
  u.id,
  u.email,
  u.created_at,
  up.user_role,
  up.subscription_tier,
  up.monthly_usage
FROM auth.users u
JOIN user_profiles up ON u.id = up.id
WHERE up.user_role = 'admin'
ORDER BY u.created_at DESC;


-- ============================================================================
-- VERIFY SPECIFIC USER ADMIN STATUS
-- ============================================================================
-- Check if a specific user has admin access
-- Replace 'admin@test.com' with the email you want to check
SELECT
  u.id,
  u.email,
  u.created_at,
  u.email_confirmed_at,
  up.user_role,
  CASE
    WHEN up.user_role = 'admin' THEN '✓ HAS ADMIN ACCESS'
    ELSE '✗ NO ADMIN ACCESS'
  END as status
FROM auth.users u
LEFT JOIN user_profiles up ON u.id = up.id
WHERE u.email = 'admin@test.com';


-- ============================================================================
-- GRANT ADMIN ACCESS TO USER
-- ============================================================================
-- Promote a user to admin role by email
-- Replace 'user@example.com' with the user's email
UPDATE user_profiles
SET user_role = 'admin'
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = 'user@example.com'
);

-- Verify the change
SELECT
  u.email,
  up.user_role
FROM auth.users u
JOIN user_profiles up ON u.id = up.id
WHERE u.email = 'user@example.com';


-- ============================================================================
-- REVOKE ADMIN ACCESS FROM USER
-- ============================================================================
-- Demote an admin back to regular user
-- Replace 'admin@example.com' with the user's email
UPDATE user_profiles
SET user_role = 'user'
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = 'admin@example.com'
);


-- ============================================================================
-- CREATE NEW ADMIN USER
-- ============================================================================
-- To create a new admin user:
--
-- STEP 1: Create the user account
-- Go to: Authentication > Users in Supabase Dashboard
-- Click "Add User" and enter:
--   - Email: your-admin@example.com
--   - Password: SecurePassword123!
--   - Check "Auto Confirm User"
--   - Click "Create User"
--
-- STEP 2: Promote to admin (run this after creating the user)
UPDATE user_profiles
SET user_role = 'admin'
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = 'your-admin@example.com'
);


-- ============================================================================
-- TROUBLESHOOTING
-- ============================================================================

-- Check if user profile exists for an auth user
SELECT
  u.id,
  u.email,
  CASE
    WHEN up.id IS NULL THEN '✗ NO PROFILE'
    ELSE '✓ PROFILE EXISTS'
  END as profile_status,
  up.user_role
FROM auth.users u
LEFT JOIN user_profiles up ON u.id = up.id
WHERE u.email = 'admin@test.com';


-- Create missing user profile (if needed)
-- Replace the UUID with the actual user ID from auth.users
INSERT INTO user_profiles (id, email, user_role, monthly_usage, last_reset)
VALUES (
  'USER_UUID_HERE',
  'admin@test.com',
  'admin',
  0,
  NOW()
)
ON CONFLICT (id) DO UPDATE
SET user_role = 'admin';


-- Check if is_admin() function works correctly
SELECT is_admin() as am_i_admin;
-- Note: This will only return true if YOU (the SQL query runner) are logged in as an admin


-- ============================================================================
-- LIST ALL USERS WITH THEIR ROLES
-- ============================================================================
SELECT
  u.id,
  u.email,
  u.created_at,
  COALESCE(up.user_role, 'NO PROFILE') as role,
  up.subscription_tier,
  up.monthly_usage
FROM auth.users u
LEFT JOIN user_profiles up ON u.id = up.id
ORDER BY
  CASE up.user_role
    WHEN 'admin' THEN 1
    ELSE 2
  END,
  u.created_at DESC;


-- ============================================================================
-- ADMIN ACCESS STATISTICS
-- ============================================================================
SELECT
  COUNT(*) FILTER (WHERE up.user_role = 'admin') as total_admins,
  COUNT(*) FILTER (WHERE up.user_role = 'user') as total_users,
  COUNT(*) FILTER (WHERE up.id IS NULL) as users_without_profile,
  COUNT(*) as total_auth_users
FROM auth.users u
LEFT JOIN user_profiles up ON u.id = up.id;
