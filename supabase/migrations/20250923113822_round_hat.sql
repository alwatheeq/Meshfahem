/*
  # Create Folders and Tags System

  1. New Tables
    - `user_folders`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `name` (text, not null)
      - `parent_folder_id` (uuid, nullable, foreign key to user_folders for nesting)
      - `created_at` (timestamp with time zone)
    - `tags`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `name` (text, not null, unique per user)
      - `created_at` (timestamp with time zone)
    - `item_tags`
      - `item_id` (uuid, foreign key to user_library_items)
      - `tag_id` (uuid, foreign key to tags)
      - Composite primary key on (item_id, tag_id)

  2. Schema Changes
    - Add `folder_id` column to `user_library_items`

  3. Security
    - Enable RLS on all new tables
    - Add policies for user-specific access
*/

-- Create user_folders table
CREATE TABLE IF NOT EXISTS user_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_folder_id uuid REFERENCES user_folders(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_folder_name_per_user UNIQUE(user_id, name, parent_folder_id)
);

-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_tag_name_per_user UNIQUE(user_id, name)
);

-- Create item_tags join table
CREATE TABLE IF NOT EXISTS item_tags (
  item_id uuid NOT NULL REFERENCES user_library_items(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

-- Add folder_id to user_library_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_library_items' AND column_name = 'folder_id'
  ) THEN
    ALTER TABLE user_library_items ADD COLUMN folder_id uuid REFERENCES user_folders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS on new tables
ALTER TABLE user_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_folders
CREATE POLICY "Users can manage own folders"
  ON user_folders
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS Policies for tags
CREATE POLICY "Users can manage own tags"
  ON tags
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS Policies for item_tags
CREATE POLICY "Users can manage tags for own items"
  ON item_tags
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_library_items
      WHERE id = item_tags.item_id AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_library_items
      WHERE id = item_tags.item_id AND user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_folders_user_id ON user_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_user_folders_parent ON user_folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_item_id ON item_tags(item_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id ON item_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_user_library_items_folder_id ON user_library_items(folder_id);