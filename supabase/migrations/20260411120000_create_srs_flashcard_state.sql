-- SRS (Spaced Repetition) flashcard state table for SM-2 algorithm
CREATE TABLE IF NOT EXISTS srs_flashcard_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES user_library_items(id) ON DELETE CASCADE,
  flashcard_index integer NOT NULL,
  easiness_factor numeric(4,2) NOT NULL DEFAULT 2.5,
  interval_days integer NOT NULL DEFAULT 0,
  repetitions integer NOT NULL DEFAULT 0,
  next_review_at timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz,
  last_rating text CHECK (last_rating IN ('again','hard','good','easy')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id, flashcard_index)
);

CREATE INDEX IF NOT EXISTS idx_srs_state_user_review
  ON srs_flashcard_state(user_id, next_review_at);

CREATE INDEX IF NOT EXISTS idx_srs_state_item
  ON srs_flashcard_state(item_id);

ALTER TABLE srs_flashcard_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own SRS state"
  ON srs_flashcard_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own SRS state"
  ON srs_flashcard_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own SRS state"
  ON srs_flashcard_state FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own SRS state"
  ON srs_flashcard_state FOR DELETE
  USING (auth.uid() = user_id);
