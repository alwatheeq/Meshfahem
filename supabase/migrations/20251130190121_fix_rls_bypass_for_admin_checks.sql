/*
  # Fix RLS Bypass for Admin Check Functions

  ## Problem
  User sign-up fails with "Database error saving new user" (500 Internal Server Error) because:
  
  1. When a new user signs up, the trigger `create_profile_on_signup()` fires
  2. This function checks `admin_users` table: `EXISTS (SELECT 1 FROM admin_users WHERE id = NEW.id ...)`
  3. Even though the function has `SECURITY DEFINER`, this does NOT bypass RLS in PostgreSQL
  4. The `admin_users` table has RLS policy: "Only admins can view admin users" USING (is_admin_user())
  5. The policy blocks the SELECT query because the new user is not authenticated yet
  6. Result: Permission denied → 500 Internal Server Error → Sign-up fails

  ## Root Cause
  SECURITY DEFINER changes the execution context (runs as function owner) but does NOT bypass RLS.
  RLS policies are enforced regardless of SECURITY DEFINER.
  
  To bypass RLS, the function must be owned by a role with BYPASSRLS privilege (like postgres superuser).

  ## Solution
  Change the owner of all admin-checking functions to 'postgres' role.
  The postgres superuser role has BYPASSRLS privilege, which allows these functions to:
  - Query admin_users table without RLS blocking them
  - Still maintain SECURITY DEFINER security (runs as postgres, not as caller)
  - Only check existence (never expose admin data to users)

  ## Security Considerations
  - Functions remain SECURITY DEFINER (secure execution context)
  - Functions only check IF a user_id exists in admin_users (boolean result)
  - No admin data (emails, notes) is ever returned to callers
  - RLS policies on admin_users remain intact for all other queries
  - Only these specific system functions bypass RLS for their internal checks

  ## Functions Updated
  1. create_profile_on_signup() - Creates user profile on signup (excludes admins)
  2. prevent_admin_user_profile() - Prevents admin users from having user_profiles
  3. prevent_admin_subscription() - Prevents admin users from having subscriptions
  4. is_admin_user() - Helper functions to check admin status
  5. get_admin_user_info() - Gets admin information
  6. update_admin_last_login() - Updates admin login timestamp
  7. is_regular_user() - Checks if user is regular (not admin)
*/

-- ============================================================================
-- Change ownership of admin-checking functions to postgres
-- This grants BYPASSRLS privilege, allowing them to query admin_users
-- ============================================================================

-- Core trigger functions that check admin_users during sign-up
ALTER FUNCTION create_profile_on_signup() OWNER TO postgres;
ALTER FUNCTION prevent_admin_user_profile() OWNER TO postgres;
ALTER FUNCTION prevent_admin_subscription() OWNER TO postgres;

-- Helper functions used by policies and application code
ALTER FUNCTION is_admin_user() OWNER TO postgres;
ALTER FUNCTION is_admin_user(uuid) OWNER TO postgres;
ALTER FUNCTION get_admin_user_info(uuid) OWNER TO postgres;
ALTER FUNCTION update_admin_last_login(uuid) OWNER TO postgres;
ALTER FUNCTION is_regular_user(uuid) OWNER TO postgres;

-- ============================================================================
-- Verify the changes
-- ============================================================================

DO $$
DECLARE
  v_function_count integer;
  v_function record;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RLS Bypass Fix Applied';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions now owned by postgres (BYPASSRLS):';
  RAISE NOTICE '';
  
  FOR v_function IN
    SELECT 
      p.proname as function_name,
      pg_get_userbyid(p.proowner) as owner,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END as security
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_profile_on_signup',
        'prevent_admin_user_profile',
        'prevent_admin_subscription',
        'is_admin_user',
        'get_admin_user_info',
        'update_admin_last_login',
        'is_regular_user'
      )
    ORDER BY p.proname
  LOOP
    RAISE NOTICE '  ✓ % - Owner: %, Security: %', 
      v_function.function_name, 
      v_function.owner, 
      v_function.security;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Sign-up should now work correctly!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'What this fixes:';
  RAISE NOTICE '  1. New users can sign up with email/password';
  RAISE NOTICE '  2. Profile creation no longer blocked by RLS';
  RAISE NOTICE '  3. Admin checks work during trigger execution';
  RAISE NOTICE '  4. RLS policies on admin_users remain secure';
  RAISE NOTICE '';
  RAISE NOTICE 'Test by signing up with a new email address.';
  RAISE NOTICE '========================================';
END $$;
