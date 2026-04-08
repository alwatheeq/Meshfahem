-- Phase 3: User Highlights & Annotations
-- Local migration file - apply via supabase db push when ready

CREATE TABLE IF NOT EXISTS user_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('library', 'history', 'summary')),
  source_id UUID,
  selected_text TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  chunk_index INTEGER DEFAULT 0,
  color TEXT DEFAULT 'yellow' CHECK (color IN ('yellow', 'green', 'blue', 'pink', 'orange')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE user_highlights IS 'User text highlights across library, history, and summary views';

ALTER TABLE user_highlights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own highlights" ON user_highlights;
CREATE POLICY "Users can view own highlights" ON user_highlights
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own highlights" ON user_highlights;
CREATE POLICY "Users can insert own highlights" ON user_highlights
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own highlights" ON user_highlights;
CREATE POLICY "Users can update own highlights" ON user_highlights
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own highlights" ON user_highlights;
CREATE POLICY "Users can delete own highlights" ON user_highlights
  FOR DELETE USING (auth.uid() = user_id);

-- Optional: cache mind map data on library items
ALTER TABLE user_library_items ADD COLUMN IF NOT EXISTS mind_map_data JSONB;
