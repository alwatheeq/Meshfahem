/*
  # Fix Credit Initialization - Column Name Conflict Resolution

  ## Issues Fixed
  1. Column name mismatch: notified_at_30_percent/10_percent vs notified_at_1000/500/250
  2. Credits not initialized when subscription created (0 credits instead of 2700)
  3. Missing user profiles causing "profile.load_error"
  4. Trigger failures preventing automatic credit allocation

  ## Changes Made
  1. Drop old notification columns (notified_at_30_percent, notified_at_10_percent)
  2. Ensure new notification columns exist (notified_at_1000, notified_at_500, notified_at_250)
  3. Recreate initialize_subscription_credits() function with correct column names
  4. Enhance safe_create_subscription() to automatically initialize credits
  5. Add automatic profile creation trigger for new users (excluding admins)
  6. Backfill missing user profiles (excluding admins)
  7. Backfill users with active subscriptions but 0 credits

  ## Security
  - All functions maintain SECURITY DEFINER for proper permissions
  - RLS policies unchanged
  - Admin users excluded from user_profiles (managed separately in admin_users table)
  - No breaking changes to existing functionality
*/

-- =====================================================================
-- STEP 1: Fix Column Names - Remove Old, Ensure New Exist
-- =====================================================================

DO $$
BEGIN
  -- Drop old percentage-based notification columns
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'notified_at_30_percent'
  ) THEN
    ALTER TABLE user_profiles DROP COLUMN notified_at_30_percent;
    RAISE NOTICE '✓ Dropped old column: notified_at_30_percent';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'notified_at_10_percent'
  ) THEN
    ALTER TABLE user_profiles DROP COLUMN notified_at_10_percent;
    RAISE NOTICE '✓ Dropped old column: notified_at_10_percent';
  END IF;
END $$;

-- Ensure new credit-based notification columns exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'notified_at_1000'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN notified_at_1000 boolean NOT NULL DEFAULT false;
    COMMENT ON COLUMN user_profiles.notified_at_1000 IS 'User notified when credits drop below 1000';
    RAISE NOTICE '✓ Created column: notified_at_1000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'notified_at_500'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN notified_at_500 boolean NOT NULL DEFAULT false;
    COMMENT ON COLUMN user_profiles.notified_at_500 IS 'User notified when credits drop below 500';
    RAISE NOTICE '✓ Created column: notified_at_500';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'notified_at_250'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN notified_at_250 boolean NOT NULL DEFAULT false;
    COMMENT ON COLUMN user_profiles.notified_at_250 IS 'User notified when credits drop below 250';
    RAISE NOTICE '✓ Created column: notified_at_250';
  END IF;
END $$;

-- =====================================================================
-- STEP 2: Recreate initialize_subscription_credits with CORRECT Columns
-- =====================================================================

CREATE OR REPLACE FUNCTION initialize_subscription_credits(
  p_user_id uuid,
  p_subscription_tier text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_credits integer;
  v_subscription record;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
BEGIN
  -- Get current credit balance
  SELECT credits_remaining INTO v_current_credits
  FROM user_profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User profile not found',
      'user_id', p_user_id
    );
  END IF;

  -- Only initialize if credits are currently 0 (don't reset existing credits)
  IF v_current_credits > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Credits already initialized',
      'credits_remaining', v_current_credits,
      'skipped', true
    );
  END IF;

  -- Get the user's active subscription to determine cycle dates
  SELECT *
  INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Use subscription's billing cycle dates if available
    v_cycle_start := COALESCE(v_subscription.billing_cycle_start, v_subscription.start_date, now());
    v_cycle_end := COALESCE(v_subscription.billing_cycle_end, v_cycle_start + interval '30 days');
  ELSE
    -- No active subscription found, use default 30-day cycle
    v_cycle_start := now();
    v_cycle_end := now() + interval '30 days';
  END IF;

  -- Initialize credits with CORRECT column names
  UPDATE user_profiles
  SET
    credits_remaining = 2700,
    credits_total = 2700,
    credits_cycle_start = v_cycle_start,
    credits_cycle_end = v_cycle_end,
    notified_at_1000 = false,
    notified_at_500 = false,
    notified_at_250 = false
  WHERE id = p_user_id;

  RAISE NOTICE '✓ Initialized 2700 credits for user: %', p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Credits initialized successfully',
    'user_id', p_user_id,
    'credits_remaining', 2700,
    'credits_total', 2700,
    'cycle_start', v_cycle_start,
    'cycle_end', v_cycle_end
  );
END;
$$;

COMMENT ON FUNCTION initialize_subscription_credits IS 'Initialize 2700 credits for a user when they subscribe. Uses correct notification columns (notified_at_1000/500/250).';

