/*
  # Create Admin User Script

  This script creates an initial admin user for your application.

  ## Instructions:
  1. Open your Supabase Dashboard (https://supabase.com/dashboard)
  2. Navigate to your project
  3. Go to SQL Editor
  4. Copy and paste this entire script
  5. Click "Run" to execute

  ## Default Credentials:
  - Email: admin@example.com
  - Password: AdminPassword123!

  ## IMPORTANT SECURITY NOTES:
  - Change these credentials IMMEDIATELY after first login
  - You can modify the email and password in the script below before running it
  - This script will only create the user if they don't already exist

  ## To Create Additional Admin Users:
  After the initial admin is created, you can:
  1. Log in to the admin dashboard
  2. Navigate to the Users page
  3. Promote existing users to admin role

  OR run this SQL in Supabase SQL Editor:
  UPDATE user_profiles
  SET user_role = 'admin'
  WHERE id = (SELECT id FROM auth.users WHERE email = 'user@example.com');
*/

-- ============================================================================
-- STEP 1: First, create the auth user using Supabase's signup
-- ============================================================================
-- You need to create the user account first through one of these methods:
--
-- METHOD A: Use Supabase Dashboard
-- 1. Go to Authentication > Users in your Supabase Dashboard
-- 2. Click "Add User" button
-- 3. Enter email: admin@example.com
-- 4. Enter password: AdminPassword123!
-- 5. Enable "Auto Confirm User" checkbox
-- 6. Click "Create User"
-- 7. Copy the user's UUID from the users list
-- 8. Run the STEP 2 query below, replacing 'USER_UUID_HERE' with the actual UUID
--
-- METHOD B: Sign up through your application
-- 1. Go to your application's signup page
-- 2. Create an account with your desired admin email and password
-- 3. Log in once to ensure the account works
-- 4. Find your user ID from user_profiles table or auth.users table
-- 5. Run the STEP 2 query below with your user ID

-- ============================================================================
-- STEP 2: Promote the user to admin role
-- ============================================================================
-- After creating the user account (using METHOD A or B above), run this query:
-- Replace 'USER_UUID_HERE' with the actual UUID of the user you want to make admin

-- Option 1: If you know the user's UUID
-- UPDATE user_profiles
-- SET user_role = 'admin'
-- WHERE id = 'USER_UUID_HERE';

-- Option 2: If you know the user's email (safer and easier)
UPDATE user_profiles
SET user_role = 'admin'
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = 'admin@example.com'
);

-- ============================================================================
-- STEP 3: Verify the admin user was created successfully
-- ============================================================================
SELECT
  u.id,
  u.email,
  u.created_at,
  up.user_role,
  up.monthly_usage
FROM auth.users u
JOIN user_profiles up ON u.id = up.id
WHERE up.user_role = 'admin';

-- You should see your admin user listed with role = 'admin'

-- ============================================================================
-- Additional Helpful Queries
-- ============================================================================

-- List all admin users
-- SELECT
--   u.email,
--   up.user_role,
--   up.created_at
-- FROM auth.users u
-- JOIN user_profiles up ON u.id = up.id
-- WHERE up.user_role = 'admin';

-- Demote an admin back to regular user
-- UPDATE user_profiles
-- SET user_role = 'user'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'user@example.com');

-- Check if a specific email has admin access
-- SELECT
--   u.email,
--   up.user_role
-- FROM auth.users u
-- JOIN user_profiles up ON u.id = up.id
-- WHERE u.email = 'admin@example.com';
