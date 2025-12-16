/*
  # Defensive Profile Creation System - Option B Implementation

  ## Overview
  Implements a fail-safe, resilient profile creation system that NEVER blocks user signup,
  regardless of database schema state or missing columns.

  ## Core Philosophy
  - User signup ALWAYS succeeds
  - Profile creation uses minimal guaranteed columns
  - Optional features initialized separately
  - Comprehensive error handling
  - Multiple recovery paths
  - Graceful degradation

  ## Changes

  1. **Minimal Profile Creation Trigger**
     - Rewrites create_profile_on_signup() to insert ONLY guaranteed columns (id, email)
     - All other columns populated by database defaults
     - Comprehensive error handling with EXCEPTION block
     - Logs warnings instead of throwing errors
     - Always returns success to prevent blocking user creation

  2. **Updated RLS Policies**
     - Allows postgres role to INSERT during trigger execution
     - Removes session-dependent checks that fail during trigger context
     - Maintains security while enabling system operations

  3. **Column Existence Helpers**
     - Dynamic checking for optional columns
     - Returns feature availability flags
     - Used by application to enable/disable features

  4. **Profile Validation**
     - Function to check profile completeness
     - Returns list of missing optional fields
     - Used for health checks and monitoring

  ## Security
  - RLS policies remain enforced for user operations
  - System functions use SECURITY DEFINER with postgres ownership
  - Admin blocking handled by BEFORE INSERT trigger
  - No data exposure through error messages

  ## Use Cases Covered
  - Email/password signup
  - OAuth signup
  - Admin user creation (skipped correctly)
  - Incomplete migration state
  - Concurrent signups
  - Profile re-initialization
  - Schema evolution
*/

-- =====================================================================
-- STEP 1: Create Helper Functions
-- =====================================================================

-- Check if specific columns exist in user_profiles table
CREATE OR REPLACE FUNCTION column_exists(
  p_table_name text,
  p_column_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_column_name
  );
END;
$$;

COMMENT ON FUNCTION column_exists IS 'Check if a column exists in a table';

-- Get schema version and feature availability
CREATE OR REPLACE FUNCTION get_schema_version()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_features jsonb;
BEGIN
  v_features := jsonb_build_object(
    'base_profile', true,
    'email_column', column_exists('user_profiles', 'email'),
    'user_role_column', column_exists('user_profiles', 'user_role'),
    'credits_remaining', column_exists('user_profiles', 'credits_remaining'),
    'credits_total', column_exists('user_profiles', 'credits_total'),
    'credits_cycle_start', column_exists('user_profiles', 'credits_cycle_start'),
    'credits_cycle_end', column_exists('user_profiles', 'credits_cycle_end'),
    'free_credits_claimed', column_exists('user_profiles', 'free_credits_claimed'),
    'monthly_usage', column_exists('user_profiles', 'monthly_usage'),
    'last_reset', column_exists('user_profiles', 'last_reset')
  );

  RETURN jsonb_build_object(
    'schema_version', '2.0-defensive',
    'features', v_features,
    'checked_at', now()
  );
END;
$$;

COMMENT ON FUNCTION get_schema_version IS 'Returns database schema version and feature availability';

-- Validate profile completeness
CREATE OR REPLACE FUNCTION validate_profile_completeness(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_missing_fields text[] := ARRAY[]::text[];
  v_optional_fields text[] := ARRAY[]::text[];
BEGIN
  -- Check if profile exists
  SELECT * INTO v_profile
  FROM user_profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'exists', false,
      'complete', false,
      'missing_fields', ARRAY['profile'],
      'message', 'User profile does not exist'
    );
  END IF;

  -- Check email (required)
  IF column_exists('user_profiles', 'email') THEN
    IF v_profile.email IS NULL OR v_profile.email = '' THEN
      v_missing_fields := array_append(v_missing_fields, 'email');
    END IF;
  END IF;

  -- Check optional fields
  IF column_exists('user_profiles', 'user_role') THEN
    v_optional_fields := array_append(v_optional_fields, 'user_role');
  END IF;

  IF column_exists('user_profiles', 'credits_remaining') THEN
    v_optional_fields := array_append(v_optional_fields, 'credits_remaining');
  END IF;

  IF column_exists('user_profiles', 'credits_total') THEN
    v_optional_fields := array_append(v_optional_fields, 'credits_total');
  END IF;

  RETURN jsonb_build_object(
    'exists', true,
    'complete', array_length(v_missing_fields, 1) IS NULL,
    'missing_fields', COALESCE(v_missing_fields, ARRAY[]::text[]),
    'optional_fields', v_optional_fields,
    'user_id', p_user_id
  );
END;
$$;

COMMENT ON FUNCTION validate_profile_completeness IS 'Validates if user profile is complete and returns missing fields';

-- =====================================================================
-- STEP 2: Rewrite Profile Creation Trigger (Minimal & Defensive)
-- =====================================================================