-- =====================================================================
-- STEP 3: Enhance safe_create_subscription to Initialize Credits
-- =====================================================================

CREATE OR REPLACE FUNCTION safe_create_subscription(
  p_user_id uuid,
  p_subscription_tier text,
  p_end_date timestamptz,
  p_trial_end_date timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription_id uuid;
  v_is_admin boolean;
  v_credit_result jsonb;
BEGIN
  -- Ensure user has profile
  PERFORM ensure_user_profile(p_user_id);

  -- Check if user is admin (admins might not need subscriptions)
  SELECT user_role = 'admin' INTO v_is_admin
  FROM user_profiles
  WHERE id = p_user_id;

  -- Cancel any existing active subscriptions for this user
  UPDATE subscriptions
  SET status = 'canceled',
      canceled_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id
    AND status = 'active';

  -- Create new subscription
  INSERT INTO subscriptions (
    user_id,
    subscription_tier,
    status,
    start_date,
    end_date,
    trial_end_date,
    auto_renew,
    payment_method_saved,
    billing_cycle_start,
    billing_cycle_end
  ) VALUES (
    p_user_id,
    p_subscription_tier,
    'active',
    now(),
    p_end_date,
    p_trial_end_date,
    false,
    false,
    now(),
    now() + interval '30 days'
  )
  RETURNING id INTO v_subscription_id;

  RAISE NOTICE '✓ Created subscription % for user % (tier: %)', v_subscription_id, p_user_id, p_subscription_tier;

  -- NEW: Initialize credits immediately (don't rely only on trigger)
  SELECT initialize_subscription_credits(p_user_id, p_subscription_tier)
  INTO v_credit_result;

  IF (v_credit_result->>'success')::boolean = true THEN
    RAISE NOTICE '✓ Credits initialized: %', v_credit_result->>'message';
  ELSE
    RAISE WARNING '⚠ Credit initialization warning: %', v_credit_result->>'error';
    -- Don't fail subscription creation if credits fail - trigger might still work
  END IF;

  RETURN v_subscription_id;
END;
$$;

COMMENT ON FUNCTION safe_create_subscription IS 'Safely create subscription with automatic credit initialization. Works in FREE mode (no payment processing).';

-- =====================================================================
-- STEP 4: Add Automatic Profile Creation Trigger
-- =====================================================================

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
    NEW.email,
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
END;
$$;

-- Drop old trigger if exists and create new one
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_profile_on_signup();

COMMENT ON FUNCTION create_profile_on_signup IS 'Automatically create user profile when new user signs up (excludes admin users)';

-- =====================================================================
-- STEP 5: Backfill Missing User Profiles (excluding admin users)
-- =====================================================================

DO $$
DECLARE
  v_created_count integer := 0;
BEGIN
  RAISE NOTICE '--- Backfilling Missing User Profiles ---';

  WITH inserted AS (
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
    )
    SELECT
      u.id,
      u.email,
      'user',
      0,
      now(),
      0,
      2700,
      now(),
      now()
    FROM auth.users u
    LEFT JOIN user_profiles up ON u.id = up.id
    LEFT JOIN admin_users au ON u.id = au.id
    WHERE up.id IS NULL
      AND (au.id IS NULL OR au.is_active = false)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_created_count FROM inserted;

  IF v_created_count > 0 THEN
    RAISE NOTICE '✓ Created % missing user profiles', v_created_count;
  ELSE
    RAISE NOTICE '✓ All non-admin users already have profiles';
  END IF;
END $$;

-- =====================================================================
-- STEP 6: Backfill Users with Active Subscriptions but 0 Credits
-- =====================================================================

DO $$
DECLARE
  v_user record;
  v_result jsonb;
  v_fixed_count integer := 0;
  v_skipped_count integer := 0;
  v_error_count integer := 0;
BEGIN
  RAISE NOTICE '--- Backfilling Credits for Active Subscribers ---';

  FOR v_user IN
    SELECT DISTINCT
      up.id,
      s.subscription_tier,
      up.credits_remaining,
      s.start_date
    FROM subscriptions s
    INNER JOIN user_profiles up ON up.id = s.user_id
    WHERE s.status = 'active'
      AND s.end_date > now()
      AND up.credits_remaining = 0
    ORDER BY s.start_date ASC
  LOOP
    BEGIN
      -- Initialize credits for this user
      SELECT initialize_subscription_credits(v_user.id, v_user.subscription_tier)
      INTO v_result;

      IF (v_result->>'success')::boolean = true THEN
        IF COALESCE((v_result->>'skipped')::boolean, false) = false THEN
          v_fixed_count := v_fixed_count + 1;
          RAISE NOTICE '  ✓ Fixed user % (tier: %) - now has 2700 credits',
            v_user.id, v_user.subscription_tier;
        ELSE
          v_skipped_count := v_skipped_count + 1;
        END IF;
      ELSE
        v_error_count := v_error_count + 1;
        RAISE WARNING '  ✗ Failed for user %: %', v_user.id, v_result->>'error';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING '  ✗ Exception for user %: %', v_user.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '=====================================';
  RAISE NOTICE 'BACKFILL COMPLETE';
  RAISE NOTICE '  Fixed: % users', v_fixed_count;
  RAISE NOTICE '  Skipped: % users', v_skipped_count;
  RAISE NOTICE '  Errors: % users', v_error_count;
  RAISE NOTICE '=====================================';
END $$;

-- =====================================================================
-- STEP 7: Final Verification and Status Report
-- =====================================================================

DO $$
DECLARE
  v_total_users integer;
  v_admin_users integer;
  v_regular_users integer;
  v_users_with_profiles integer;
  v_active_subscriptions integer;
  v_users_with_credits integer;
  v_users_with_zero_credits integer;
  v_column_check_old text;
  v_column_check_new text;
BEGIN
  RAISE NOTICE '=====================================';
  RAISE NOTICE 'FINAL VERIFICATION REPORT';
  RAISE NOTICE '=====================================';

  -- Count users
  SELECT COUNT(*) INTO v_total_users FROM auth.users;
  SELECT COUNT(*) INTO v_admin_users FROM admin_users WHERE is_active = true;
  v_regular_users := v_total_users - v_admin_users;
  SELECT COUNT(*) INTO v_users_with_profiles FROM user_profiles;

  RAISE NOTICE 'Total auth users: %', v_total_users;
  RAISE NOTICE 'Admin users: %', v_admin_users;
  RAISE NOTICE 'Regular users: %', v_regular_users;
  RAISE NOTICE 'Users with profiles: %', v_users_with_profiles;

  IF v_regular_users = v_users_with_profiles THEN
    RAISE NOTICE '  ✓ All regular users have profiles';
  ELSE
    RAISE WARNING '  ✗ % regular users missing profiles!', (v_regular_users - v_users_with_profiles);
  END IF;

  RAISE NOTICE '-------------------------------------';

  -- Count subscriptions
  SELECT COUNT(DISTINCT user_id)
  INTO v_active_subscriptions
  FROM subscriptions
  WHERE status = 'active' AND end_date > now();

  RAISE NOTICE 'Active subscriptions: %', v_active_subscriptions;

  -- Count users with credits
  SELECT COUNT(DISTINCT up.id)
  INTO v_users_with_credits
  FROM user_profiles up
  INNER JOIN subscriptions s ON s.user_id = up.id
  WHERE s.status = 'active'
    AND s.end_date > now()
    AND up.credits_remaining > 0;

  -- Count users with 0 credits
  SELECT COUNT(DISTINCT up.id)
  INTO v_users_with_zero_credits
  FROM user_profiles up
  INNER JOIN subscriptions s ON s.user_id = up.id
  WHERE s.status = 'active'
    AND s.end_date > now()
    AND up.credits_remaining = 0;

  RAISE NOTICE 'Subscribers with credits: %', v_users_with_credits;
  RAISE NOTICE 'Subscribers with 0 credits: %', v_users_with_zero_credits;

  IF v_users_with_zero_credits = 0 THEN
    RAISE NOTICE '  ✓ All subscribers have credits!';
  ELSE
    RAISE WARNING '  ✗ % subscribers still have 0 credits!', v_users_with_zero_credits;
  END IF;

  RAISE NOTICE '-------------------------------------';

  -- Check column status
  SELECT column_name INTO v_column_check_old
  FROM information_schema.columns
  WHERE table_name = 'user_profiles'
    AND column_name IN ('notified_at_30_percent', 'notified_at_10_percent')
  LIMIT 1;

  SELECT column_name INTO v_column_check_new
  FROM information_schema.columns
  WHERE table_name = 'user_profiles'
    AND column_name = 'notified_at_1000'
  LIMIT 1;

  IF v_column_check_old IS NULL THEN
    RAISE NOTICE '  ✓ Old notification columns removed';
  ELSE
    RAISE WARNING '  ✗ Old column still exists: %', v_column_check_old;
  END IF;

  IF v_column_check_new IS NOT NULL THEN
    RAISE NOTICE '  ✓ New notification columns exist';
  ELSE
    RAISE WARNING '  ✗ New notification columns missing!';
  END IF;

  RAISE NOTICE '=====================================';
  RAISE NOTICE 'MIGRATION COMPLETE';
  RAISE NOTICE '=====================================';
END $$;
