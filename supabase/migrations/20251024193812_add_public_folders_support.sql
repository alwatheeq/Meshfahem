/*
  # Add Public Folders Support

  This migration implements:
  1. Add is_public column to user_folders table
  2. Create RLS policies for public folder access
  3. Add indexes for optimized public folder queries
  4. Backfill existing folders as private (default)

  ## Changes

  ### Schema Changes
  - Add `is_public` boolean column to user_folders (default: false)

  ### Security
  - Allow users to read public folders from all users
  - Maintain existing policies for user's own folders

  ### Performance
  - Add indexes for public folder queries
*/

-- ============================================
-- 1. ADD IS_PUBLIC COLUMN TO USER_FOLDERS
-- ============================================

-- Add is_public column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_folders' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE user_folders ADD COLUMN is_public boolean DEFAULT false;
  END IF;
END $$;

-- ============================================
-- 2. UPDATE RLS POLICIES FOR PUBLIC FOLDERS
-- ============================================

-- Drop existing policy to recreate with public access support
DROP POLICY IF EXISTS "Users can manage own folders" ON user_folders;

-- Allow users to manage their own folders (full CRUD)
CREATE POLICY "Users can manage own folders"
  ON user_folders
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Allow users to read public folders from all users
CREATE POLICY "Users can read public folders"
  ON user_folders
  FOR SELECT
  TO authenticated
  USING (is_public = true);

-- ============================================
-- 3. CREATE INDEXES FOR OPTIMIZED QUERIES
-- ============================================

-- Index for public folder queries
CREATE INDEX IF NOT EXISTS idx_user_folders_public
  ON user_folders(is_public, created_at DESC)
  WHERE is_public = true;

-- Index for user's folders with public status
CREATE INDEX IF NOT EXISTS idx_user_folders_user_public
  ON user_folders(user_id, is_public);

-- ============================================
-- 4. BACKFILL EXISTING FOLDERS AS PRIVATE
-- ============================================

-- Set all existing folders to private (is_public = false) if not already set
UPDATE user_folders
SET is_public = false
WHERE is_public IS NULL;
