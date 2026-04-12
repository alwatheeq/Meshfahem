CREATE TABLE IF NOT EXISTS user_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES user_library_items(id) ON DELETE CASCADE,
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  color text NOT NULL DEFAULT 'yellow',
  note text,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_highlights_item ON user_highlights(item_id, user_id);

ALTER TABLE user_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own highlights"
  ON user_highlights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view public highlights"
  ON user_highlights FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can insert own highlights"
  ON user_highlights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own highlights"
  ON user_highlights FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own highlights"
  ON user_highlights FOR DELETE
  USING (auth.uid() = user_id);
