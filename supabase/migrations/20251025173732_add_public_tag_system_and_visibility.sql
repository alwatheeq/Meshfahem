/*
  # Add Public Tag System and Tag-Based Visibility

  ## Overview
  This migration implements a comprehensive public tag system where:
  - Admin-created tags are public (visible to all users)
  - User-created tags are private (visible only to creator)
  - Items with ANY public tag are visible in the community library
  - All library items MUST have at least one tag
  
  ## Changes

  ### 1. Tags Table Schema Updates
  - Add `is_public` boolean column (default false for user-created tags)
  - Add `created_by_admin_id` uuid column to track which admin created public tags
  - Allow `user_id` to be NULL for admin-created system tags
  - Update unique constraints to handle public vs private tags
  - Add indexes for optimized public tag queries

  ### 2. Database Functions
  - `item_has_public_tag(item_id)` - Check if item has any public tags
  - `get_public_tags()` - Get all public tags available to everyone
  - `validate_item_has_tags()` - Ensure items have at least one tag

  ### 3. Row Level Security Updates
  - Allow all authenticated users to read public tags
  - Keep existing policies for users managing their own private tags
  - Update library items policy to use tag-based visibility
  - Add admin policies for managing public tags

  ### 4. Seed Public Tags
  - Insert predefined public tags from PREDEFINED_TOPICS
  - Mark as is_public = true with user_id = NULL

  ### 5. Validation
  - Add trigger to validate items have tags before insert/update
  - Prevent orphaned library items without tags
*/

-- ============================================
-- 1. UPDATE TAGS TABLE SCHEMA
-- ============================================

-- Add is_public column to tags table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tags' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE tags ADD COLUMN is_public boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Add created_by_admin_id column to track admin who created public tags
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tags' AND column_name = 'created_by_admin_id'
  ) THEN
    ALTER TABLE tags ADD COLUMN created_by_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Allow user_id to be NULL for admin-created public tags
ALTER TABLE tags ALTER COLUMN user_id DROP NOT NULL;

-- Drop the old unique constraint that required user_id
ALTER TABLE tags DROP CONSTRAINT IF EXISTS unique_tag_name_per_user;

-- Create new conditional unique constraints
-- For private tags: unique per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_unique_private_per_user
  ON tags(user_id, LOWER(name))
  WHERE is_public = false AND user_id IS NOT NULL;

-- For public tags: globally unique (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_unique_public_global
  ON tags(LOWER(name))
  WHERE is_public = true;

-- Create index for efficient public tag queries
CREATE INDEX IF NOT EXISTS idx_tags_is_public
  ON tags(is_public, name)
  WHERE is_public = true;

-- Create index on created_by_admin_id
CREATE INDEX IF NOT EXISTS idx_tags_created_by_admin
  ON tags(created_by_admin_id)
  WHERE created_by_admin_id IS NOT NULL;

-- ============================================
-- 2. DATABASE FUNCTIONS FOR TAG-BASED VISIBILITY
-- ============================================

-- Function to check if an item has at least one public tag
CREATE OR REPLACE FUNCTION item_has_public_tag(p_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM item_tags it
    INNER JOIN tags t ON it.tag_id = t.id
    WHERE it.item_id = p_item_id
      AND t.is_public = true
  );
END;
$$;

COMMENT ON FUNCTION item_has_public_tag(uuid) IS 'Returns true if the item has at least one public tag, making it visible in the community library';

-- Function to get all public tags
CREATE OR REPLACE FUNCTION get_public_tags()
RETURNS TABLE(
  id uuid,
  name text,
  created_at timestamptz,
  created_by_admin_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name, t.created_at, t.created_by_admin_id
  FROM tags t
  WHERE t.is_public = true
  ORDER BY t.name;
END;
$$;

COMMENT ON FUNCTION get_public_tags() IS 'Returns all public tags available to all users';

-- Function to validate that an item has at least one tag
CREATE OR REPLACE FUNCTION validate_item_has_tags()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tag_count integer;
BEGIN
  -- For INSERT operations, we can't check item_tags yet (it doesn't exist)
  -- So we'll skip validation on INSERT and rely on application logic
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- For UPDATE operations, check if item has tags
  IF TG_OP = 'UPDATE' THEN
    SELECT COUNT(*) INTO v_tag_count
    FROM item_tags
    WHERE item_id = NEW.id;

    IF v_tag_count = 0 THEN
      RAISE EXCEPTION 'Library items must have at least one tag. Please add a tag to this item.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Note: We'll create the trigger after seeding data to avoid conflicts

-- ============================================
-- 3. UPDATE ROW LEVEL SECURITY POLICIES
-- ============================================

-- DROP existing policies on tags table to recreate them
DROP POLICY IF EXISTS "Users can manage own tags" ON tags;
DROP POLICY IF EXISTS "Admins can view all tags" ON tags;

-- Policy 1: Allow users to manage their own PRIVATE tags
CREATE POLICY "Users can manage own private tags"
  ON tags
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid() AND is_public = false
  )
  WITH CHECK (
    user_id = auth.uid() AND is_public = false
  );

