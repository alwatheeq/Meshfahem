/*
  # Update user_history table with original text content

  1. New Columns
    - `original_text_content` (text, nullable, stores full extracted text for history entries)
  
  2. Changes
    - Add column to store original extracted text for dual-mode display
*/

-- Add original_text_content column to user_history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_history' AND column_name = 'original_text_content'
  ) THEN
    ALTER TABLE user_history ADD COLUMN original_text_content text;
  END IF;
END $$;