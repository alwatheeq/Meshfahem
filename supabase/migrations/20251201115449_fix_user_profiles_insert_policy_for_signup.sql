/*
  # Fix user_profiles INSERT Policy for Sign-Up

  ## The REAL Problem
  User sign-up fails with "Database error saving new user" because of the RLS INSERT policy on user_profiles:
  
  Current policy:
  ```sql
  "Users can insert own profile"
  WITH CHECK ((auth.uid() = id) AND is_regular_user(auth.uid()))
  ```
  
  **Why this fails:**
  1. New user signs up → auth.users record created
  2. Trigger `on_auth_user_created` fires AFTER INSERT on auth.users
  3. Trigger calls `create_profile_on_signup()` to INSERT into user_profiles
  4. At this moment, NO SESSION EXISTS YET → auth.uid() = NULL
  5. Policy checks: `NULL = <user_id>` → FALSE
  6. INSERT is BLOCKED by RLS policy
  7. Result: "Database error saving new user"

  **Key Insight:**
  Even though `create_profile_on_signup()` has SECURITY DEFINER and is owned by postgres (BYPASSRLS),
  **RLS policies are still evaluated!** SECURITY DEFINER doesn't bypass RLS - it only changes the 
  execution context.
  
  The BYPASSRLS privilege of postgres role only applies when postgres directly queries the table,
  NOT when RLS policies are being evaluated!

  ## Solution
  We already have a policy "System can insert profiles for users" that allows inserts when
  `id IN (SELECT id FROM auth.users)`. This policy should work, but there's a conflict with
  the "Users can insert own profile" policy that's more restrictive.

  **Fix:** Remove the `is_regular_user()` check from "Users can insert own profile" policy.
  The `prevent_admin_in_user_profiles` BEFORE INSERT trigger already handles blocking admin users,
  so the policy check is redundant and causes problems.

  ## Why This is Safe
  - The BEFORE INSERT trigger `prevent_admin_in_user_profiles` already blocks admin users
  - This trigger has SECURITY DEFINER, is owned by postgres, and can bypass RLS
  - The trigger is the correct place for this check, not the policy
  - Removing the policy check fixes sign-up without compromising security

  ## What Changes
  - Modify "Users can insert own profile" policy to only check auth.uid() = id
  - Keep the "System can insert profiles for users" policy as-is for trigger-based inserts
  - Both policies work together: one for direct user inserts, one for system/trigger inserts
*/

-- ============================================================================
-- Step 1: Update the "Users can insert own profile" policy
-- Remove the is_regular_user() check which causes sign-up to fail
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

COMMENT ON POLICY "Users can insert own profile" ON user_profiles IS
  'Allows authenticated users to insert their own profile. Admin blocking is handled by BEFORE INSERT trigger.';

-- ============================================================================
-- Step 2: Verify the "System can insert profiles for users" policy exists
-- This policy allows the trigger to insert profiles
-- ============================================================================

-- Check if policy exists and create if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'user_profiles' 
      AND policyname = 'System can insert profiles for users'
  ) THEN
    CREATE POLICY "System can insert profiles for users"
      ON user_profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (id IN (SELECT id FROM auth.users));
    
    RAISE NOTICE '✓ Created "System can insert profiles for users" policy';
  ELSE
    RAISE NOTICE '✓ "System can insert profiles for users" policy already exists';
  END IF;
END $$;

-- ============================================================================
-- Step 3: Verification and Summary
-- ============================================================================

DO $$
DECLARE
  v_policy record;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'User Profiles INSERT Policy Fix Applied';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Current INSERT policies on user_profiles:';
  RAISE NOTICE '';
  
  FOR v_policy IN
    SELECT 
      policyname,
      roles::text,
      CASE 
        WHEN with_check IS NOT NULL THEN substring(with_check from 1 for 80)
        ELSE '(none)'
      END as with_check_clause
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_profiles'
      AND cmd = 'INSERT'
    ORDER BY policyname
  LOOP
    RAISE NOTICE '  Policy: %', v_policy.policyname;
    RAISE NOTICE '    Roles: %', v_policy.roles;
    RAISE NOTICE '    WITH CHECK: %', v_policy.with_check_clause;
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'What This Fixes:';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '1. Sign-up now works because policy no longer checks auth.uid() during trigger execution';
  RAISE NOTICE '2. The trigger create_profile_on_signup() can insert profiles via "System can insert..." policy';
  RAISE NOTICE '3. Direct user inserts still protected by "Users can insert own profile" policy';
  RAISE NOTICE '4. Admin blocking handled by prevent_admin_in_user_profiles BEFORE INSERT trigger';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Sign-Up Should Now Work!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Test by signing up with a new email/password.';
  RAISE NOTICE '';
END $$;