CREATE OR REPLACE FUNCTION create_profile_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip profile creation for admin users (they're in admin_users table)
  BEGIN
    IF EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = NEW.id AND is_active = true
    ) THEN
      RAISE NOTICE '[PROFILE_CREATE] Skipping profile for admin user: %', NEW.id;
      RETURN NEW;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- If admin check fails, continue anyway (admin_users table might not exist yet)
      RAISE WARNING '[PROFILE_CREATE] Could not check admin status: %. Continuing with profile creation.', SQLERRM;
  END;

  -- Validate email is present
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RAISE WARNING '[PROFILE_CREATE] Email missing for user %. Using placeholder.', NEW.id;
  END IF;

  -- Insert minimal profile with ONLY guaranteed columns
  -- All other fields will be populated by database defaults or separate initialization
  BEGIN
    INSERT INTO user_profiles (id, email)
    VALUES (
      NEW.id,
      COALESCE(NEW.email, 'no-email@placeholder.local')
    )
    ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, user_profiles.email);

    RAISE NOTICE '[PROFILE_CREATE] ✓ Created minimal profile for user: % (%)', NEW.id, NEW.email;

  EXCEPTION
    WHEN unique_violation THEN
      -- Profile already exists, that's fine
      RAISE NOTICE '[PROFILE_CREATE] Profile already exists for user: %', NEW.id;

    WHEN undefined_column THEN
      -- Email column doesn't exist, use even more minimal insert
      RAISE WARNING '[PROFILE_CREATE] Email column missing. Creating profile with ID only: %', NEW.id;
      BEGIN
        INSERT INTO user_profiles (id)
        VALUES (NEW.id)
        ON CONFLICT (id) DO NOTHING;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING '[PROFILE_CREATE] Failed to create minimal profile: %', SQLERRM;
      END;

    WHEN OTHERS THEN
      -- Log error but DON'T block user creation
      RAISE WARNING '[PROFILE_CREATE] Profile creation failed for user %: %. User can still authenticate.',
        NEW.id, SQLERRM;
  END;

  -- Always return NEW to allow auth.users creation to succeed
  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Catch-all: Log and continue
    RAISE WARNING '[PROFILE_CREATE] Unexpected error in create_profile_on_signup for user %: %',
      NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Set function owner to postgres for BYPASSRLS
ALTER FUNCTION create_profile_on_signup() OWNER TO postgres;

COMMENT ON FUNCTION create_profile_on_signup IS
  'Minimal, defensive profile creation. Inserts only guaranteed columns (id, email).
   Never blocks user signup. All optional fields initialized separately.';

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_profile_on_signup();

-- =====================================================================
-- STEP 3: Update RLS Policies for Trigger Compatibility
-- =====================================================================

-- Drop and recreate INSERT policies to work with trigger execution
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "System can insert profiles for users" ON user_profiles;

-- Policy 1: For direct user inserts (when auth.uid() is available)
CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

COMMENT ON POLICY "Users can insert own profile" ON user_profiles IS
  'Allows authenticated users to insert their own profile directly. Used when user manually creates profile.';

-- Policy 2: For system/trigger inserts (when auth.uid() is NULL)
-- This policy allows INSERTs when the user exists in auth.users, regardless of session
CREATE POLICY "System can insert profiles for users"
  ON user_profiles
  FOR INSERT
  WITH CHECK (
    -- Allow if user exists in auth.users
    -- This check doesn't depend on auth.uid() so it works during trigger execution
    id IN (SELECT id FROM auth.users)
  );

COMMENT ON POLICY "System can insert profiles for users" ON user_profiles IS
  'Allows system triggers to insert profiles when auth.uid() is NULL.
   Used by create_profile_on_signup() trigger during user registration.';

-- =====================================================================
-- STEP 4: Verification and Summary
-- =====================================================================

DO $$
DECLARE
  v_policy record;
  v_trigger record;
  v_schema_version jsonb;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Defensive Profile Creation System';
  RAISE NOTICE 'Option B Implementation';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';

  -- Show current INSERT policies
  RAISE NOTICE 'INSERT Policies on user_profiles:';
  FOR v_policy IN
    SELECT
      policyname,
      roles::text,
      CASE
        WHEN with_check IS NOT NULL
        THEN substring(with_check from 1 for 100)
        ELSE '(none)'
      END as with_check_clause
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_profiles'
      AND cmd = 'INSERT'
    ORDER BY policyname
  LOOP
    RAISE NOTICE '  ✓ %', v_policy.policyname;
    RAISE NOTICE '    Roles: %', v_policy.roles;
    RAISE NOTICE '    CHECK: %', v_policy.with_check_clause;
    RAISE NOTICE '';
  END LOOP;

  -- Show triggers
  RAISE NOTICE 'Triggers on auth.users:';
  FOR v_trigger IN
    SELECT
      trigger_name,
      action_timing,
      event_manipulation
    FROM information_schema.triggers
    WHERE event_object_schema = 'auth'
      AND event_object_table = 'users'
      AND trigger_name = 'on_auth_user_created'
  LOOP
    RAISE NOTICE '  ✓ % (% %)', v_trigger.trigger_name, v_trigger.action_timing, v_trigger.event_manipulation;
  END LOOP;
  RAISE NOTICE '';

  -- Show schema version
  v_schema_version := get_schema_version();
  RAISE NOTICE 'Schema Version: %', v_schema_version->>'schema_version';
  RAISE NOTICE 'Available Features:';
  RAISE NOTICE '  Base Profile: %', v_schema_version->'features'->>'base_profile';
  RAISE NOTICE '  Email Column: %', v_schema_version->'features'->>'email_column';
  RAISE NOTICE '  User Role: %', v_schema_version->'features'->>'user_role_column';
  RAISE NOTICE '  Credits System: %', v_schema_version->'features'->>'credits_remaining';
  RAISE NOTICE '';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Key Improvements:';
  RAISE NOTICE '========================================';
  RAISE NOTICE '1. Profile creation never blocks signup';
  RAISE NOTICE '2. Works with incomplete migrations';
  RAISE NOTICE '3. Comprehensive error handling';
  RAISE NOTICE '4. Multiple recovery paths';
  RAISE NOTICE '5. Feature availability checking';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Signup Should Now Work Reliably!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Test by signing up with a new email/password.';
  RAISE NOTICE 'Profile will be created with minimal fields.';
  RAISE NOTICE 'Optional features will be initialized separately.';
  RAISE NOTICE '';
END $$;
