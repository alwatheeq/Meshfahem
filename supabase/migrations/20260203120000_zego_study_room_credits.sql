/*
  # Zego Study Room Credits and Dual Credit Pools (Phase 1)

  1. user_profiles: add zego_credits_remaining, zego_credits_total (1000/month)
  2. Tool pool: 1500/month (replace 2700 everywhere in cycle refresh and init)
  3. Same cycle (credits_cycle_start/end) for both pools; no rollover
  4. RPCs: get_user_credit_balance (extend with Zego), can_use_study_room,
     deduct_zego_credits_atomic, record_study_room_usage_and_deduct, force_leave_study_rooms
  5. Trigger on study_room_participants: when left_at set, deduct Zego by minutes
*/

-- =====================================================================
-- STEP 1: Add Zego credit columns to user_profiles
-- =====================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS zego_credits_remaining integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zego_credits_total integer NOT NULL DEFAULT 1000;

-- Backfill Zego credits for existing users with active subscription (same cycle as tool)
UPDATE user_profiles up
SET
  zego_credits_remaining = 1000,
  zego_credits_total = 1000
WHERE EXISTS (
  SELECT 1 FROM subscriptions s
  WHERE s.user_id = up.id
    AND s.status = 'active'
    AND s.end_date > now()
)
  AND up.credits_cycle_end IS NOT NULL
  AND up.credits_cycle_end > now();

-- Users without active subscription or expired cycle: Zego stays 0/1000 (default)

-- =====================================================================
-- STEP 2: refresh_billing_cycle_if_expired — tool 1500, Zego 1000
-- =====================================================================

CREATE OR REPLACE FUNCTION refresh_billing_cycle_if_expired(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription_id uuid;
  v_current_cycle_end timestamptz;
  v_new_cycle_start timestamptz;
  v_new_cycle_end timestamptz;
  v_subscription_tier text;
  v_end_date timestamptz;
  v_cycles_advanced integer := 0;
BEGIN
  PERFORM check_subscription_expiration();

  SELECT id, billing_cycle_end, subscription_tier, end_date
  INTO v_subscription_id, v_current_cycle_end, v_subscription_tier, v_end_date
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_subscription_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No active subscription found'
    );
  END IF;

  IF v_current_cycle_end IS NULL OR now() > v_current_cycle_end THEN
    IF v_subscription_tier IN ('monthly', 'quarterly', 'biannual') THEN
      v_cycles_advanced := GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (now() - v_current_cycle_end)) / (30 * 24 * 60 * 60)) + 1);
      v_new_cycle_start := v_current_cycle_end;
      v_new_cycle_end := v_current_cycle_end + (interval '30 days' * v_cycles_advanced);
      IF v_new_cycle_end > v_end_date THEN
        v_new_cycle_end := v_end_date;
      END IF;

      UPDATE subscriptions
      SET
        billing_cycle_start = v_new_cycle_start,
        billing_cycle_end = v_new_cycle_end,
        tokens_used_current_cycle = 0,
        updated_at = now()
      WHERE id = v_subscription_id;

      -- Tool pool 1500, Zego pool 1000 (no rollover)
      UPDATE user_profiles
      SET
        credits_remaining = 1500,
        credits_total = 1500,
        zego_credits_remaining = 1000,
        zego_credits_total = 1000,
        credits_cycle_start = v_new_cycle_start,
        credits_cycle_end = v_new_cycle_end,
        notified_at_1000 = false,
        notified_at_500 = false,
        notified_at_250 = false
      WHERE id = p_user_id;

      RAISE NOTICE '[CYCLE_REFRESH] Billing cycle refreshed for subscription % (user %): tool=1500, zego=1000', 
        v_subscription_id, p_user_id;

      RETURN jsonb_build_object(
        'success', true,
        'message', 'Billing cycle refreshed and credits refilled',
        'cycles_advanced', v_cycles_advanced,
        'new_cycle_start', v_new_cycle_start,
        'new_cycle_end', v_new_cycle_end,
        'credits_refreshed', true
      );
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Trial subscription - cycle does not refresh'
      );
    END IF;
  ELSE
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Cycle not expired',
      'credits_refreshed', false
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION refresh_billing_cycle_if_expired IS 'Refreshes billing cycle for active subscriptions. Sets tool credits to 1500 and Zego credits to 1000. Only works for active subscriptions (end_date > now()).';

-- =====================================================================
-- STEP 3: get_user_credit_balance — return tool + Zego
-- =====================================================================

