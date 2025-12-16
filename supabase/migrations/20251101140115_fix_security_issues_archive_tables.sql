/*
  # Fix Security Issues - Part 3: Archive Tables

  ## Overview
  Fix archive tables by adding primary keys and enabling RLS.

  ## Changes
  1. Add primary key to admin_user_profile_archive
  2. Add primary key to admin_subscription_archive
  3. Enable RLS on both archive tables
  4. Add appropriate RLS policies

  ## Security Impact
  - Ensures archive tables have proper primary keys
  - Enables row-level security on archive tables
  - Restricts access to admins only
*/

-- ============================================================================
-- ADMIN_USER_PROFILE_ARCHIVE
-- ============================================================================

-- Add id column as primary key if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_user_profile_archive' AND column_name = 'id'
  ) THEN
    ALTER TABLE admin_user_profile_archive
    ADD COLUMN id uuid PRIMARY KEY DEFAULT gen_random_uuid();
  END IF;
END $$;

-- Enable RLS
ALTER TABLE admin_user_profile_archive ENABLE ROW LEVEL SECURITY;

-- Add admin-only access policy
DROP POLICY IF EXISTS "Only admins can view archive" ON admin_user_profile_archive;
CREATE POLICY "Only admins can view archive"
  ON admin_user_profile_archive FOR SELECT
  TO authenticated
  USING (is_admin_user((select auth.uid())::text));

-- ============================================================================
-- ADMIN_SUBSCRIPTION_ARCHIVE
-- ============================================================================

-- Add id column as primary key if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_subscription_archive' AND column_name = 'id'
  ) THEN
    ALTER TABLE admin_subscription_archive
    ADD COLUMN id uuid PRIMARY KEY DEFAULT gen_random_uuid();
  END IF;
END $$;

-- Enable RLS
ALTER TABLE admin_subscription_archive ENABLE ROW LEVEL SECURITY;

-- Add admin-only access policy
DROP POLICY IF EXISTS "Only admins can view archive" ON admin_subscription_archive;
CREATE POLICY "Only admins can view archive"
  ON admin_subscription_archive FOR SELECT
  TO authenticated
  USING (is_admin_user((select auth.uid())::text));
