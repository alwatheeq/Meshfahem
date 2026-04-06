-- Fix Standard subscription credit bundle for free checkout and paid flows:
-- 1) Add p_force_refill to always apply 1500 tool + Zego pool when subscribing (skip "had free credits" early exit).
-- 2) Zego pool = zego_hours_per_cycle * 60 (1 credit = 1 minute; 10 hr => 600 credits), matching product copy.

COMMENT ON COLUMN subscriptions.zego_hours_per_cycle IS 'Zego hours per billing cycle for standard tier; credits = hours * 60 (minutes). E.g. 10 hr => 600 study-room credits.';

DROP FUNCTION IF EXISTS initialize_subscription_credits(uuid, text);

CREATE OR REPLACE FUNCTION initialize_subscription_credits(
  p_user_id uuid,
  p_subscription_tier text DEFAULT NULL,
  p_force_refill boolean DEFAULT false
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
  v_tool_credits integer := 1500;
  v_zego_credits integer := 1000;
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

  IF COALESCE(p_force_refill, false) THEN
    v_should_refill := true;
  END IF;

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

    IF v_subscription.subscription_tier = 'standard' THEN
      -- 1 credit = 1 minute of study room; 10 hours => 600 credits
      v_zego_credits := COALESCE(v_subscription.zego_hours_per_cycle, 0) * 60;
    END IF;
  ELSE
    v_cycle_start := now();
    v_cycle_end := now() + interval '30 days';
  END IF;

  UPDATE user_profiles
  SET
    credits_remaining = v_tool_credits,
    credits_total = v_tool_credits,
    zego_credits_remaining = v_zego_credits,
    zego_credits_total = v_zego_credits,
    credits_cycle_start = v_cycle_start,
    credits_cycle_end = v_cycle_end,
    notified_at_30_percent = false,
    notified_at_10_percent = false
  WHERE id = p_user_id;

  RAISE NOTICE '[CREDIT_INIT] Tool=%, Zego=% for user: % (force=%)', v_tool_credits, v_zego_credits, p_user_id, p_force_refill;

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE
      WHEN v_is_renewal THEN 'Credits refilled on renewal'
      WHEN v_current_credits IS NULL OR v_current_credits = 0 THEN 'Credits initialized for new subscription'
      WHEN v_credits_cycle_end IS NOT NULL AND v_credits_cycle_end < now() THEN 'Credits refilled - billing cycle expired'
      ELSE 'Credits refilled'
    END,
    'user_id', p_user_id,
    'credits_remaining', v_tool_credits,
    'credits_total', v_tool_credits,
    'zego_credits_remaining', v_zego_credits,
    'zego_credits_total', v_zego_credits,
    'cycle_start', v_cycle_start,
    'cycle_end', v_cycle_end,
    'is_renewal', v_is_renewal,
    'previous_credits', v_current_credits,
    'forced', COALESCE(p_force_refill, false)
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

COMMENT ON FUNCTION initialize_subscription_credits(uuid, text, boolean) IS 'Initialize/refill credits. Standard: 1500 tools, Zego = zego_hours_per_cycle*60 (minutes). Pass p_force_refill=true on new subscribe to apply bundle even if user had free credits.';

GRANT EXECUTE ON FUNCTION initialize_subscription_credits(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_subscription_credits(uuid, text, boolean) TO service_role;

-- Billing cycle refresh: same Zego minute formula for standard
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
  v_zego_hours integer := 10;
  v_zego_credits integer := 1000;
BEGIN
  PERFORM check_subscription_expiration();

  SELECT id, billing_cycle_end, subscription_tier, end_date,
         COALESCE(zego_hours_per_cycle, 0)
  INTO v_subscription_id, v_current_cycle_end, v_subscription_tier, v_end_date,
       v_zego_hours
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

  IF v_subscription_tier = 'standard' THEN
    v_zego_credits := v_zego_hours * 60;
  ELSE
    v_zego_credits := 1000;
  END IF;

  IF v_current_cycle_end IS NULL OR now() > v_current_cycle_end THEN
    IF v_subscription_tier IN ('monthly', 'quarterly', 'biannual', 'standard') THEN
      v_cycles_advanced := GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(v_current_cycle_end, now()))) / (30 * 24 * 60 * 60)) + 1);
      v_new_cycle_start := COALESCE(v_current_cycle_end, now());
      v_new_cycle_end := v_new_cycle_start + (interval '30 days' * v_cycles_advanced);
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

      UPDATE user_profiles
      SET
        credits_remaining = 1500,
        credits_total = 1500,
        zego_credits_remaining = v_zego_credits,
        zego_credits_total = v_zego_credits,
        credits_cycle_start = v_new_cycle_start,
        credits_cycle_end = v_new_cycle_end,
        notified_at_1000 = false,
        notified_at_500 = false,
        notified_at_250 = false
      WHERE id = p_user_id;

      RAISE NOTICE '[CYCLE_REFRESH] subscription % (user %): tool=1500, zego=%', v_subscription_id, p_user_id, v_zego_credits;

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

COMMENT ON FUNCTION refresh_billing_cycle_if_expired IS 'Refreshes billing cycle. Standard tier: Zego = zego_hours_per_cycle*60 (study minutes). Other paid tiers: 1500 tools + 1000 Zego.';

-- safe_create_subscription: always force-apply plan credits on new subscription
CREATE OR REPLACE FUNCTION safe_create_subscription(
  p_user_id uuid,
  p_subscription_tier text,
  p_end_date timestamptz,
  p_trial_end_date timestamptz DEFAULT NULL,
  p_zego_hours integer DEFAULT 0,
  p_chat_blocks integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription_id uuid;
  v_is_admin boolean;
  v_credit_result jsonb;
  v_token_limit integer;
BEGIN
  PERFORM ensure_user_profile(p_user_id);

  SELECT user_role = 'admin' INTO v_is_admin
  FROM user_profiles
  WHERE id = p_user_id;

  UPDATE subscriptions
  SET status = 'canceled',
      canceled_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id
    AND status = 'active';

  IF p_subscription_tier = 'standard' THEN
    v_token_limit := 520000 + GREATEST(0, COALESCE(p_chat_blocks, 0)) * 100000;
  ELSE
    v_token_limit := get_token_limit_for_tier(p_subscription_tier);
  END IF;

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
    billing_cycle_end,
    token_limit,
    tokens_used_current_cycle,
    zego_hours_per_cycle,
    chat_blocks_per_cycle
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
    now() + interval '30 days',
    v_token_limit,
    0,
    COALESCE(p_zego_hours, 0),
    COALESCE(p_chat_blocks, 0)
  )
  RETURNING id INTO v_subscription_id;

  RAISE NOTICE 'Created subscription % for user % (tier: %, zego_hrs: %, chat_blocks: %)',
    v_subscription_id, p_user_id, p_subscription_tier, COALESCE(p_zego_hours, 0), COALESCE(p_chat_blocks, 0);

  SELECT initialize_subscription_credits(p_user_id, p_subscription_tier, true)
  INTO v_credit_result;

  IF (v_credit_result->>'success')::boolean = true THEN
    RAISE NOTICE 'Credits initialized: %', v_credit_result->>'message';
  ELSE
    RAISE WARNING 'Credit initialization warning: %', v_credit_result->>'error';
  END IF;

  RETURN v_subscription_id;
END;
$$;

COMMENT ON FUNCTION safe_create_subscription IS 'Safely create subscription. Initializes credits with full Standard bundle (force), including Zego minutes = hours*60.';
