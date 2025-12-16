/*
  # User Notes & Tags System

  ## Overview
  This migration creates tables for admin notes and tags on user profiles.
  Allows admins to add notes and tags to users for better organization and tracking.

  ## Changes

  1. Create user_notes table
  2. Create user_tags table
  3. Add RLS policies
  4. Create helper functions
*/

-- =====================================================================
-- STEP 1: Create user_notes table
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_notes ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_notes_user_id ON user_notes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notes_admin_id ON user_notes(admin_id);

-- RLS Policy: Admins can view all notes
CREATE POLICY "Admins can view all user notes"
  ON user_notes
  FOR SELECT
  TO authenticated
  USING (is_admin_user());

-- RLS Policy: Admins can insert notes
CREATE POLICY "Admins can insert user notes"
  ON user_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_user());

-- RLS Policy: Admins can update their own notes
CREATE POLICY "Admins can update own notes"
  ON user_notes
  FOR UPDATE
  TO authenticated
  USING (is_admin_user() AND admin_id = auth.uid())
  WITH CHECK (is_admin_user() AND admin_id = auth.uid());

-- RLS Policy: Admins can delete their own notes
CREATE POLICY "Admins can delete own notes"
  ON user_notes
  FOR DELETE
  TO authenticated
  USING (is_admin_user() AND admin_id = auth.uid());

-- Trigger to update updated_at
CREATE TRIGGER update_user_notes_updated_at
  BEFORE UPDATE ON user_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- STEP 2: Create user_tags table
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_name text NOT NULL,
  created_by uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tag_name)
);

-- Enable RLS
ALTER TABLE user_tags ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_tags_user_id ON user_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tags_tag_name ON user_tags(tag_name);
CREATE INDEX IF NOT EXISTS idx_user_tags_created_by ON user_tags(created_by);

-- RLS Policy: Admins can view all tags
CREATE POLICY "Admins can view all user tags"
  ON user_tags
  FOR SELECT
  TO authenticated
  USING (is_admin_user());

-- RLS Policy: Admins can insert tags
CREATE POLICY "Admins can insert user tags"
  ON user_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_user());

-- RLS Policy: Admins can delete tags
CREATE POLICY "Admins can delete user tags"
  ON user_tags
  FOR DELETE
  TO authenticated
  USING (is_admin_user());

-- =====================================================================
-- STEP 3: Create Helper Functions
-- =====================================================================

-- Function: Get user notes with admin info
CREATE OR REPLACE FUNCTION get_user_notes(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  note text,
  admin_email text,
  created_at timestamptz,
  updated_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT 
    un.id,
    un.note,
    au.email as admin_email,
    un.created_at,
    un.updated_at
  FROM user_notes un
  JOIN admin_users au ON un.admin_id = au.id
  WHERE un.user_id = p_user_id
  ORDER BY un.created_at DESC;
END;
$$;

COMMENT ON FUNCTION get_user_notes IS 'Get all notes for a user with admin email';

-- Function: Get user tags
CREATE OR REPLACE FUNCTION get_user_tags(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  tag_name text,
  created_by_email text,
  created_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT 
    ut.id,
    ut.tag_name,
    au.email as created_by_email,
    ut.created_at
  FROM user_tags ut
  JOIN admin_users au ON ut.created_by = au.id
  WHERE ut.user_id = p_user_id
  ORDER BY ut.created_at DESC;
END;
$$;

COMMENT ON FUNCTION get_user_tags IS 'Get all tags for a user';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_notes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_tags(uuid) TO authenticated;

