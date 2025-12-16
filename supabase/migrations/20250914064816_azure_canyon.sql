/*
  # Add sharing features to user library items

  1. New Columns
    - `shareable_link` (uuid) - unique identifier for public sharing
    - `is_public` (boolean) - whether the item is publicly accessible

  2. Security
    - Add RLS policy for public access to shared items
    - Update existing policies to handle public sharing

  3. Indexes
    - Add index on shareable_link for fast public lookups
*/

-- Add new columns for sharing
ALTER TABLE user_library_items 
ADD COLUMN IF NOT EXISTS shareable_link uuid,
ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

-- Add index for fast shareable link lookups
CREATE INDEX IF NOT EXISTS idx_user_library_items_shareable_link 
ON user_library_items (shareable_link) 
WHERE shareable_link IS NOT NULL;

-- Add RLS policy for public access to shared items
CREATE POLICY "Allow public read access to shared items"
ON user_library_items
FOR SELECT
TO anon
USING (is_public = true AND shareable_link IS NOT NULL);

-- Allow authenticated users to read all library items
CREATE POLICY "Allow authenticated users to read all library items"
ON user_library_items
FOR SELECT
TO authenticated
USING (true);
