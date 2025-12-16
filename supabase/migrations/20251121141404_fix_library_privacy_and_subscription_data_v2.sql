/*
  # Fix Library Privacy and Subscription Data (v2)

  ## Overview
  This migration ensures all library content is public by default and validates subscription data integrity.
  Handles tag deduplication before making all tags public.

  ## 1. Library Privacy Fixes
    - Deduplicate tags before making them public
    - Set all `user_library_items.is_public` to TRUE
    - Set all `user_folders.is_public` to TRUE (if column exists)
    - Set all `tags.is_public` to TRUE
    - Add default constraints to ensure future records are public

  ## 2. Subscription Data Validation
    - Ensure all subscriptions have `billing_cycle_end` set
    - Validate `token_limit` is set to 520000
    - Fix any subscriptions with invalid `end_date`

  ## 3. Database Constraints
    - Make `is_public` NOT NULL with DEFAULT TRUE where applicable
*/

-- ============================================================================
-- TAG DEDUPLICATION (CRITICAL - DO THIS FIRST)
-- ============================================================================

-- Create a temporary function to merge duplicate tags
CREATE OR REPLACE FUNCTION merge_duplicate_tags()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  tag_record RECORD;
  canonical_tag_id uuid;
BEGIN
  -- For each tag name that has duplicates
  FOR tag_record IN 
    SELECT lower(name) as tag_name_lower, COUNT(*) as tag_count
    FROM tags
    GROUP BY lower(name)
    HAVING COUNT(*) > 1
  LOOP
    -- Find the canonical tag (prefer public ones, then oldest)
    SELECT id INTO canonical_tag_id
    FROM tags
    WHERE lower(name) = tag_record.tag_name_lower
    ORDER BY is_public DESC, created_at ASC
    LIMIT 1;
    
    -- Update all item_tags references to point to the canonical tag
    UPDATE item_tags
    SET tag_id = canonical_tag_id
    WHERE tag_id IN (
      SELECT id FROM tags 
      WHERE lower(name) = tag_record.tag_name_lower 
      AND id != canonical_tag_id
    )
    AND NOT EXISTS (
      -- Avoid creating duplicate item_tag entries
      SELECT 1 FROM item_tags it2 
      WHERE it2.item_id = item_tags.item_id 
      AND it2.tag_id = canonical_tag_id
    );
    
    -- Delete duplicate item_tags that couldn't be migrated
    DELETE FROM item_tags
    WHERE tag_id IN (
      SELECT id FROM tags 
      WHERE lower(name) = tag_record.tag_name_lower 
      AND id != canonical_tag_id
    );
    
    -- Delete the duplicate tags
    DELETE FROM tags
    WHERE lower(name) = tag_record.tag_name_lower
    AND id != canonical_tag_id;
    
    RAISE NOTICE 'Merged duplicates for tag: %', tag_record.tag_name_lower;
  END LOOP;
END;
$$;

-- Execute the deduplication
SELECT merge_duplicate_tags();

-- Drop the temporary function
DROP FUNCTION merge_duplicate_tags();

-- ============================================================================
-- LIBRARY PRIVACY FIXES
-- ============================================================================

-- Update all library items to be public
UPDATE user_library_items 
SET is_public = true 
WHERE is_public IS NULL OR is_public = false;

-- Alter table to make is_public NOT NULL with DEFAULT true
DO $$
BEGIN
  -- Check if the column allows NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_library_items' 
    AND column_name = 'is_public' 
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE user_library_items 
    ALTER COLUMN is_public SET DEFAULT true,
    ALTER COLUMN is_public SET NOT NULL;
  ELSE
    ALTER TABLE user_library_items 
    ALTER COLUMN is_public SET DEFAULT true;
  END IF;
END $$;

-- Update all tags to be public (now safe after deduplication)
UPDATE tags 
SET is_public = true 
WHERE is_public IS NULL OR is_public = false;