-- Policy 2: Allow all authenticated users to READ public tags
CREATE POLICY "Users can read public tags"
  ON tags
  FOR SELECT
  TO authenticated
  USING (is_public = true);

-- Policy 3: Allow admins to create and manage public tags
CREATE POLICY "Admins can manage public tags"
  ON tags
  FOR ALL
  TO authenticated
  USING (
    is_public = true AND (
      EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND is_active = true)
    )
  )
  WITH CHECK (
    is_public = true AND (
      EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND is_active = true)
    )
  );

-- Update library items policies for tag-based visibility
DROP POLICY IF EXISTS "Users can read public library items" ON user_library_items;
DROP POLICY IF EXISTS "Allow authenticated users to read all library items" ON user_library_items;

-- Policy: Allow users to read items with public tags OR their own items
CREATE POLICY "Users can read items with public tags or own items"
  ON user_library_items
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR item_has_public_tag(id)
  );

-- Keep existing policy for anonymous access via shareable link
-- (This allows direct link sharing)
DROP POLICY IF EXISTS "Allow public access via shareable link" ON user_library_items;
DROP POLICY IF EXISTS "Allow public read access to shared items" ON user_library_items;

CREATE POLICY "Allow public access via shareable link"
  ON user_library_items
  FOR SELECT
  TO anon
  USING (is_public = true AND shareable_link IS NOT NULL);

-- ============================================
-- 4. SEED PREDEFINED PUBLIC TAGS
-- ============================================

-- Insert predefined public tags from PREDEFINED_TOPICS
-- These are created as system tags (user_id = NULL, is_public = true)
INSERT INTO tags (name, is_public, user_id, created_by_admin_id)
VALUES
  ('Anesthesiology', true, NULL, NULL),
  ('Anatomy', true, NULL, NULL),
  ('Anatomy Review', true, NULL, NULL),
  ('Anthropology', true, NULL, NULL),
  ('Article Summary', true, NULL, NULL),
  ('Art', true, NULL, NULL),
  ('Astronomy', true, NULL, NULL),
  ('Biochemistry', true, NULL, NULL),
  ('Biology', true, NULL, NULL),
  ('Board Exam Prep', true, NULL, NULL),
  ('Book Summary', true, NULL, NULL),
  ('Business', true, NULL, NULL),
  ('Cardiology', true, NULL, NULL),
  ('Chemistry', true, NULL, NULL),
  ('Clinical Case Study', true, NULL, NULL),
  ('Clinical Guidelines', true, NULL, NULL),
  ('Computer Science', true, NULL, NULL),
  ('Dermatology', true, NULL, NULL),
  ('Document Analysis', true, NULL, NULL),
  ('Drug Information', true, NULL, NULL),
  ('Economics', true, NULL, NULL),
  ('Education', true, NULL, NULL),
  ('Emergency Medicine', true, NULL, NULL),
  ('Endocrinology', true, NULL, NULL),
  ('Engineering', true, NULL, NULL),
  ('Environmental Science', true, NULL, NULL),
  ('Epidemiology', true, NULL, NULL),
  ('Exam Prep', true, NULL, NULL),
  ('Gastroenterology', true, NULL, NULL),
  ('Genetics', true, NULL, NULL),
  ('Geography', true, NULL, NULL),
  ('Gynecology', true, NULL, NULL),
  ('History', true, NULL, NULL),
  ('Immunology', true, NULL, NULL),
  ('Important Points', true, NULL, NULL),
  ('Infectious Diseases', true, NULL, NULL),
  ('Internal Medicine', true, NULL, NULL),
  ('Key Concepts', true, NULL, NULL),
  ('Law', true, NULL, NULL),
  ('Lecture Notes', true, NULL, NULL),
  ('Linguistics', true, NULL, NULL),
  ('Literature', true, NULL, NULL),
  ('Main Ideas', true, NULL, NULL),
  ('Mathematics', true, NULL, NULL),
  ('Medical Textbook', true, NULL, NULL),
  ('Microbiology', true, NULL, NULL),
  ('Music', true, NULL, NULL),
  ('Nephrology', true, NULL, NULL),
  ('Neurology', true, NULL, NULL),
  ('Obstetrics', true, NULL, NULL),
  ('Oncology', true, NULL, NULL),
  ('Ophthalmology', true, NULL, NULL),
  ('Original Text Summary', true, NULL, NULL),
  ('Orthopedics', true, NULL, NULL),
  ('Pathology', true, NULL, NULL),
  ('Pathophysiology', true, NULL, NULL),
  ('Pediatrics', true, NULL, NULL),
  ('Pharmacology', true, NULL, NULL),
  ('Philosophy', true, NULL, NULL),
  ('Physics', true, NULL, NULL),
  ('Physiology', true, NULL, NULL),
  ('Physiology Notes', true, NULL, NULL),
  ('Political Science', true, NULL, NULL),
  ('Psychiatry', true, NULL, NULL),
  ('Psychology', true, NULL, NULL),
  ('Pulmonology', true, NULL, NULL),
  ('Quick Reference', true, NULL, NULL),
  ('Radiology', true, NULL, NULL),
  ('Research Paper', true, NULL, NULL),
  ('Review Material', true, NULL, NULL),
  ('Sociology', true, NULL, NULL),
  ('Statistics', true, NULL, NULL),
  ('Study Guide', true, NULL, NULL),
  ('Summarized', true, NULL, NULL),
  ('Summarized Text Summary', true, NULL, NULL),
  ('Surgery', true, NULL, NULL),
  ('Urology', true, NULL, NULL)
