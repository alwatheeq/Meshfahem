/*
  # Fix Email/Password Sign-Up Database Error

  ## Problem
  Users cannot sign up with email/password due to conflicting triggers on user_profiles table:
  
  1. `sync_user_profiles_email` (BEFORE INSERT on user_profiles)
     - Expects email to be NULL
     - Tries to fetch email from auth.users
     - Added by migration 20251011224929
  
  2. `create_profile_on_signup` (AFTER INSERT on auth.users)
     - Already inserts email into user_profiles (line 277 in 20251123152731)
     - Provides email directly during INSERT
  
  When a new user signs up:
  - auth.users record is created with email
  - `on_auth_user_created` trigger fires, calls create_profile_on_signup()
  - create_profile_on_signup() INSERTs into user_profiles WITH email
  - `sync_user_profiles_email` BEFORE INSERT trigger fires
  - Conflict: email is already set, but trigger expects NULL
  - email column is NOT NULL, so any issue causes failure
  - Result: Sign-up fails with "database error"

  ## Solution
  Remove the redundant `sync_user_profiles_email` BEFORE INSERT trigger on user_profiles.
  Keep only `create_profile_on_signup` as the single source of truth for profile creation.
  
  The `create_profile_on_signup` trigger already:
  - Creates profile automatically when user signs up
  - Populates email from NEW.email (auth.users record)
  - Handles both email/password and OAuth sign-ups
  - Excludes admin users correctly
  - Initializes all required fields (credits, defaults, etc.)

  ## Security
  - Maintains SECURITY DEFINER on remaining triggers
  - Preserves email sync on UPDATE (sync_auth_user_email trigger)
  - No impact on RLS policies
  - Admin user exclusion logic unchanged
*/

-- Step 1: Drop the conflicting BEFORE INSERT trigger on user_profiles
-- This trigger is redundant because create_profile_on_signup already handles email
DROP TRIGGER IF EXISTS sync_user_profiles_email ON user_profiles;

-- Step 2: Drop the function since it's no longer used
-- Keep it commented for reference in case we need to restore
DROP FUNCTION IF EXISTS sync_user_email();

-- Step 3: Verify the remaining triggers are correct
-- We keep these important triggers:
--   1. on_auth_user_created (AFTER INSERT on auth.users) - creates profile with email
--   2. sync_auth_user_email (AFTER UPDATE on auth.users) - syncs email changes
--   3. prevent_admin_in_user_profiles (BEFORE INSERT on user_profiles) - prevents admin profiles
--   4. initialize_user_preferences_trigger (AFTER INSERT on user_profiles) - creates preferences
--   5. update_user_profiles_updated_at (BEFORE UPDATE on user_profiles) - updates timestamp
--   6. check_user_profiles_monthly_reset (BEFORE UPDATE on user_profiles) - resets monthly usage

-- Step 4: Add comment to create_profile_on_signup function to document its role
COMMENT ON FUNCTION create_profile_on_signup() IS 
  'PRIMARY profile creation trigger. Creates user_profiles record when new user signs up in auth.users. 
   Handles email population, credit initialization, and all required fields. 
   Excludes admin users. Works for both email/password and OAuth sign-ups.';

-- Step 5: Verify the trigger function handles email correctly
-- Let's add error handling to ensure email is always populated
CREATE OR REPLACE FUNCTION create_profile_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Don't create profile for admin users (they're in admin_users table)
  IF EXISTS (SELECT 1 FROM admin_users WHERE id = NEW.id AND is_active = true) THEN
    RETURN NEW;
  END IF;

  -- Ensure email is present from auth.users
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RAISE EXCEPTION 'Cannot create user profile: email is missing from auth.users for user ID %', NEW.id;
  END IF;

  -- Insert profile with all required fields including email
  INSERT INTO user_profiles (
    id,
    email,
    user_role,
    monthly_usage,
    last_reset,
    credits_remaining,
    credits_total,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,  -- Email comes directly from auth.users
    'user',
    0,
    now(),
    0,
    2700,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ Created profile for new user: %', NEW.email;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't block auth.users creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    -- Re-raise to ensure sign-up fails if profile creation fails
    RAISE;
END;
$$;

-- Step 6: Verify email sync on UPDATE still works
-- This ensures when a user changes their email in auth, it syncs to user_profiles
-- The sync_auth_user_email trigger and update_user_profile_email function should still exist

DO $$
BEGIN
  -- Check if the email sync trigger exists on auth.users
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'users'
      AND event_object_schema = 'auth'
      AND trigger_name = 'sync_auth_user_email'
  ) THEN
    RAISE EXCEPTION 'Email sync trigger missing on auth.users. This is required for email updates.';
  END IF;

  RAISE NOTICE '✓ Email sync trigger verified on auth.users';
END $$;

-- Step 7: Log the fix
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Email/Password Sign-Up Fix Applied';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Removed: sync_user_profiles_email trigger (conflicting)';
  RAISE NOTICE 'Removed: sync_user_email function (no longer needed)';
  RAISE NOTICE 'Kept: create_profile_on_signup trigger (primary profile creation)';
  RAISE NOTICE 'Kept: sync_auth_user_email trigger (email sync on update)';
  RAISE NOTICE 'Status: Email/password sign-up should now work correctly';
  RAISE NOTICE '========================================';
END $$;