CREATE OR REPLACE FUNCTION get_user_credit_balance(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance record;
  v_has_active_subscription boolean := false;
  v_subscription record;
  v_refresh_result jsonb;
BEGIN
  PERFORM check_subscription_expiration();
  v_refresh_result := refresh_billing_cycle_if_expired(p_user_id);

  SELECT
    credits_remaining,
    credits_total,
    credits_cycle_start,
    credits_cycle_end,
    free_credits_claimed,
    COALESCE(zego_credits_remaining, 0) AS zego_credits_remaining,
    COALESCE(zego_credits_total, 1000) AS zego_credits_total
  INTO v_balance
  FROM user_profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  SELECT *
  INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_has_active_subscription := true;
  END IF;

  IF NOT v_has_active_subscription THEN
    RETURN jsonb_build_object(
      'success', true,
      'credits_remaining', 0,
      'credits_total', 0,
      'cycle_start', v_balance.credits_cycle_start,
      'cycle_end', v_balance.credits_cycle_end,
      'free_credits_claimed', v_balance.free_credits_claimed,
      'subscription_expired', true,
      'refreshed', (v_refresh_result->>'success')::boolean,
      'zego_credits_remaining', 0,
      'zego_credits_total', 1000
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'credits_remaining', COALESCE(v_balance.credits_remaining, 0),
    'credits_total', COALESCE(v_balance.credits_total, 0),
    'cycle_start', v_balance.credits_cycle_start,
    'cycle_end', v_balance.credits_cycle_end,
    'free_credits_claimed', v_balance.free_credits_claimed,
    'subscription_expired', false,
    'refreshed', (v_refresh_result->>'success')::boolean,
    'zego_credits_remaining', v_balance.zego_credits_remaining,
    'zego_credits_total', v_balance.zego_credits_total
  );
END;
$$;

COMMENT ON FUNCTION get_user_credit_balance IS 'Get current credit balance (tool + Zego). Refreshes cycles before return. Returns 0 credits if subscription expired.';

-- =====================================================================
-- STEP 4: initialize_subscription_credits — tool 1500, Zego 1000
-- =====================================================================

CREATE OR REPLACE FUNCTION initialize_subscription_credits(
  p_user_id uuid,
  p_subscription_tier text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_credits integer;
  v_subscription record;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_profile_exists boolean;
  v_is_renewal boolean := false;
  v_credits_cycle_end timestamptz;
  v_should_refill boolean := false;
BEGIN
  SELECT EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id) INTO v_profile_exists;

  IF NOT v_profile_exists THEN
    BEGIN
      PERFORM ensure_user_profile(p_user_id);
      PERFORM pg_sleep(0.1);
    EXCEPTION
      WHEN OTHERS THEN
        BEGIN
          PERFORM create_missing_profile(p_user_id, (SELECT email FROM auth.users WHERE id = p_user_id LIMIT 1));
        EXCEPTION
          WHEN OTHERS THEN
            RETURN jsonb_build_object(
              'success', false,
              'error', 'User profile not found and could not be created',
              'user_id', p_user_id,
              'details', SQLERRM
            );
        END;
    END;
  END IF;

  SELECT COALESCE(credits_remaining, 0), credits_cycle_end
  INTO v_current_credits, v_credits_cycle_end
  FROM user_profiles
  WHERE id = p_user_id;

  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = p_user_id
      AND status = 'canceled'
      AND canceled_at > now() - interval '5 minutes'
  ) INTO v_is_renewal;

  v_should_refill := (
    v_current_credits IS NULL OR
    v_current_credits = 0 OR
    v_is_renewal OR
    (v_credits_cycle_end IS NOT NULL AND v_credits_cycle_end < now())
  );

  IF NOT v_should_refill THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Credits already initialized and cycle not expired',
      'credits_remaining', v_current_credits,
      'skipped', true,
      'reason', 'Credits exist and no renewal detected'
    );
  END IF;

  SELECT *
  INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_cycle_start := COALESCE(v_subscription.billing_cycle_start, v_subscription.start_date, now());
    v_cycle_end := COALESCE(v_subscription.billing_cycle_end, v_subscription.end_date, v_cycle_start + interval '30 days');
  ELSE
    v_cycle_start := now();
    v_cycle_end := now() + interval '30 days';
  END IF;

  -- Tool 1500, Zego 1000
  UPDATE user_profiles
  SET
    credits_remaining = 1500,
    credits_total = 1500,
    zego_credits_remaining = 1000,
    zego_credits_total = 1000,
    credits_cycle_start = v_cycle_start,
    credits_cycle_end = v_cycle_end,
    notified_at_30_percent = false,
    notified_at_10_percent = false
  WHERE id = p_user_id;

  RAISE NOTICE '[CREDIT_INIT] Tool=1500, Zego=1000 for user: %', p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE
      WHEN v_is_renewal THEN 'Credits refilled on renewal'
      WHEN v_current_credits IS NULL OR v_current_credits = 0 THEN 'Credits initialized for new subscription'
      WHEN v_credits_cycle_end IS NOT NULL AND v_credits_cycle_end < now() THEN 'Credits refilled - billing cycle expired'
      ELSE 'Credits refilled'
    END,
    'user_id', p_user_id,
    'credits_remaining', 1500,
    'credits_total', 1500,
    'zego_credits_remaining', 1000,
    'zego_credits_total', 1000,
    'cycle_start', v_cycle_start,
    'cycle_end', v_cycle_end,
    'is_renewal', v_is_renewal,
    'previous_credits', v_current_credits
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[CREDIT_INIT] Error initializing credits for user %: %', p_user_id, SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'user_id', p_user_id
    );
