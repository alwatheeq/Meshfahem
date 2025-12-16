/*
  # Add Missing Admin RLS Policies
  
  ## Overview
  This migration adds missing RLS policies for admin operations that were identified
  during the comprehensive audit.
  
  ## Changes
  
  ### 1. user_feedback table
  - Add DELETE policy for admins
  
  ### 2. user_folders table
  - Add admin SELECT policy to view all folders
  - Add admin DELETE policy to delete any folder
  
  ### 3. tags table
  - Add admin SELECT policy to view all tags
  - Add admin INSERT policy to create public tags
  - Add admin UPDATE policy to modify tags
  - Add admin DELETE policy to remove tags
  
  ### 4. transactions table
  - Add admin SELECT policy to view all transactions
  
  ### 5. promotional_codes table
  - Add admin CRUD policies for managing promo codes
  
  ## Security
  - All policies check is_admin_user() function
  - Regular users retain their existing access
  - Admins get full access for management purposes
*/

-- =====================================================================
-- user_feedback: Add DELETE policy for admins
-- =====================================================================

CREATE POLICY "Admins can delete feedback"
  ON user_feedback
  FOR DELETE
  TO authenticated
  USING (is_admin_user());

-- =====================================================================
-- user_folders: Add admin policies
-- =====================================================================

-- Check if policy already exists before creating
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_folders' 
    AND policyname = 'Admins can view all folders'
  ) THEN
    CREATE POLICY "Admins can view all folders"
      ON user_folders
      FOR SELECT
      TO authenticated
      USING (is_admin_user());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_folders' 
    AND policyname = 'Admins can delete any folder'
  ) THEN
    CREATE POLICY "Admins can delete any folder"
      ON user_folders
      FOR DELETE
      TO authenticated
      USING (is_admin_user());
  END IF;
END $$;

-- =====================================================================
-- tags: Add admin policies
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tags' 
    AND policyname = 'Admins can view all tags'
  ) THEN
    CREATE POLICY "Admins can view all tags"
      ON tags
      FOR SELECT
      TO authenticated
      USING (is_admin_user());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tags' 
    AND policyname = 'Admins can create tags'
  ) THEN
    CREATE POLICY "Admins can create tags"
      ON tags
      FOR INSERT
      TO authenticated
      WITH CHECK (is_admin_user());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tags' 
    AND policyname = 'Admins can update tags'
  ) THEN
    CREATE POLICY "Admins can update tags"
      ON tags
      FOR UPDATE
      TO authenticated
      USING (is_admin_user())
      WITH CHECK (is_admin_user());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tags' 
    AND policyname = 'Admins can delete tags'
  ) THEN
    CREATE POLICY "Admins can delete tags"
      ON tags
      FOR DELETE
      TO authenticated
      USING (is_admin_user());
  END IF;
END $$;

-- =====================================================================
-- transactions: Add admin SELECT policy
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'transactions' 
    AND policyname = 'Admins can view all transactions'
  ) THEN
    CREATE POLICY "Admins can view all transactions"
      ON transactions
      FOR SELECT
      TO authenticated
      USING (is_admin_user());
  END IF;
END $$;

-- =====================================================================
-- promotional_codes: Add admin policies
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'promotional_codes' 
    AND policyname = 'Admins can view all promo codes'
  ) THEN
    CREATE POLICY "Admins can view all promo codes"
      ON promotional_codes
      FOR SELECT
      TO authenticated
      USING (is_admin_user());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'promotional_codes' 
    AND policyname = 'Admins can create promo codes'
  ) THEN
    CREATE POLICY "Admins can create promo codes"
      ON promotional_codes
      FOR INSERT
      TO authenticated
      WITH CHECK (is_admin_user());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'promotional_codes' 
    AND policyname = 'Admins can update promo codes'
  ) THEN
    CREATE POLICY "Admins can update promo codes"
      ON promotional_codes
      FOR UPDATE
      TO authenticated
      USING (is_admin_user())
      WITH CHECK (is_admin_user());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'promotional_codes' 
    AND policyname = 'Admins can delete promo codes'
  ) THEN
    CREATE POLICY "Admins can delete promo codes"
      ON promotional_codes
      FOR DELETE
      TO authenticated
      USING (is_admin_user());
  END IF;
END $$;

-- =====================================================================
-- token_usage_history: Verify admin access (policies should exist)
-- =====================================================================

-- Admins should already have access via existing policies, but verify
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'token_usage_history' 
    AND policyname = 'Admins can view all token history'
  ) THEN
    CREATE POLICY "Admins can view all token history"
      ON token_usage_history
      FOR SELECT
      TO authenticated
      USING (is_admin_user());
  END IF;
END $$;

-- =====================================================================
-- Add helpful comments
-- =====================================================================

COMMENT ON POLICY "Admins can delete feedback" ON user_feedback IS 
  'Allows admins to delete inappropriate or resolved feedback';

COMMENT ON POLICY "Admins can view all folders" ON user_folders IS 
  'Allows admins to view all user folders for moderation';

COMMENT ON POLICY "Admins can delete any folder" ON user_folders IS 
  'Allows admins to delete folders containing inappropriate content';

COMMENT ON POLICY "Admins can view all tags" ON tags IS 
  'Allows admins to view and manage all tags in the system';

COMMENT ON POLICY "Admins can view all transactions" ON transactions IS 
  'Allows admins to view transaction history for support and reporting';
