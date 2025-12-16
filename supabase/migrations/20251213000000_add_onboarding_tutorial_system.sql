/*
  # Onboarding Tutorial System

  ## Overview
  Creates a comprehensive onboarding tutorial system that tracks:
  1. Dashboard overview tutorial completion
  2. Page-specific tutorial completion for each page

  ## Changes
  1. Add `onboarding_completed` to `user_preferences` table
  2. Create `user_page_tutorials` table to track page-specific tutorials
  3. Add RLS policies for security
  4. Create indexes for performance

  ## Pages Tracked
  - dashboard (overview)
  - library
  - quiz
  - eduplay
  - study-rooms
  - history
  - informational
  - feedback
  - profile
*/

-- =====================================================================
-- STEP 1: Add onboarding_completed to user_preferences
-- =====================================================================

ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

COMMENT ON COLUMN user_preferences.onboarding_completed IS 'Whether the user has completed the dashboard overview tutorial';

-- =====================================================================
-- STEP 2: Create user_page_tutorials table
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_page_tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_name TEXT NOT NULL CHECK (page_name IN (
    'dashboard', 'library', 'quiz', 'eduplay', 
    'study-rooms', 'history', 'informational', 
    'feedback', 'profile'
  )),
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, page_name)
);

COMMENT ON TABLE user_page_tutorials IS 'Tracks which page-specific tutorials each user has completed';
COMMENT ON COLUMN user_page_tutorials.page_name IS 'Name of the page: dashboard, library, quiz, eduplay, study-rooms, history, informational, feedback, profile';

-- =====================================================================
-- STEP 3: Create indexes for performance
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_user_page_tutorials_user_id 
ON user_page_tutorials(user_id);

CREATE INDEX IF NOT EXISTS idx_user_page_tutorials_page_name 
ON user_page_tutorials(page_name);

-- =====================================================================
-- STEP 4: Enable RLS
-- =====================================================================

ALTER TABLE user_page_tutorials ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- STEP 5: RLS Policies
-- =====================================================================

-- Users can view their own tutorial progress
CREATE POLICY "Users can view own tutorial progress"
  ON user_page_tutorials FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own tutorial progress
CREATE POLICY "Users can insert own tutorial progress"
  ON user_page_tutorials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own tutorial progress
CREATE POLICY "Users can update own tutorial progress"
  ON user_page_tutorials FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- STEP 6: Update initialize_user_preferences function
-- =====================================================================

-- Note: This function is already defined in previous migrations
-- We don't need to modify it as onboarding_completed defaults to false


