-- Credit pools: p_additive top-up vs reset, Zego minimum 600 for standard, chat tokens in balance RPC,
-- subscription token checks, and atomic token usage cap.

-- ---------------------------------------------------------------------------
-- 1) initialize_subscription_credits: add p_additive; Zego floor; additive branch
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS initialize_subscription_credits(uuid, text, boolean);

CREATE OR REPLACE FUNCTION initialize_subscription_credits(
  p_user_id uuid,
  p_subscription_tier text DEFAULT NULL,
  p_force_refill boolean DEFAULT false,
  p_additive boolean DEFAULT false
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
  v_zego_min_standard integer := 600;
  v_tool_add integer := 1500;
  v_zego_add integer;
  v_cur_zego_rem integer;
  v_cur_zego_tot integer;
  v_cur_cred_tot integer;
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

  -- Additive top-up (e.g. new checkout while user already had an active subscription this session)
  IF COALESCE(p_additive, false) AND COALESCE(p_force_refill, false) THEN
    SELECT *
    INTO v_subscription
    FROM subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND end_date > now()
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Additive refill requires an active subscription row',
        'user_id', p_user_id
      );
    END IF;

    IF v_subscription.subscription_tier = 'standard' THEN
      v_zego_add := GREATEST(COALESCE(v_subscription.zego_hours_per_cycle, 0) * 60, v_zego_min_standard);
    ELSE
      v_zego_add := 1000;
    END IF;

    UPDATE user_profiles up
    SET
      credits_remaining = COALESCE(up.credits_remaining, 0) + v_tool_add,
      credits_total = COALESCE(up.credits_total, 0) + v_tool_add,
      zego_credits_remaining = COALESCE(up.zego_credits_remaining, 0) + v_zego_add,
      zego_credits_total = COALESCE(up.zego_credits_total, 0) + v_zego_add
    WHERE up.id = p_user_id
    RETURNING zego_credits_remaining, zego_credits_total
    INTO v_cur_zego_rem, v_cur_zego_tot;

    UPDATE subscriptions
    SET
      token_limit = COALESCE(token_limit, 0) + 500000,
      updated_at = now()
    WHERE id = v_subscription.id;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Credits topped up (additive refill)',
      'user_id', p_user_id,
      'additive', true,
      'credits_added', v_tool_add,
      'zego_added', v_zego_add,
      'chat_token_limit_added', 500000,
      'credits_remaining', (SELECT credits_remaining FROM user_profiles WHERE id = p_user_id),
      'zego_credits_remaining', v_cur_zego_rem
    );
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
      v_zego_credits := GREATEST(COALESCE(v_subscription.zego_hours_per_cycle, 0) * 60, v_zego_min_standard);
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

  RAISE NOTICE '[CREDIT_INIT] Tool=%, Zego=% for user: % (force=% additive=%)', v_tool_credits, v_zego_credits, p_user_id, p_force_refill, p_additive;

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
    'forced', COALESCE(p_force_refill, false),
    'additive', false
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

COMMENT ON FUNCTION initialize_subscription_credits(uuid, text, boolean, boolean) IS
  'Reset: 1500 tool + Zego (standard: max(hours*60,600)). Additive: +1500 tool, +Zego, +500000 token_limit on active subscription.';

GRANT EXECUTE ON FUNCTION initialize_subscription_credits(uuid, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_subscription_credits(uuid, text, boolean, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) refresh_billing_cycle_if_expired — Zego floor 600 for standard
-- ---------------------------------------------------------------------------
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
  v_zego_min_standard integer := 600;
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
    v_zego_credits := GREATEST(v_zego_hours * 60, v_zego_min_standard);
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

COMMENT ON FUNCTION refresh_billing_cycle_if_expired IS
  'Refreshes billing cycle. Standard: Zego = max(zego_hours_per_cycle*60, 600). Other paid: 1500 tools + 1000 Zego.';

-- ---------------------------------------------------------------------------
-- 3) check_sufficient_subscription_tokens — AI Assistant pre-check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_sufficient_subscription_tokens(
  p_user_id uuid,
  p_estimated_tokens integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_id uuid;
  v_used integer;
  v_limit integer;
  v_cycle_end timestamptz;
  v_rem integer;
BEGIN
  PERFORM refresh_billing_cycle_if_expired(p_user_id);

  SELECT id, tokens_used_current_cycle, token_limit, billing_cycle_end
  INTO v_sub_id, v_used, v_limit, v_cycle_end
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'sufficient', false,
      'tokens_remaining', 0,
      'token_limit', 0,
      'billing_cycle_end', NULL,
      'reason', 'no_active_subscription'
    );
  END IF;

  v_rem := GREATEST(0, COALESCE(v_limit, 0) - COALESCE(v_used, 0));

  RETURN jsonb_build_object(
    'success', true,
    'sufficient', v_rem >= COALESCE(p_estimated_tokens, 0),
    'tokens_remaining', v_rem,
    'token_limit', v_limit,
    'tokens_used', v_used,
    'billing_cycle_end', v_cycle_end
  );
