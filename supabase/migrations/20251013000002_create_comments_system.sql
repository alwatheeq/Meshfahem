/*
  # Create Comments System

  1. New Tables
    - `comments`
      - `id` (uuid, primary key)
      - `item_id` (uuid, foreign key to user_library_items)
      - `user_id` (uuid, foreign key to auth.users)
      - `parent_comment_id` (uuid, nullable, foreign key to comments)
      - `comment_text` (text, max 2000 chars)
      - `is_edited` (boolean, default false)
      - `edited_at` (timestamp, nullable)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Schema Changes
    - Add `comment_count` column to `user_library_items`

  3. Security
    - Enable RLS on `comments` table
    - Public can read comments on public items
    - Authenticated users can create comments
    - Users can update/delete their own comments

  4. Functions
    - Trigger to update comment_count on user_library_items
    - Function to check comment nesting depth (max 3 levels)
*/

-- Create comments table
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES user_library_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  comment_text text NOT NULL CHECK (char_length(comment_text) <= 2000 AND char_length(comment_text) > 0),
  is_edited boolean NOT NULL DEFAULT false,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add comment_count to user_library_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_library_items' AND column_name = 'comment_count'
  ) THEN
    ALTER TABLE user_library_items ADD COLUMN comment_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Enable RLS on comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can read comments on public items
CREATE POLICY "Public can read comments on public items"
  ON comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_library_items
      WHERE id = comments.item_id
      AND is_public = true
    )
  );

-- RLS Policy: Item owners can read all comments on their items
CREATE POLICY "Item owners can read comments on own items"
  ON comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_library_items
      WHERE id = comments.item_id
      AND user_id = auth.uid()
    )
  );

-- RLS Policy: Authenticated users can create comments
CREATE POLICY "Authenticated users can create comments"
  ON comments
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own comments
CREATE POLICY "Users can update own comments"
  ON comments
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can delete their own comments
CREATE POLICY "Users can delete own comments"
  ON comments
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to validate comment nesting depth (max 3 levels)
CREATE OR REPLACE FUNCTION check_comment_depth()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  depth integer := 0;
  current_parent uuid;
BEGIN
  IF NEW.parent_comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  current_parent := NEW.parent_comment_id;

  -- Count nesting levels
  WHILE current_parent IS NOT NULL AND depth < 4 LOOP
    depth := depth + 1;
    SELECT parent_comment_id INTO current_parent
    FROM comments
    WHERE id = current_parent;
  END LOOP;

  -- Limit to 3 levels of nesting
  IF depth >= 3 THEN
    RAISE EXCEPTION 'Comment nesting depth exceeded (maximum 3 levels)';
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger to check comment depth
CREATE TRIGGER check_comment_depth_trigger
  BEFORE INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION check_comment_depth();

-- Create function to update comment count on items
CREATE OR REPLACE FUNCTION update_comment_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE user_library_items
    SET comment_count = comment_count + 1
    WHERE id = NEW.item_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE user_library_items
    SET comment_count = GREATEST(0, comment_count - 1)
    WHERE id = OLD.item_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Create trigger to update comment count
CREATE TRIGGER update_comment_count_trigger
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW
  EXECUTE FUNCTION update_comment_count();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_comments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.is_edited = true;
  NEW.edited_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger to update updated_at on comment edit
CREATE TRIGGER update_comments_updated_at_trigger
  BEFORE UPDATE ON comments
  FOR EACH ROW
  WHEN (OLD.comment_text IS DISTINCT FROM NEW.comment_text)
  EXECUTE FUNCTION update_comments_updated_at();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_comments_item_id ON comments(item_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_item_created ON comments(item_id, created_at DESC);
