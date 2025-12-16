/*
  # Create User Library Items Table

  1. New Tables
    - `user_library_items`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `title` (text)
      - `summary_text` (text)
      - `flashcards_json` (jsonb)
      - `source_type` (text) - 'processed' or 'uploaded'
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `user_library_items` table
    - Add policies for users to manage their own library items
*/

CREATE TABLE IF NOT EXISTS user_library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary_text text NOT NULL,
  flashcards_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_type text NOT NULL CHECK (source_type IN ('processed', 'uploaded')) DEFAULT 'processed',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_library_items ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_library_items_user_id ON user_library_items(user_id);
CREATE INDEX IF NOT EXISTS idx_user_library_items_created_at ON user_library_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_library_items_source_type ON user_library_items(source_type);

-- RLS Policies
CREATE POLICY "Users can read own library items"
  ON user_library_items
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own library items"
  ON user_library_items
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own library items"
  ON user_library_items
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own library items"
  ON user_library_items
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);