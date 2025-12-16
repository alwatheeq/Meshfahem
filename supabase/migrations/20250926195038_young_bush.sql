/*
  # Add topics column to user_history table

  1. Changes
    - Add `topics` column to `user_history` table
    - Column type: text[] (array of text)
    - Allow null values for backward compatibility

  2. Notes
    - This enables storing detected topics for each history entry
    - Existing records will have null topics (backward compatible)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_history' AND column_name = 'topics'
  ) THEN
    ALTER TABLE user_history ADD COLUMN topics text[];
  END IF;
END $$;