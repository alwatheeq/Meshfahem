/*
  # Create user history table for storing previous generations

  1. New Tables
    - `user_history`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users.id)
      - `original_input_type` (text) - 'file' or 'text'
      - `original_file_name` (text, nullable) - original filename or 'Pasted Text'
      - `summary_text` (text) - generated summary
      - `flashcards_json` (jsonb) - generated flashcards as JSON
      - `created_at` (timestamp with time zone)

  2. Security
    - Enable RLS on `user_history` table
    - Add policies for authenticated users to read/write only their own history
*/

CREATE TABLE IF NOT EXISTS user_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_input_type text NOT NULL,
  original_file_name text,
  summary_text text NOT NULL,
  flashcards_json jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE user_history ENABLE ROW LEVEL SECURITY;

-- Policy for users to read their own history
CREATE POLICY "Users can read own history"
  ON user_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy for users to insert their own history
CREATE POLICY "Users can insert own history"
  ON user_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Add index for better performance on user_id queries
CREATE INDEX IF NOT EXISTS idx_user_history_user_id ON user_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_history_created_at ON user_history(created_at DESC);