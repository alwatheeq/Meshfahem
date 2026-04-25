-- Transactional safe_create_subscription: no orphan active sub when credit init fails.
-- Idempotent repair RPC ensure_subscription_credits for client post-checkout verification.
-- Unique stripe_subscription_id for checkout upserts (non-null values only).

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_key
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

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

  IF COALESCE((v_credit_result->>'success')::boolean, false) THEN
    RAISE NOTICE 'Credits initialized: %', v_credit_result->>'message';
  ELSE
    DELETE FROM subscriptions WHERE id = v_subscription_id;
    RAISE EXCEPTION 'Credit initialization failed for subscription %: %',
      v_subscription_id,
      COALESCE(v_credit_result->>'error', v_credit_result::text, 'unknown');
  END IF;

  RETURN v_subscription_id;
END;
$$;

COMMENT ON FUNCTION safe_create_subscription(uuid, text, timestamptz, timestamptz, integer, integer, boolean) IS
  'Create subscription after canceling prior actives. Rolls back subscription row if initialize_subscription_credits does not succeed.';

-- Idempotent repair: force-refill from latest active subscription row (non-additive path).
-- JSON contract:
--   success (boolean): overall outcome
--   error (text, optional): high-level message
--   code (text, optional): 'forbidden' | 'no_active_subscription'
--   repaired (boolean): true if initialize ran and was not skipped
--   initialize_result (jsonb): raw output from initialize_subscription_credits
--   subscription_id (uuid): active subscription used
CREATE OR REPLACE FUNCTION ensure_subscription_credits(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_result jsonb;
  v_caller_is_admin boolean := false;
  v_existing_tools integer;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    SELECT (user_role = 'admin') INTO v_caller_is_admin
    FROM user_profiles
    WHERE id = auth.uid();
    IF NOT COALESCE(v_caller_is_admin, false) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Forbidden',
        'code', 'forbidden'
      );
    END IF;
  END IF;

  SELECT *
  INTO v_sub
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No active subscription found',
      'code', 'no_active_subscription'
    );
  END IF;

  SELECT COALESCE(credits_remaining, 0) INTO v_existing_tools
  FROM user_profiles
  WHERE id = p_user_id;

  IF COALESCE(v_existing_tools, 0) > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'repaired', false,
      'skipped', true,
      'reason', 'profile_already_has_tool_credits',
      'credits_remaining', v_existing_tools,
      'subscription_id', v_sub.id
    );
  END IF;

  v_result := initialize_subscription_credits(
    p_user_id,
    v_sub.subscription_tier,
    true,
    false
  );

  RETURN jsonb_build_object(
    'success', COALESCE((v_result->>'success')::boolean, false),
    'repaired',
      COALESCE((v_result->>'success')::boolean, false)
      AND COALESCE((v_result->>'skipped')::boolean, false) IS NOT TRUE,
    'initialize_result', v_result,
    'subscription_id', v_sub.id,
    'error', v_result->>'error'
  );
END;
$$;

COMMENT ON FUNCTION ensure_subscription_credits(uuid) IS
  'Idempotent: force-refill tool/Zego credits from the latest active subscription (non-additive). JSON: success, repaired, initialize_result, subscription_id, optional error/code.';

GRANT EXECUTE ON FUNCTION ensure_subscription_credits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_subscription_credits(uuid) TO service_role;
