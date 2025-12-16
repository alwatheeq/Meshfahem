/*
  # Add original_text_content column to user_library_items

  1. New Columns
    - `original_text_content` (text, nullable) - stores full extracted text for library items
    - `last_viewed_at` (timestamptz, nullable) - tracks when items were last viewed
    - `topics` (text array, nullable) - stores detected topics

  2. Changes
    - Add columns to support full content storage and better organization
*/

-- Add original_text_content column to user_library_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_library_items' AND column_name = 'original_text_content'
  ) THEN
    ALTER TABLE user_library_items ADD COLUMN original_text_content text;
  END IF;
END $$;

-- Add last_viewed_at column to user_library_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_library_items' AND column_name = 'last_viewed_at'
  ) THEN
    ALTER TABLE user_library_items ADD COLUMN last_viewed_at timestamptz;
  END IF;
END $$;

-- Add topics column to user_library_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_library_items' AND column_name = 'topics'
  ) THEN
    ALTER TABLE user_library_items ADD COLUMN topics text[];
  END IF;
END $$;