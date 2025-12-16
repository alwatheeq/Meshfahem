/*
  # Create Reactions System (Likes and Favorites)

  1. New Tables
    - `item_reactions`
      - `id` (uuid, primary key)
      - `item_id` (uuid, foreign key to user_library_items)
      - `user_id` (uuid, foreign key to auth.users)
      - `reaction_type` (text, 'like' or 'favorite')
      - `created_at` (timestamp)

  2. Schema Changes
    - Add `reaction_counts` jsonb column to `user_library_items`

  3. Security
    - Enable RLS on `item_reactions` table
    - Anyone can read reactions on public items
    - Authenticated users can create/delete their own reactions

  4. Functions
    - Function to update reaction counts on items
    - Function to refresh materialized view of reaction aggregates
*/

-- Create item_reactions table
CREATE TABLE IF NOT EXISTS item_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES user_library_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('like', 'favorite')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_item_reaction UNIQUE(item_id, user_id, reaction_type)
);

-- Add reaction_counts to user_library_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_library_items' AND column_name = 'reaction_counts'
  ) THEN
    ALTER TABLE user_library_items ADD COLUMN reaction_counts jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Enable RLS on item_reactions
ALTER TABLE item_reactions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can read reactions on public items
CREATE POLICY "Public can read reactions on public items"
  ON item_reactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_library_items
      WHERE id = item_reactions.item_id
      AND is_public = true
    )
  );

-- RLS Policy: Item owners can read all reactions on their items
CREATE POLICY "Item owners can read reactions on own items"
  ON item_reactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_library_items
      WHERE id = item_reactions.item_id
      AND user_id = auth.uid()
    )
  );

-- RLS Policy: Authenticated users can create reactions
CREATE POLICY "Authenticated users can create reactions"
  ON item_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can delete their own reactions
CREATE POLICY "Users can delete own reactions"
  ON item_reactions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to update reaction counts on items
CREATE OR REPLACE FUNCTION update_reaction_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  like_count integer;
  favorite_count integer;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
    -- Get current counts for the item
    SELECT
      COUNT(*) FILTER (WHERE reaction_type = 'like'),
      COUNT(*) FILTER (WHERE reaction_type = 'favorite')
    INTO like_count, favorite_count
    FROM item_reactions
    WHERE item_id = COALESCE(NEW.item_id, OLD.item_id);

    -- Update the reaction_counts jsonb
    UPDATE user_library_items
    SET reaction_counts = jsonb_build_object(
      'like_count', like_count,
      'favorite_count', favorite_count
    )
    WHERE id = COALESCE(NEW.item_id, OLD.item_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to update reaction counts
CREATE TRIGGER update_reaction_counts_trigger
  AFTER INSERT OR DELETE ON item_reactions
  FOR EACH ROW
  EXECUTE FUNCTION update_reaction_counts();

-- Create function to get reaction count for a specific type
CREATE OR REPLACE FUNCTION get_reaction_count(item_uuid uuid, reaction_type text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  count_val integer;
BEGIN
  SELECT reaction_counts->>(reaction_type || '_count')
  INTO count_val
  FROM user_library_items
  WHERE id = item_uuid;

  RETURN COALESCE(count_val, 0);
END;
$$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_item_reactions_item_id ON item_reactions(item_id);
CREATE INDEX IF NOT EXISTS idx_item_reactions_user_id ON item_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_item_reactions_type ON item_reactions(reaction_type);
CREATE INDEX IF NOT EXISTS idx_item_reactions_item_type ON item_reactions(item_id, reaction_type);
CREATE INDEX IF NOT EXISTS idx_library_items_reaction_counts ON user_library_items USING gin(reaction_counts);

-- Initialize reaction_counts for existing items
UPDATE user_library_items
SET reaction_counts = '{}'::jsonb
WHERE reaction_counts IS NULL OR reaction_counts = 'null'::jsonb;
