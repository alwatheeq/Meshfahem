/*
  # Fix Public Library Access and Statistics Tracking System

  This migration implements:
  1. Public library sharing for community content
  2. Study sessions tracking for accurate statistics
  3. Automatic stat updates through triggers
  4. Streak calculation functions
*/

-- ============================================
-- 1. PUBLIC LIBRARY ACCESS POLICIES
-- ============================================

-- Drop existing restrictive policies and recreate
DROP POLICY IF EXISTS "Users can read own library items" ON user_library_items;
DROP POLICY IF EXISTS "Users can read public library items" ON user_library_items;

-- Allow users to read their own items
CREATE POLICY "Users can read own library items"
  ON user_library_items
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow users to read public items from others
CREATE POLICY "Users can read public library items"
  ON user_library_items
  FOR SELECT
  TO authenticated
  USING (is_public = true AND shareable_link IS NOT NULL);

-- Create indexes for optimized queries
CREATE INDEX IF NOT EXISTS idx_user_library_items_public_created 
  ON user_library_items(created_at DESC)
  WHERE is_public = true;

CREATE INDEX IF NOT EXISTS idx_user_library_items_user_public 
  ON user_library_items(user_id, is_public);

-- ============================================
-- 2. STUDY SESSIONS TRACKING TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type text NOT NULL CHECK (session_type IN ('flashcard_study', 'quiz_attempt', 'content_review', 'video_watch')),
  related_item_id uuid,
  duration_minutes integer NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
  flashcards_reviewed integer DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for study_sessions
CREATE POLICY "Users can manage own study sessions"
  ON study_sessions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_study_sessions_user 
  ON study_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_date 
  ON study_sessions(user_id, completed_at);

CREATE INDEX IF NOT EXISTS idx_study_sessions_completed 
  ON study_sessions(completed_at DESC);

-- ============================================
-- 3. STREAK CALCULATION FUNCTIONS
-- ============================================

-- Function to calculate consecutive study days
CREATE OR REPLACE FUNCTION calculate_study_streak(p_user_id uuid)
RETURNS TABLE(current_streak integer, longest_streak integer)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_current_streak integer := 0;
  v_longest_streak integer := 0;
  v_last_date date;
  v_streak_counter integer := 0;
  v_max_streak integer := 0;
  v_date_record record;
BEGIN
  -- Get distinct study dates ordered by date descending
  FOR v_date_record IN 
    SELECT DISTINCT DATE(completed_at) as study_date
    FROM study_sessions
    WHERE user_id = p_user_id
    ORDER BY study_date DESC
  LOOP
    -- First iteration
    IF v_last_date IS NULL THEN
      v_last_date := v_date_record.study_date;
      v_streak_counter := 1;
      
      -- Check if studied today or yesterday for current streak
      IF v_last_date >= CURRENT_DATE - INTERVAL '1 day' THEN
        v_current_streak := 1;
      END IF;
    ELSE
      -- Check if consecutive day
      IF v_last_date - v_date_record.study_date = 1 THEN
        v_streak_counter := v_streak_counter + 1;
        
        -- Update current streak if still consecutive from today/yesterday
        IF v_last_date >= CURRENT_DATE - INTERVAL '1 day' THEN
          v_current_streak := v_streak_counter;
        END IF;
      ELSE
        -- Streak broken, check if this was the longest
        IF v_streak_counter > v_max_streak THEN
          v_max_streak := v_streak_counter;
        END IF;
        v_streak_counter := 1;
      END IF;
      
      v_last_date := v_date_record.study_date;
    END IF;
  END LOOP;
  
  -- Final check for longest streak
  IF v_streak_counter > v_max_streak THEN
    v_max_streak := v_streak_counter;
  END IF;
  
  -- Longest streak should be at least as long as current
  IF v_current_streak > v_max_streak THEN
    v_max_streak := v_current_streak;
  END IF;
  
  current_streak := v_current_streak;
  longest_streak := v_max_streak;
  
  RETURN NEXT;
