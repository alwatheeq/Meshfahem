/*
  # Simplify Library Visibility System

  ## Overview
  This migration simplifies the library visibility system based on new requirements:
  - ALL published items are PUBLIC (is_public = true)
  - Tags are for ORGANIZATION only, NOT for visibility control
  - Subscription enforcement happens at application level, not database level
  - Users can see their own items AND all public items from other users

  ## Changes

  ### 1. Update RLS Policies for user_library_items
  - Remove complex tag-based visibility logic
  - Simplify to: users can see own items OR public items
  - Keep anonymous access via shareable_link for sharing specific items

  ### 2. Keep Tag System for Organization
  - Tags remain for filtering and organization
  - Public/private tags still exist for admin vs user-created tags
  - Tag visibility does NOT affect item visibility

  ### 3. Security Notes
  - Subscription checks enforced at React component level (SubscriptionGuard)
  - Database allows all authenticated users to read public items
  - This enables proper subscription prompts at UI level
*/

-- ============================================
-- 1. DROP COMPLEX TAG-BASED VISIBILITY POLICIES
-- ============================================

-- Drop the complex policy that checks for public tags
DROP POLICY IF EXISTS "Users can read items with public tags or own items" ON user_library_items;

-- Drop old policies that may conflict
DROP POLICY IF EXISTS "Users can read public library items" ON user_library_items;
DROP POLICY IF EXISTS "Allow authenticated users to read all library items" ON user_library_items;

-- ============================================
-- 2. CREATE SIMPLIFIED RLS POLICIES
-- ============================================

-- Policy 1: Users can always read their own library items
CREATE POLICY "Users can read own library items"
  ON user_library_items
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy 2: Users can read all public items from any user
CREATE POLICY "Users can read all public library items"
  ON user_library_items
  FOR SELECT
  TO authenticated
  USING (is_public = true);

-- Policy 3: Keep anonymous access via shareable link for direct sharing
DROP POLICY IF EXISTS "Allow public access via shareable link" ON user_library_items;
DROP POLICY IF EXISTS "Allow public read access to shared items" ON user_library_items;

CREATE POLICY "Anonymous users can access items via shareable link"
  ON user_library_items
  FOR SELECT
  TO anon
  USING (is_public = true AND shareable_link IS NOT NULL);

-- ============================================
-- 3. ADD HELPFUL COMMENTS
-- ============================================

COMMENT ON POLICY "Users can read own library items" ON user_library_items IS
  'Allows users to always see their own library items regardless of public status';

COMMENT ON POLICY "Users can read all public library items" ON user_library_items IS
  'Allows all authenticated users to see public library items. Subscription enforcement happens at application level via SubscriptionGuard component.';

COMMENT ON POLICY "Anonymous users can access items via shareable link" ON user_library_items IS
  'Allows anonymous users to view specific items shared via shareable link';

-- ============================================
-- 4. CREATE HELPER VIEW FOR COMMUNITY LIBRARY
-- ============================================

-- Create or replace a view that shows community items (public items from other users)
CREATE OR REPLACE VIEW community_library_items AS
SELECT
  uli.*,
  up.email as creator_email,
  COALESCE(
    (SELECT json_agg(json_build_object('like_count', COUNT(*)))
     FROM reactions r
     WHERE r.item_id = uli.id AND r.reaction_type = 'like'
     GROUP BY r.item_id),
    '[{"like_count": 0}]'::json
  ) as reaction_counts,
  (SELECT COUNT(*) FROM comments c WHERE c.item_id = uli.id) as comment_count
FROM user_library_items uli
LEFT JOIN user_profiles up ON uli.user_id = up.id
WHERE uli.is_public = true
ORDER BY uli.created_at DESC;

COMMENT ON VIEW community_library_items IS
  'Simplified view of all public library items with creator info and engagement metrics. Use this for community library features.';

-- ============================================
-- 5. UPDATE INDEXES FOR OPTIMIZED QUERIES
-- ============================================

-- Ensure we have an index on is_public for fast public item queries
CREATE INDEX IF NOT EXISTS idx_user_library_items_public_status
  ON user_library_items(is_public)
  WHERE is_public = true;

-- Index for efficient queries combining user_id and public status
CREATE INDEX IF NOT EXISTS idx_user_library_items_user_public_created
  ON user_library_items(user_id, is_public, created_at DESC);

-- ============================================
-- 6. DATA INTEGRITY CHECK
-- ============================================

-- Ensure all items have is_public set (default to false if NULL)
UPDATE user_library_items
SET is_public = COALESCE(is_public, false)
WHERE is_public IS NULL;

-- Make is_public NOT NULL to prevent future NULL values
ALTER TABLE user_library_items
  ALTER COLUMN is_public SET DEFAULT false,
  ALTER COLUMN is_public SET NOT NULL;

-- ============================================
-- SUMMARY
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Library Visibility Simplification Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary of changes:';
  RAISE NOTICE '- Removed complex tag-based visibility policies';
  RAISE NOTICE '- Simplified to: users see own items + all public items';
  RAISE NOTICE '- Tags are now for organization only';
  RAISE NOTICE '- Subscription enforcement moved to React SubscriptionGuard';
  RAISE NOTICE '- Created community_library_items view for easy queries';
  RAISE NOTICE '- Added optimized indexes for public item queries';
  RAISE NOTICE '';
  RAISE NOTICE 'Public items count: %', (SELECT COUNT(*) FROM user_library_items WHERE is_public = true);
  RAISE NOTICE 'Private items count: %', (SELECT COUNT(*) FROM user_library_items WHERE is_public = false);
  RAISE NOTICE '';
END;
$$;