END;
$$;

COMMENT ON FUNCTION initialize_subscription_credits IS 'Initialize/refill tool credits (1500) and Zego credits (1000) on subscribe/renew.';

GRANT EXECUTE ON FUNCTION initialize_subscription_credits(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_subscription_credits(uuid, text) TO service_role;

-- =====================================================================
-- STEP 5: initialize_user_defaults — tool 1500, Zego 1000 when with subscription
-- =====================================================================

CREATE OR REPLACE FUNCTION initialize_user_defaults(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_initialized jsonb := '{}'::jsonb;
  v_user_role text;
  v_credits_remaining integer;
  v_has_subscription boolean;
  v_has_credits_remaining boolean;
  v_has_credits_total boolean;
  v_has_cycle_start boolean;
  v_has_cycle_end boolean;
  v_has_zego boolean;
BEGIN
  RAISE NOTICE '[INIT_DEFAULTS] Starting initialization for user: %', p_user_id;

  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Profile does not exist',
      'user_id', p_user_id
    );
  END IF;

  v_has_credits_remaining := column_exists('user_profiles', 'credits_remaining');
  v_has_credits_total := column_exists('user_profiles', 'credits_total');
  v_has_cycle_start := column_exists('user_profiles', 'credits_cycle_start');
  v_has_cycle_end := column_exists('user_profiles', 'credits_cycle_end');
  v_has_zego := column_exists('user_profiles', 'zego_credits_remaining');

  IF column_exists('user_profiles', 'user_role') THEN
    BEGIN
      SELECT user_role INTO v_user_role
      FROM user_profiles
      WHERE id = p_user_id;

      IF v_user_role IS NULL THEN
        UPDATE user_profiles
        SET user_role = 'user'
        WHERE id = p_user_id;
        v_initialized := jsonb_set(v_initialized, '{user_role}', '"initialized"'::jsonb);
        RAISE NOTICE '[INIT_DEFAULTS] ✓ Initialized user_role for %', p_user_id;
      ELSE
        v_initialized := jsonb_set(v_initialized, '{user_role}', '"already_set"'::jsonb);
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_initialized := jsonb_set(v_initialized, '{user_role}', to_jsonb('error: ' || SQLERRM));
        RAISE WARNING '[INIT_DEFAULTS] Could not initialize user_role: %', SQLERRM;
    END;
  ELSE
    v_initialized := jsonb_set(v_initialized, '{user_role}', '"column_missing"'::jsonb);
  END IF;

  IF v_has_credits_remaining AND v_has_credits_total THEN
    BEGIN
      SELECT credits_remaining INTO v_credits_remaining
      FROM user_profiles
      WHERE id = p_user_id;

      IF v_credits_remaining IS NULL OR v_credits_remaining = 0 THEN
        SELECT EXISTS (
          SELECT 1 FROM subscriptions
          WHERE user_id = p_user_id
            AND status = 'active'
            AND end_date > now()
        ) INTO v_has_subscription;

        IF v_has_subscription THEN
          IF v_has_cycle_start AND v_has_cycle_end THEN
            IF v_has_zego THEN
              UPDATE user_profiles
              SET
                credits_remaining = 1500,
                credits_total = 1500,
                zego_credits_remaining = 1000,
                zego_credits_total = 1000,
                credits_cycle_start = COALESCE(credits_cycle_start, now()),
                credits_cycle_end = COALESCE(credits_cycle_end, now() + interval '30 days')
              WHERE id = p_user_id;
            ELSE
              UPDATE user_profiles
              SET
                credits_remaining = 1500,
                credits_total = 1500,
                credits_cycle_start = COALESCE(credits_cycle_start, now()),
                credits_cycle_end = COALESCE(credits_cycle_end, now() + interval '30 days')
              WHERE id = p_user_id;
            END IF;
          ELSE
            IF v_has_zego THEN
              UPDATE user_profiles
              SET credits_remaining = 1500, credits_total = 1500, zego_credits_remaining = 1000, zego_credits_total = 1000
              WHERE id = p_user_id;
            ELSE
              UPDATE user_profiles
              SET credits_remaining = 1500, credits_total = 1500
              WHERE id = p_user_id;
            END IF;
          END IF;
          v_initialized := jsonb_set(v_initialized, '{credits}', '"initialized_with_subscription"'::jsonb);
          RAISE NOTICE '[INIT_DEFAULTS] ✓ Initialized credits (tool=1500, zego=1000) with subscription for %', p_user_id;
        ELSE
          IF v_has_zego THEN
            UPDATE user_profiles
            SET credits_remaining = 0, credits_total = 1500, zego_credits_remaining = 0, zego_credits_total = 1000
            WHERE id = p_user_id;
          ELSE
            UPDATE user_profiles
            SET credits_remaining = 0, credits_total = 1500
            WHERE id = p_user_id;
          END IF;
          v_initialized := jsonb_set(v_initialized, '{credits}', '"initialized_without_subscription"'::jsonb);
          RAISE NOTICE '[INIT_DEFAULTS] ✓ Initialized credits (0) without subscription for %', p_user_id;
        END IF;
      ELSE
        v_initialized := jsonb_set(v_initialized, '{credits}', '"already_set"'::jsonb);
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_initialized := jsonb_set(v_initialized, '{credits}', to_jsonb('error: ' || SQLERRM));
        RAISE WARNING '[INIT_DEFAULTS] Could not initialize credits: %', SQLERRM;
    END;
  ELSE
    v_initialized := jsonb_set(v_initialized, '{credits}', '"columns_missing"'::jsonb);
  END IF;

  IF column_exists('user_profiles', 'monthly_usage') AND column_exists('user_profiles', 'last_reset') THEN
    BEGIN
      UPDATE user_profiles
      SET
        monthly_usage = COALESCE(monthly_usage, 0),
        last_reset = COALESCE(last_reset, now())
      WHERE id = p_user_id;
      v_initialized := jsonb_set(v_initialized, '{usage_tracking}', '"initialized"'::jsonb);
      RAISE NOTICE '[INIT_DEFAULTS] ✓ Initialized usage tracking for %', p_user_id;
    EXCEPTION
      WHEN OTHERS THEN
        v_initialized := jsonb_set(v_initialized, '{usage_tracking}', to_jsonb('error: ' || SQLERRM));
        RAISE WARNING '[INIT_DEFAULTS] Could not initialize usage tracking: %', SQLERRM;
    END;
  ELSE
    v_initialized := jsonb_set(v_initialized, '{usage_tracking}', '"columns_missing"'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'initialized', v_initialized,
    'timestamp', now()
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[INIT_DEFAULTS] Unexpected error during initialization for %: %', p_user_id, SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'user_id', p_user_id
    );
END;
$$;

COMMENT ON FUNCTION initialize_user_defaults IS 'Initializes optional fields. Sets tool credits to 1500 and Zego to 1000 when user has subscription.';

-- =====================================================================
-- STEP 6: deduct_zego_credits_atomic
-- =====================================================================

CREATE OR REPLACE FUNCTION deduct_zego_credits_atomic(p_user_id uuid, p_minutes integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining integer;
  v_cycle_end timestamptz;
  v_has_active boolean;
BEGIN
  IF p_minutes <= 0 THEN
    RETURN jsonb_build_object('success', true, 'deducted', 0, 'credits_remaining', 0);
  END IF;

  SELECT up.zego_credits_remaining, up.credits_cycle_end
  INTO v_remaining, v_cycle_end
  FROM user_profiles up
  WHERE up.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = p_user_id AND s.status = 'active' AND s.end_date > now()
  ) INTO v_has_active;

  IF NOT v_has_active OR v_cycle_end IS NULL OR v_cycle_end < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active subscription or cycle expired');
  END IF;

  v_remaining := COALESCE(v_remaining, 0);
  v_remaining := GREATEST(0, v_remaining - p_minutes);

  UPDATE user_profiles
  SET zego_credits_remaining = v_remaining
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'deducted', p_minutes,
    'credits_remaining', v_remaining
  );