END;
$$;

-- ============================================
-- 4. STUDY SESSION TRIGGERS
-- ============================================

-- Function to update stats after study session
CREATE OR REPLACE FUNCTION update_stats_after_study_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_streak integer;
  v_longest_streak integer;
BEGIN
  -- Calculate streaks
  SELECT * INTO v_current_streak, v_longest_streak
  FROM calculate_study_streak(NEW.user_id);
  
  -- Update user profile stats
  UPDATE user_profiles
  SET
    last_study_date = CURRENT_DATE,
    study_streak_current = v_current_streak,
    study_streak_longest = GREATEST(study_streak_longest, v_longest_streak),
    total_study_time_minutes = total_study_time_minutes + NEW.duration_minutes,
    total_flashcards_studied = CASE 
      WHEN NEW.session_type = 'flashcard_study' 
      THEN total_flashcards_studied + COALESCE(NEW.flashcards_reviewed, 0)
      ELSE total_flashcards_studied
    END,
    experience_points = experience_points + CASE 
      WHEN NEW.session_type = 'flashcard_study' THEN 5
      WHEN NEW.session_type = 'quiz_attempt' THEN 10
      WHEN NEW.session_type = 'content_review' THEN 3
      ELSE 2
    END
  WHERE id = NEW.user_id;
  
  -- Update level based on new XP
  UPDATE user_profiles
  SET level = calculate_user_level(experience_points)
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$;

-- Create trigger for study session stats
DROP TRIGGER IF EXISTS trigger_update_stats_after_study_session ON study_sessions;
CREATE TRIGGER trigger_update_stats_after_study_session
  AFTER INSERT ON study_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_stats_after_study_session();

-- ============================================
-- 5. LIBRARY ITEM PUBLICATION TRIGGER UPDATE
-- ============================================

-- Update the existing trigger function to handle library publications
DROP TRIGGER IF EXISTS trigger_increment_published_count ON user_library_items;
DROP TRIGGER IF EXISTS trigger_update_library_item_stats ON user_library_items;
DROP FUNCTION IF EXISTS increment_published_count() CASCADE;
DROP FUNCTION IF EXISTS update_library_item_stats() CASCADE;

CREATE OR REPLACE FUNCTION update_library_item_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Handle INSERT of new library items
  IF TG_OP = 'INSERT' THEN
    -- Award XP for creating library item
    UPDATE user_profiles
    SET 
      experience_points = experience_points + 5,
      level = calculate_user_level(experience_points + 5)
    WHERE id = NEW.user_id;
    
    -- If item is public on creation, increment published count
    IF NEW.is_public = true THEN
      UPDATE user_profiles
      SET items_published_count = items_published_count + 1
      WHERE id = NEW.user_id;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Handle UPDATE of library items
  IF TG_OP = 'UPDATE' THEN
    -- Increment count when item is made public
    IF NEW.is_public = true AND (OLD.is_public IS NULL OR OLD.is_public = false) THEN
      UPDATE user_profiles
      SET items_published_count = items_published_count + 1
      WHERE id = NEW.user_id;
    END IF;
    
    -- Decrement count when item is made private
    IF NEW.is_public = false AND OLD.is_public = true THEN
      UPDATE user_profiles
      SET items_published_count = GREATEST(0, items_published_count - 1)
      WHERE id = NEW.user_id;
    END IF;
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Create trigger for library item stats
CREATE TRIGGER trigger_update_library_item_stats
  AFTER INSERT OR UPDATE ON user_library_items
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION update_library_item_stats();

-- ============================================
-- 6. INITIALIZE EXISTING USER STATS
-- ============================================

-- Backfill items_published_count for existing users
UPDATE user_profiles up
SET items_published_count = (
  SELECT COALESCE(COUNT(*), 0)
  FROM user_library_items uli
  WHERE uli.user_id = up.id
    AND uli.is_public = true
);