END;
$$;

COMMENT ON FUNCTION check_sufficient_subscription_tokens IS
  'Pre-flight check for AI chat: remaining subscription tokens vs estimate.';

GRANT EXECUTE ON FUNCTION check_sufficient_subscription_tokens(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION check_sufficient_subscription_tokens(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) update_token_usage — reject over-limit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_token_usage(
  p_user_id uuid,
  p_tokens_used integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription_id uuid;
  v_current_usage integer;
  v_token_limit integer;
  v_cycle_end timestamptz;
  v_refresh_result jsonb;
BEGIN
  v_refresh_result := refresh_billing_cycle_if_expired(p_user_id);

  SELECT id, tokens_used_current_cycle, token_limit, billing_cycle_end
  INTO v_subscription_id, v_current_usage, v_token_limit, v_cycle_end
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_subscription_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No active subscription found',
      'tokens_used', 0,
      'token_limit', 0
    );
  END IF;

  IF COALESCE(v_current_usage, 0) + COALESCE(p_tokens_used, 0) > COALESCE(v_token_limit, 0) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Token budget exceeded',
      'tokens_used', v_current_usage,
      'token_limit', v_token_limit,
      'tokens_remaining', GREATEST(0, v_token_limit - v_current_usage),
      'billing_cycle_end', v_cycle_end,
      'would_use', p_tokens_used
    );
  END IF;

  UPDATE subscriptions
  SET tokens_used_current_cycle = tokens_used_current_cycle + p_tokens_used,
      updated_at = now()
  WHERE id = v_subscription_id
  RETURNING tokens_used_current_cycle, token_limit, billing_cycle_end
  INTO v_current_usage, v_token_limit, v_cycle_end;

  RETURN jsonb_build_object(
    'success', true,
    'tokens_used', v_current_usage,
    'token_limit', v_token_limit,
    'tokens_remaining', GREATEST(0, v_token_limit - v_current_usage),
    'billing_cycle_end', v_cycle_end,
    'usage_percentage', ROUND((v_current_usage::numeric / NULLIF(v_token_limit, 0)::numeric * 100)::numeric, 2),
    'cycle_refreshed', v_refresh_result->'success'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_token_usage(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION update_token_usage(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) get_user_credit_balance — include chat token remaining
-- ---------------------------------------------------------------------------
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
  v_chat_rem integer;
  v_tok_lim integer;
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

  SELECT
    id,
    token_limit,
    tokens_used_current_cycle,
    billing_cycle_end
  INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_has_active_subscription := true;
    v_chat_rem := GREATEST(0, COALESCE(v_subscription.token_limit, 0) - COALESCE(v_subscription.tokens_used_current_cycle, 0));
    v_tok_lim := v_subscription.token_limit;
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
      'zego_credits_total', 1000,
      'chat_tokens_remaining', 0,
      'chat_token_limit', 0
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
    'zego_credits_total', v_balance.zego_credits_total,
    'chat_tokens_remaining', v_chat_rem,
    'chat_token_limit', COALESCE(v_tok_lim, 0)
  );
END;
$$;

COMMENT ON FUNCTION get_user_credit_balance IS
  'Tool + Zego + subscription chat token remaining (token_limit - tokens_used).';

-- ---------------------------------------------------------------------------
-- 6) safe_create_subscription — optional p_additive (top-up after prior active sub)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS safe_create_subscription(uuid, text, timestamptz, timestamptz, integer, integer);

CREATE OR REPLACE FUNCTION safe_create_subscription(
  p_user_id uuid,
  p_subscription_tier text,
  p_end_date timestamptz,
  p_trial_end_date timestamptz DEFAULT NULL,
  p_zego_hours integer DEFAULT 0,
  p_chat_blocks integer DEFAULT 0,
  p_additive boolean DEFAULT false
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

  RAISE NOTICE 'Created subscription % for user % (tier: %, zego_hrs: %, chat_blocks: %, additive: %)',
    v_subscription_id, p_user_id, p_subscription_tier, COALESCE(p_zego_hours, 0), COALESCE(p_chat_blocks, 0), p_additive;

  SELECT initialize_subscription_credits(p_user_id, p_subscription_tier, true, COALESCE(p_additive, false))
  INTO v_credit_result;

  IF (v_credit_result->>'success')::boolean = true THEN
    RAISE NOTICE 'Credits initialized: %', v_credit_result->>'message';
  ELSE
    RAISE WARNING 'Credit initialization warning: %', v_credit_result->>'error';
  END IF;

  RETURN v_subscription_id;
END;
$$;

COMMENT ON FUNCTION safe_create_subscription(uuid, text, timestamptz, timestamptz, integer, integer, boolean) IS
  'Create subscription after canceling prior actives. p_additive=true tops up credits when user already had an active plan.';
