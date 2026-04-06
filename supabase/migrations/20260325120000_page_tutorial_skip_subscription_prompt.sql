-- Page tutorials: nullable completed_at, skip_count, RPC to increment skips safely.
-- Subscription soft-upsell: last shown timestamp on user_preferences.

-- ---------------------------------------------------------------------------
-- user_page_tutorials
-- ---------------------------------------------------------------------------
ALTER TABLE user_page_tutorials
  ALTER COLUMN completed_at DROP DEFAULT;

ALTER TABLE user_page_tutorials
  ALTER COLUMN completed_at DROP NOT NULL;

ALTER TABLE user_page_tutorials
  ADD COLUMN IF NOT EXISTS skip_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN user_page_tutorials.skip_count IS
  'Number of times the user skipped the page tutorial; >= 2 means do not show again unless completed_at is set.';

COMMENT ON COLUMN user_page_tutorials.completed_at IS
  'Set when the user finishes the tutorial walkthrough; NULL if only skips were recorded.';

-- ---------------------------------------------------------------------------
-- RPC: increment skip (first skip inserts row with skip_count=1; capped at 2)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_user_page_tutorial_skip(p_page_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO user_page_tutorials (user_id, page_name, skip_count, completed_at)
  VALUES (auth.uid(), p_page_name, 1, NULL)
  ON CONFLICT (user_id, page_name) DO UPDATE SET
    skip_count = CASE
      WHEN user_page_tutorials.completed_at IS NOT NULL THEN user_page_tutorials.skip_count
      ELSE LEAST(user_page_tutorials.skip_count + 1, 2)
    END
  RETURNING skip_count INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_user_page_tutorial_skip(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_user_page_tutorial_skip(text) TO authenticated;

COMMENT ON FUNCTION public.increment_user_page_tutorial_skip(text) IS
  'Increments skip_count for a page tutorial (max 2); no-op if already completed.';

-- ---------------------------------------------------------------------------
-- user_preferences: global subscription prompt cooldown
-- ---------------------------------------------------------------------------
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS subscription_prompt_last_shown_at timestamptz;

COMMENT ON COLUMN user_preferences.subscription_prompt_last_shown_at IS
  'Last time a subscription upsell modal was shown; used for soft-prompt throttling.';