END;
$$;

COMMENT ON FUNCTION deduct_zego_credits_atomic IS 'Deduct Zego/study room credits by minutes. Floors at 0. Same cycle as tool credits.';

GRANT EXECUTE ON FUNCTION deduct_zego_credits_atomic(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_zego_credits_atomic(uuid, integer) TO service_role;

-- =====================================================================
-- STEP 7: can_use_study_room
-- =====================================================================

CREATE OR REPLACE FUNCTION can_use_study_room(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_zego_remaining integer;
  v_cycle_end timestamptz;
  v_has_active boolean;
  v_is_blocked boolean;
BEGIN
  SELECT up.zego_credits_remaining, up.credits_cycle_end, COALESCE(up.is_blocked, false)
  INTO v_zego_remaining, v_cycle_end, v_is_blocked
  FROM user_profiles up
  WHERE up.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'User not found');
  END IF;

  IF v_is_blocked THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'User is blocked', 'zego_credits_remaining', COALESCE(v_zego_remaining, 0));
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = p_user_id AND s.status = 'active' AND s.end_date > now()
  ) INTO v_has_active;

  IF NOT v_has_active THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'No active subscription', 'zego_credits_remaining', 0);
  END IF;

  IF v_cycle_end IS NULL OR v_cycle_end < now() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Credit cycle expired', 'zego_credits_remaining', 0);
  END IF;

  v_zego_remaining := COALESCE(v_zego_remaining, 0);
  IF v_zego_remaining <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'No study room credits left', 'zego_credits_remaining', 0);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'zego_credits_remaining', v_zego_remaining);
