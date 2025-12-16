/*
  ============================================================================
  ADMIN SETUP VERIFICATION SCRIPT
  ============================================================================

  Run this script in Supabase SQL Editor to verify your admin setup is working
  correctly after the migration.

  This will show you:
  1. Whether the admin_users table exists
  2. How many admins you have
  3. Which users are admins
  4. Recent admin login activity
  5. Any issues that need attention
  ============================================================================
*/

-- ============================================================================
-- STEP 1: Verify Table Exists
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'admin_users'
  ) THEN
    RAISE NOTICE '✓ admin_users table exists';
  ELSE
    RAISE NOTICE '✗ admin_users table NOT FOUND - Migration may not have run';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'admin_login_attempts'
  ) THEN
    RAISE NOTICE '✓ admin_login_attempts table exists';
  ELSE
    RAISE NOTICE '✗ admin_login_attempts table NOT FOUND';
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Admin User Statistics
-- ============================================================================

SELECT
  '===================================================' as separator,
  'ADMIN USER STATISTICS' as title
UNION ALL
SELECT
  '===================================================' as separator,
  '' as title;

SELECT
  'Total Admin Users' as metric,
  COUNT(*)::text as value
FROM admin_users
UNION ALL
SELECT
  'Active Admins',
  COUNT(*)::text
FROM admin_users
WHERE is_active = true
UNION ALL
SELECT
  'Inactive Admins',
  COUNT(*)::text
FROM admin_users
WHERE is_active = false
UNION ALL
SELECT
  'Admins Logged In Last 7 Days',
  COUNT(*)::text
FROM admin_users
WHERE last_login_at > now() - interval '7 days';

-- ============================================================================
-- STEP 3: List All Admin Users
-- ============================================================================

SELECT
  '===================================================' as separator,
  'ALL ADMIN USERS' as title,
  '' as email,
  '' as status,
  '' as last_login,
  '' as notes
UNION ALL
SELECT
  '===================================================' as separator,
  '' as title,
  '' as email,
  '' as status,
  '' as last_login,
  '' as notes
UNION ALL
SELECT
  '' as separator,
  '' as title,
  email,
  CASE
    WHEN is_active THEN '✓ Active'
    ELSE '✗ Inactive'
  END as status,
  COALESCE(last_login_at::text, 'Never') as last_login,
  COALESCE(notes, '-') as notes
FROM admin_users
ORDER BY created_at DESC;

-- ============================================================================
-- STEP 4: Check for Issues
-- ============================================================================

SELECT
  '===================================================' as separator,
  'POTENTIAL ISSUES' as title
UNION ALL
SELECT
  '===================================================' as separator,
  '' as title;

-- Issue 1: Admins who have never logged in
WITH never_logged_in AS (
  SELECT COUNT(*) as count
  FROM admin_users
  WHERE is_active = true AND last_login_at IS NULL
)
SELECT
  CASE
    WHEN count > 0 THEN '⚠ ' || count || ' active admin(s) have never logged in'
    ELSE '✓ All active admins have logged in at least once'
  END as issue
FROM never_logged_in
UNION ALL

-- Issue 2: Inactive admins for 90+ days
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN '⚠ ' || COUNT(*) || ' admin(s) inactive for 90+ days'
    ELSE '✓ No admins inactive for extended periods'
  END as issue
FROM admin_users
WHERE is_active = true
  AND last_login_at < now() - interval '90 days'
UNION ALL

-- Issue 3: Only one admin
SELECT
  CASE
    WHEN COUNT(*) = 1 THEN '⚠ Only 1 active admin - consider adding a backup admin'
    ELSE '✓ Multiple active admins'
  END as issue
FROM admin_users
WHERE is_active = true;

-- ============================================================================
-- STEP 5: Recent Admin Login Activity
-- ============================================================================

SELECT
  '===================================================' as separator,
  'RECENT ADMIN LOGIN ATTEMPTS (Last 7 Days)' as title,
  '' as email,
  '' as status,
  '' as timestamp
UNION ALL
SELECT
  '===================================================' as separator,
  '' as title,
  '' as email,
  '' as status,
  '' as timestamp
UNION ALL
SELECT
  '' as separator,
  '' as title,
  email,
  CASE
    WHEN success THEN '✓ Success'
    ELSE '✗ Failed'
  END as status,
  attempted_at::text as timestamp
FROM admin_login_attempts
WHERE attempted_at > now() - interval '7 days'
ORDER BY attempted_at DESC
LIMIT 20;

-- ============================================================================
-- STEP 6: Quick Action Recommendations
-- ============================================================================

SELECT
  '===================================================' as separator,
  'QUICK ACTIONS' as title
UNION ALL
SELECT
  '===================================================' as separator,
  '' as title
UNION ALL
SELECT
  '' as separator,
  '📋 To add a new admin:' as title
UNION ALL
SELECT
  '' as separator,
  '   INSERT INTO admin_users (id, email)' as title
UNION ALL
SELECT
  '' as separator,
  '   SELECT id, email FROM auth.users WHERE email = ''user@example.com'';' as title
UNION ALL
SELECT
  '' as separator,
  '' as title
UNION ALL
SELECT
  '' as separator,
  '📋 To remove admin access:' as title
UNION ALL
SELECT
  '' as separator,
  '   UPDATE admin_users SET is_active = false WHERE email = ''user@example.com'';' as title
UNION ALL
SELECT
  '' as separator,
  '' as title
UNION ALL
SELECT
  '' as separator,
  '📋 To view detailed admin info:' as title
UNION ALL
SELECT
  '' as separator,
  '   SELECT * FROM admin_users_detailed;' as title;

-- ============================================================================
-- STEP 7: Test Admin Functions
-- ============================================================================

DO $$
DECLARE
  test_result boolean;
BEGIN
  -- Test if functions exist
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'is_admin_user'
  ) THEN
    RAISE NOTICE '✓ is_admin_user() function exists';
  ELSE
    RAISE NOTICE '✗ is_admin_user() function NOT FOUND';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'add_admin_by_email'
  ) THEN
    RAISE NOTICE '✓ add_admin_by_email() function exists';
  ELSE
    RAISE NOTICE '✗ add_admin_by_email() function NOT FOUND';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'deactivate_admin_by_email'
  ) THEN
    RAISE NOTICE '✓ deactivate_admin_by_email() function exists';
  ELSE
    RAISE NOTICE '✗ deactivate_admin_by_email() function NOT FOUND';
  END IF;
END $$;

-- ============================================================================
-- FINAL SUMMARY
-- ============================================================================

DO $$
DECLARE
  total_admins integer;
  active_admins integer;
  setup_ok boolean := true;
BEGIN
  SELECT COUNT(*) INTO total_admins FROM admin_users;
  SELECT COUNT(*) INTO active_admins FROM admin_users WHERE is_active = true;

  RAISE NOTICE '';
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'SETUP VERIFICATION COMPLETE';
  RAISE NOTICE '==================================================';

  IF total_admins = 0 THEN
    RAISE NOTICE '❌ NO ADMINS FOUND - You need to add at least one admin';
    setup_ok := false;
  ELSIF active_admins = 0 THEN
    RAISE NOTICE '❌ NO ACTIVE ADMINS - All admins are deactivated';
    setup_ok := false;
  ELSE
    RAISE NOTICE '✅ Setup looks good!';
    RAISE NOTICE '';
    RAISE NOTICE 'You have % active admin(s)', active_admins;
    RAISE NOTICE '';
    RAISE NOTICE 'Admins can log in at: /admin/login';
  END IF;

  RAISE NOTICE '==================================================';
END $$;
