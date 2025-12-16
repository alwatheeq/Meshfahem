/*
  ============================================================================
  ADMIN MANAGEMENT GUIDE
  ============================================================================

  This file contains SQL scripts to manage admin users in your application.
  Admin access is now controlled by the `admin_users` table.

  IMPORTANT: Run these scripts in your Supabase SQL Editor

  Quick Navigation:
  1. View All Admins
  2. Add New Admin
  3. Remove Admin Access
  4. Reactivate Admin
  5. Check If User Is Admin
  6. View Admin Login History
  7. Troubleshooting
  ============================================================================
*/

-- ============================================================================
-- 1. VIEW ALL ADMINS
-- ============================================================================
-- Shows all admin users with their status and details

SELECT
  au.email,
  au.is_active,
  au.created_at,
  au.last_login_at,
  creator.email as added_by,
  au.notes,
  CASE
    WHEN au.is_active THEN '✓ Active'
    ELSE '✗ Inactive'
  END as status
FROM admin_users au
LEFT JOIN admin_users creator ON au.created_by = creator.id
ORDER BY au.created_at DESC;

-- ============================================================================
-- 2. ADD NEW ADMIN
-- ============================================================================
-- Make any existing user an admin by their email

-- METHOD A: Simple insert (recommended)
-- Replace 'user@example.com' with the actual email
INSERT INTO admin_users (id, email, notes)
SELECT
  id,
  email,
  'Added manually via SQL on ' || now()::date
FROM auth.users
WHERE email = 'user@example.com'
ON CONFLICT (id) DO UPDATE
SET is_active = true,
    notes = 'Reactivated on ' || now()::date;