END;
$$;

COMMENT ON FUNCTION can_use_study_room IS 'Returns allowed=true only if user has active subscription and zego_credits_remaining > 0.';

GRANT EXECUTE ON FUNCTION can_use_study_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_use_study_room(uuid) TO service_role;

-- =====================================================================
-- STEP 8: record_study_room_usage_and_deduct (optional audit; deducts via helper)
-- =====================================================================

CREATE OR REPLACE FUNCTION record_study_room_usage_and_deduct(
  p_user_id uuid,
  p_room_id uuid,
  p_joined_at timestamptz,
  p_left_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minutes integer;
  v_result jsonb;
BEGIN
  v_minutes := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (p_left_at - p_joined_at)) / 60)::integer);
  IF v_minutes = 0 THEN
    RETURN jsonb_build_object('success', true, 'minutes_deducted', 0);
  END IF;
  v_result := deduct_zego_credits_atomic(p_user_id, v_minutes);
  RETURN jsonb_build_object(
    'success', (v_result->>'success')::boolean,
    'minutes_deducted', v_minutes,
    'error', v_result->'error',
    'credits_remaining', v_result->'credits_remaining'
  );
END;
$$;

COMMENT ON FUNCTION record_study_room_usage_and_deduct IS 'Compute minutes from joined_at/left_at and deduct Zego credits. Used if app records usage explicitly; trigger can do deduction instead.';

GRANT EXECUTE ON FUNCTION record_study_room_usage_and_deduct(uuid, uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION record_study_room_usage_and_deduct(uuid, uuid, timestamptz, timestamptz) TO service_role;

-- =====================================================================
-- STEP 9: force_leave_study_rooms
-- =====================================================================

CREATE OR REPLACE FUNCTION force_leave_study_rooms(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE study_room_participants
  SET left_at = now()
  WHERE user_id = p_user_id
    AND left_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'rooms_left', v_updated);
END;
$$;

COMMENT ON FUNCTION force_leave_study_rooms IS 'Set left_at = now() for all participations of user. Deduction is done by trigger on left_at.';

GRANT EXECUTE ON FUNCTION force_leave_study_rooms(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION force_leave_study_rooms(uuid) TO service_role;

-- =====================================================================
-- STEP 10: Trigger — deduct Zego when left_at is set
-- =====================================================================

CREATE OR REPLACE FUNCTION study_room_deduct_zego_on_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minutes integer;
BEGIN
  IF OLD.left_at IS NULL AND NEW.left_at IS NOT NULL THEN
    v_minutes := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NEW.left_at - NEW.joined_at)) / 60)::integer);
    IF v_minutes > 0 THEN
      PERFORM deduct_zego_credits_atomic(NEW.user_id, v_minutes);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS study_room_deduct_zego_on_leave_trigger ON study_room_participants;
CREATE TRIGGER study_room_deduct_zego_on_leave_trigger
  AFTER UPDATE ON study_room_participants
  FOR EACH ROW
  EXECUTE FUNCTION study_room_deduct_zego_on_leave();