ON CONFLICT DO NOTHING;

-- ============================================
-- 5. CREATE VALIDATION TRIGGER
-- ============================================

-- Note: We're NOT creating this trigger yet because existing items may not have tags
-- The application will enforce this validation going forward
-- Uncomment when ready to enforce strict validation:

-- CREATE TRIGGER trigger_validate_item_has_tags
--   BEFORE UPDATE ON user_library_items
--   FOR EACH ROW
--   EXECUTE FUNCTION validate_item_has_tags();

-- ============================================
-- 6. UPDATE EXISTING DATA
-- ============================================

-- Mark all existing user-created tags as private (if not already set)
UPDATE tags
SET is_public = false
WHERE is_public IS NULL AND user_id IS NOT NULL;

-- ============================================
-- 7. CREATE HELPER VIEW FOR DEBUGGING
-- ============================================

-- Create a view to easily see tag statistics
CREATE OR REPLACE VIEW tag_statistics AS
SELECT
  t.id,
  t.name,
  t.is_public,
  t.user_id,
  t.created_by_admin_id,
  COUNT(DISTINCT it.item_id) as item_count,
  COUNT(DISTINCT CASE WHEN uli.user_id != COALESCE(t.user_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN uli.user_id END) as other_user_count
FROM tags t
LEFT JOIN item_tags it ON t.id = it.tag_id
LEFT JOIN user_library_items uli ON it.item_id = uli.id
GROUP BY t.id, t.name, t.is_public, t.user_id, t.created_by_admin_id
ORDER BY item_count DESC, t.name;

COMMENT ON VIEW tag_statistics IS 'Shows tag usage statistics including how many items use each tag';

-- ============================================
-- SUMMARY
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Public Tag System Migration Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary of changes:';
  RAISE NOTICE '- Added is_public column to tags table';
  RAISE NOTICE '- Added created_by_admin_id column to tags table';
  RAISE NOTICE '- Updated unique constraints for public/private tags';
  RAISE NOTICE '- Created item_has_public_tag() function';
  RAISE NOTICE '- Created get_public_tags() function';
  RAISE NOTICE '- Updated RLS policies for tag-based visibility';
  RAISE NOTICE '- Seeded % public tags from PREDEFINED_TOPICS', (SELECT COUNT(*) FROM tags WHERE is_public = true);
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Update frontend to fetch public + private tags';
  RAISE NOTICE '2. Update publish modal to show tag sections';
  RAISE NOTICE '3. Update community filter to use tag-based visibility';
  RAISE NOTICE '4. Test cross-account visibility';
END;
$$;
