/*
  # Add is_public Column to user_folders Table

  1. Changes
    - Add `is_public` boolean column to `user_folders` table
    - Set default value to `true` (all folders are public by default)
    - Update all existing folders to have `is_public = true`
  
  2. Purpose
    - Fix the "column user_folders.is_public does not exist" error
    - Enable future support for private folders
    - Allow folder sharing functionality to work properly
  
  3. Notes
    - All folders are public by default (as per current requirements)
    - Column is set to NOT NULL with a default value for data integrity
    - Existing folders will automatically be set to public
*/

-- Add is_public column to user_folders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_folders' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE user_folders ADD COLUMN is_public boolean DEFAULT true NOT NULL;
  END IF;
END $$;

-- Ensure all existing folders are set to public
UPDATE user_folders SET is_public = true WHERE is_public IS NULL;