-- Alter tags table to make is_public NOT NULL with DEFAULT true
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tags' 
    AND column_name = 'is_public' 
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE tags 
    ALTER COLUMN is_public SET DEFAULT true,
    ALTER COLUMN is_public SET NOT NULL;
  ELSE
    ALTER TABLE tags 
    ALTER COLUMN is_public SET DEFAULT true;
  END IF;
END $$;

-- Check if user_folders has is_public column and update it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_folders' AND column_name = 'is_public'
  ) THEN
    -- Update all folders to be public
    UPDATE user_folders 
    SET is_public = true 
    WHERE is_public IS NULL OR is_public = false;
    
    -- Make is_public NOT NULL with DEFAULT true
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'user_folders' 
      AND column_name = 'is_public' 
      AND is_nullable = 'YES'
    ) THEN
      ALTER TABLE user_folders 
      ALTER COLUMN is_public SET DEFAULT true,
      ALTER COLUMN is_public SET NOT NULL;
    ELSE
      ALTER TABLE user_folders 
      ALTER COLUMN is_public SET DEFAULT true;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- SUBSCRIPTION DATA VALIDATION
-- ============================================================================

-- Fix subscriptions missing billing_cycle_end
UPDATE subscriptions
SET 
  billing_cycle_end = CASE
    WHEN subscription_tier = 'monthly' THEN start_date + interval '30 days'
    WHEN subscription_tier = 'quarterly' THEN start_date + interval '90 days'
    WHEN subscription_tier = 'biannual' THEN start_date + interval '180 days'
    WHEN subscription_tier = 'trial_1day' THEN start_date + interval '1 day'
    WHEN subscription_tier = 'trial_7day' THEN start_date + interval '7 days'
    ELSE start_date + interval '30 days'
  END,
  billing_cycle_start = start_date
WHERE billing_cycle_end IS NULL AND status IN ('active', 'canceled');

-- Fix subscriptions missing proper end_date
UPDATE subscriptions
SET end_date = CASE
    WHEN subscription_tier = 'monthly' THEN start_date + interval '30 days'
    WHEN subscription_tier = 'quarterly' THEN start_date + interval '90 days'
    WHEN subscription_tier = 'biannual' THEN start_date + interval '180 days'
    WHEN subscription_tier = 'trial_1day' THEN start_date + interval '1 day'
    WHEN subscription_tier = 'trial_7day' THEN start_date + interval '7 days'
    ELSE start_date + interval '30 days'
  END
WHERE end_date IS NULL 
   OR end_date < start_date;

-- Set token_limit to 520000 for all subscriptions if not set or incorrect
UPDATE subscriptions
SET token_limit = 520000
WHERE token_limit != 520000 OR token_limit IS NULL;

-- Ensure tokens_used_current_cycle is never NULL
UPDATE subscriptions
SET tokens_used_current_cycle = 0
WHERE tokens_used_current_cycle IS NULL;

-- ============================================================================
-- ADD COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN user_library_items.is_public IS 'All library items are public by default. This ensures content is shareable and discoverable.';
COMMENT ON COLUMN tags.is_public IS 'All tags are public by default for community discoverability.';

-- ============================================================================
-- VERIFY DATA INTEGRITY
-- ============================================================================

-- Log the changes made
DO $$
DECLARE
  library_items_updated integer;
  tags_updated integer;
  subscriptions_fixed integer;
BEGIN
  SELECT COUNT(*) INTO library_items_updated FROM user_library_items WHERE is_public = true;
  SELECT COUNT(*) INTO tags_updated FROM tags WHERE is_public = true;
  SELECT COUNT(*) INTO subscriptions_fixed FROM subscriptions WHERE token_limit = 520000;
  
  RAISE NOTICE 'Migration completed successfully:';
  RAISE NOTICE '  - Library items set to public: %', library_items_updated;
  RAISE NOTICE '  - Tags set to public: %', tags_updated;
  RAISE NOTICE '  - Subscriptions with correct token limit: %', subscriptions_fixed;
END $$;
