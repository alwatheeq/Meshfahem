/*
  # Add Alphabetical Ordering Indexes

  1. Purpose
    - Improve performance of alphabetically sorted queries for tags and folders
    - Support efficient alphabetical filtering and display in the UI

  2. Changes
    - Add index on tags.name for alphabetical sorting performance
    - Add index on user_folders.name for alphabetical sorting performance

  3. Performance Impact
    - Faster ORDER BY name queries on tags table
    - Faster ORDER BY name queries on user_folders table
    - Improved user experience when browsing tags and folders

  4. Notes
    - Indexes use COLLATE "C" for case-sensitive sorting
    - If case-insensitive sorting is needed, use LOWER(name) index instead
*/

-- Add index for tags table alphabetical sorting
CREATE INDEX IF NOT EXISTS idx_tags_name_alphabetical
ON tags(name COLLATE "C");

-- Add index for user_folders table alphabetical sorting
CREATE INDEX IF NOT EXISTS idx_user_folders_name_alphabetical
ON user_folders(name COLLATE "C");

-- Add composite index for tags by user with alphabetical name ordering
CREATE INDEX IF NOT EXISTS idx_tags_user_name_alphabetical
ON tags(user_id, name COLLATE "C");

-- Add composite index for folders by user with alphabetical name ordering
CREATE INDEX IF NOT EXISTS idx_user_folders_user_name_alphabetical
ON user_folders(user_id, name COLLATE "C");
