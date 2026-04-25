-- Repair schema drift when credit/Zego migrations were skipped or applied out of order.
-- Prevents: column "zego_credits_remaining" does not exist (and similar) during subscription activation.

-- ---------------------------------------------------------------------------
-- user_profiles: Zego pool (expected by 20260413120000_credit_pools_* RPCs)
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS zego_credits_remaining integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zego_credits_total integer NOT NULL DEFAULT 1000;

COMMENT ON COLUMN public.user_profiles.zego_credits_remaining IS 'Study-room / Zego minute pool remaining (1 credit = 1 minute where applicable).';
COMMENT ON COLUMN public.user_profiles.zego_credits_total IS 'Zego pool size for the current billing cycle.';

-- ---------------------------------------------------------------------------
-- user_profiles: credit notification flags (mixed generations of migrations)
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS notified_at_30_percent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_at_10_percent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_at_1000 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_at_500 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_at_250 boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- subscriptions: Standard add-on columns (safe_create_subscription INSERT)
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS zego_hours_per_cycle integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chat_blocks_per_cycle integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.subscriptions.zego_hours_per_cycle IS 'Zego hours per billing cycle for standard tier; credits derived in initialize_subscription_credits.';
COMMENT ON COLUMN public.subscriptions.chat_blocks_per_cycle IS 'AI chat add-on blocks per cycle for standard tier; 1 block = 100k tokens toward token_limit.';