-- METHOD B: Using the built-in function (if you're logged in as an admin)
-- Replace 'user@example.com' with the actual email
SELECT add_admin_by_email('user@example.com', 'Optional notes about this admin');

-- ============================================================================
-- 3. REMOVE ADMIN ACCESS (DEACTIVATE)
-- ============================================================================
-- Deactivates an admin without deleting the record (recommended approach)

-- METHOD A: Direct update
-- Replace 'admin@example.com' with the admin's email
UPDATE admin_users
SET is_active = false,
    notes = COALESCE(notes || ' | ', '') || 'Deactivated on ' || now()::date
WHERE email = 'admin@example.com';

-- METHOD B: Using the built-in function (if you're logged in as an admin)
SELECT deactivate_admin_by_email('admin@example.com');

-- ============================================================================
-- 4. REACTIVATE ADMIN
-- ============================================================================
-- Reactivates a previously deactivated admin

-- METHOD A: Direct update
UPDATE admin_users
SET is_active = true,
    notes = COALESCE(notes || ' | ', '') || 'Reactivated on ' || now()::date
WHERE email = 'admin@example.com';

-- METHOD B: Using the built-in function (if you're logged in as an admin)
SELECT reactivate_admin_by_email('admin@example.com');

-- ============================================================================
-- 5. CHECK IF USER IS ADMIN
-- ============================================================================
-- Check if a specific email has admin access

SELECT
  u.email,
  u.id,
  EXISTS(
    SELECT 1
    FROM admin_users au
    WHERE au.id = u.id AND au.is_active = true
  ) as is_admin,
  au.created_at as admin_since,
  au.last_login_at as last_admin_login
FROM auth.users u
LEFT JOIN admin_users au ON u.id = au.id
WHERE u.email = 'user@example.com';

-- ============================================================================
-- 6. VIEW ADMIN LOGIN HISTORY
-- ============================================================================
-- Shows recent admin login attempts (successful and failed)

-- All admin login attempts (last 100)
SELECT
  email,
  success,
  attempted_at,
  ip_address,
  CASE
    WHEN success THEN '✓ Success'
    ELSE '✗ Failed'
  END as result
FROM admin_login_attempts
ORDER BY attempted_at DESC
LIMIT 100;

-- Failed login attempts only (security monitoring)
SELECT
  email,
  attempted_at,
  ip_address,
  error_message,
  COUNT(*) OVER (PARTITION BY email) as failed_attempts_by_email
FROM admin_login_attempts
WHERE success = false
  AND attempted_at > now() - interval '24 hours'
ORDER BY attempted_at DESC;

-- Successful admin logins in last 7 days
SELECT
  email,
  attempted_at,
  ip_address
FROM admin_login_attempts
WHERE success = true
  AND attempted_at > now() - interval '7 days'
ORDER BY attempted_at DESC;

-- ============================================================================
-- 7. BULK OPERATIONS
-- ============================================================================

-- Add multiple admins at once
-- Replace emails in the VALUES list
INSERT INTO admin_users (id, email, notes)
SELECT
  u.id,
  u.email,
  'Bulk added on ' || now()::date
FROM auth.users u
WHERE u.email IN (
  'admin1@example.com',
  'admin2@example.com',
  'admin3@example.com'
)
ON CONFLICT (id) DO UPDATE
SET is_active = true;

-- Deactivate multiple admins at once
UPDATE admin_users
SET is_active = false,
    notes = COALESCE(notes || ' | ', '') || 'Bulk deactivated on ' || now()::date
WHERE email IN (
  'admin1@example.com',
  'admin2@example.com'
);

-- ============================================================================
-- 8. STATISTICS AND REPORTS
-- ============================================================================

-- Admin user statistics
SELECT
  COUNT(*) as total_admins,
  COUNT(*) FILTER (WHERE is_active = true) as active_admins,
  COUNT(*) FILTER (WHERE is_active = false) as inactive_admins,
  COUNT(*) FILTER (WHERE last_login_at > now() - interval '7 days') as admins_logged_in_last_7_days,
  COUNT(*) FILTER (WHERE last_login_at IS NULL OR last_login_at < now() - interval '30 days') as inactive_for_30_days
FROM admin_users;

-- Admin activity report
SELECT
  au.email,
  au.is_active,
  au.created_at,
  au.last_login_at,
  CASE
    WHEN au.last_login_at IS NULL THEN 'Never logged in'
    WHEN au.last_login_at > now() - interval '1 day' THEN 'Active today'
    WHEN au.last_login_at > now() - interval '7 days' THEN 'Active this week'
    WHEN au.last_login_at > now() - interval '30 days' THEN 'Active this month'
    ELSE 'Inactive > 30 days'
  END as activity_status,
  EXTRACT(DAY FROM (now() - au.last_login_at)) as days_since_last_login
FROM admin_users au
ORDER BY au.last_login_at DESC NULLS LAST;

-- ============================================================================
-- 9. TROUBLESHOOTING
-- ============================================================================

-- Problem: User can't access admin portal
-- Solution: Verify user is in admin_users table and is_active = true
SELECT
  u.email,
  u.id,
  au.is_active,
  CASE
    WHEN au.id IS NULL THEN '❌ Not in admin_users table - Add them using script #2'
    WHEN au.is_active = false THEN '❌ Admin access deactivated - Reactivate using script #4'
    ELSE '✅ Should have access - Check application logs'
  END as diagnosis
FROM auth.users u
LEFT JOIN admin_users au ON u.id = au.id
WHERE u.email = 'user@example.com';

-- Problem: Need to find who added a specific admin
SELECT
  au.email as admin_email,
  creator.email as added_by,
  au.created_at as added_on,
  au.notes
FROM admin_users au
LEFT JOIN admin_users creator ON au.created_by = creator.id
WHERE au.email = 'admin@example.com';

-- Problem: Suspect unauthorized admin access
-- Solution: Review admin login attempts and admin additions
SELECT
  'Login Attempts' as type,
  email,
  attempted_at as timestamp,
  success::text as details
FROM admin_login_attempts
WHERE attempted_at > now() - interval '7 days'
UNION ALL
SELECT
  'Admin Added' as type,
  email,
  created_at as timestamp,
  'Added by: ' || COALESCE(creator.email, 'System') as details
FROM admin_users au
LEFT JOIN admin_users creator ON au.created_by = creator.id
WHERE au.created_at > now() - interval '7 days'
ORDER BY timestamp DESC;

-- Problem: Clean up old inactive admins
-- Solution: Review and deactivate admins who haven't logged in for 90+ days
SELECT
  email,
  last_login_at,
  EXTRACT(DAY FROM (now() - last_login_at)) as days_since_login
FROM admin_users
WHERE is_active = true
  AND (last_login_at IS NULL OR last_login_at < now() - interval '90 days')
ORDER BY last_login_at NULLS FIRST;

-- To deactivate them after review:
-- UPDATE admin_users
-- SET is_active = false,
--     notes = COALESCE(notes || ' | ', '') || 'Auto-deactivated due to inactivity on ' || now()::date
-- WHERE is_active = true
--   AND (last_login_at IS NULL OR last_login_at < now() - interval '90 days');

-- ============================================================================
-- 10. SECURITY AUDIT
-- ============================================================================

-- Generate a complete security audit report
WITH admin_stats AS (
  SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE is_active) as active
  FROM admin_users
),
recent_logins AS (
  SELECT
    COUNT(*) as total_attempts,
    COUNT(*) FILTER (WHERE success) as successful,
    COUNT(*) FILTER (WHERE NOT success) as failed
  FROM admin_login_attempts
  WHERE attempted_at > now() - interval '7 days'
)
SELECT
  'Total Admin Users' as metric,
  admin_stats.total::text as value
FROM admin_stats
UNION ALL
SELECT
  'Active Admin Users',
  admin_stats.active::text
FROM admin_stats
UNION ALL
SELECT
  'Login Attempts (7 days)',
  recent_logins.total_attempts::text
FROM recent_logins
UNION ALL
SELECT
  'Successful Logins (7 days)',
  recent_logins.successful::text
FROM recent_logins
UNION ALL
SELECT
  'Failed Logins (7 days)',
  recent_logins.failed::text
FROM recent_logins;

-- ============================================================================
-- QUICK REFERENCE COMMANDS
-- ============================================================================

/*
-- Add admin:
INSERT INTO admin_users (id, email)
SELECT id, email FROM auth.users WHERE email = 'EMAIL_HERE';

-- Remove admin:
UPDATE admin_users SET is_active = false WHERE email = 'EMAIL_HERE';

-- View all admins:
SELECT * FROM admin_users_detailed;

-- Check if user is admin:
SELECT is_admin_user('USER_ID_HERE');
*/
