/*
  Admin User Verification Script

  This script helps verify that the admin user is properly configured in the database.
  Run this in your Supabase SQL Editor to check admin status.
*/

-- ============================================================================
-- STEP 1: Verify Admin User Exists and Has Correct Role
-- ============================================================================

SELECT
  u.id,
  u.email,
  u.created_at as user_created_at,
  u.confirmed_at,
  up.user_role,
  up.monthly_usage,
  up.last_reset,
  up.created_at as profile_created_at
FROM auth.users u
LEFT JOIN user_profiles up ON u.id = up.id
WHERE u.email = 'admin@test.com'
ORDER BY u.created_at DESC;

-- Expected result:
-- - user_role should be 'admin'
-- - confirmed_at should NOT be null (user is confirmed)

-- ============================================================================
-- STEP 2: If Admin Role is Missing, Update It
-- ============================================================================

-- Uncomment and run this if the admin user exists but doesn't have admin role
/*
UPDATE user_profiles
SET user_role = 'admin'
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = 'admin@test.com'
);
*/

-- ============================================================================
-- STEP 3: Verify All Admin Users
-- ============================================================================

SELECT
  u.id,
  u.email,
  u.created_at,
  u.confirmed_at,
  up.user_role,
  up.monthly_usage
FROM auth.users u
INNER JOIN user_profiles up ON u.id = up.id
WHERE up.user_role = 'admin'
ORDER BY u.created_at DESC;

-- ============================================================================
-- STEP 4: Test Admin Login Credentials
-- ============================================================================

-- Admin credentials for testing:
-- Email: admin@test.com
-- Password: Admin123!

-- To reset the password if needed, run this in Supabase Dashboard:
-- 1. Go to Authentication > Users
-- 2. Find admin@test.com
-- 3. Click the "..." menu > Reset Password
-- 4. Or manually update using Supabase Dashboard

-- ============================================================================
-- STEP 5: Check if User Profile Gets Created on Login
-- ============================================================================

-- This query shows recent user logins and their profile status
SELECT
  u.email,
  u.last_sign_in_at,
  up.user_role,
  up.created_at as profile_created,
  CASE
    WHEN up.id IS NULL THEN 'Profile Missing'
    WHEN up.user_role = 'admin' THEN 'Admin Access'
    ELSE 'Regular User'
  END as status
FROM auth.users u
LEFT JOIN user_profiles up ON u.id = up.id
WHERE u.email = 'admin@test.com';

-- ============================================================================
-- TROUBLESHOOTING: Common Issues and Solutions
-- ============================================================================

/*
Issue 1: Admin user redirected to regular user dashboard
Solution: Verify user_role is 'admin' in user_profiles table

Issue 2: Admin profile gets reset to 'user' on login
Solution: The AuthContext.tsx has been updated to preserve existing roles
         The loadUserProfile function now checks for existing profiles first

Issue 3: Admin login shows "Access denied"
Solution:
  1. Verify user exists in auth.users
  2. Verify user_role = 'admin' in user_profiles
  3. Check browser console for authentication debug logs
  4. Clear browser cache and cookies

Issue 4: Cannot login at all
Solution:
  1. Verify user is confirmed (confirmed_at is not null)
  2. Reset password through Supabase Dashboard
  3. Check Supabase logs for authentication errors
*/

-- ============================================================================
-- STEP 6: Create New Admin User (if needed)
-- ============================================================================

/*
To create a new admin user:
1. First create the auth user through Supabase Dashboard:
   - Go to Authentication > Users > Add User
   - Enter email and password
   - Check "Auto Confirm User"
   - Click Create User

2. Then run this SQL to set admin role:

UPDATE user_profiles
SET user_role = 'admin'
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = 'your-new-admin@example.com'
);

3. If the user_profile doesn't exist yet, create it:

INSERT INTO user_profiles (id, email, user_role, monthly_usage, last_reset)
SELECT
  id,
  email,
  'admin',
  0,
  now()
FROM auth.users
WHERE email = 'your-new-admin@example.com'
ON CONFLICT (id) DO UPDATE
SET user_role = 'admin';
*/
