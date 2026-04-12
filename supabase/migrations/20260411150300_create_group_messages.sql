CREATE TABLE IF NOT EXISTS group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(trim(content)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_messages_sender ON group_messages(sender_id);

ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view group messages"
  ON group_messages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM study_group_members WHERE group_id = group_messages.group_id AND user_id = auth.uid())
  );

CREATE POLICY "Members can send messages"
  ON group_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (SELECT 1 FROM study_group_members WHERE group_id = group_messages.group_id AND user_id = auth.uid())
  );

CREATE POLICY "Senders can delete own messages"
  ON group_messages FOR DELETE
  USING (auth.uid() = sender_id);

-- Enable realtime for group_messages (idempotent on re-apply)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'group_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE group_messages;
  END IF;
END $$;
