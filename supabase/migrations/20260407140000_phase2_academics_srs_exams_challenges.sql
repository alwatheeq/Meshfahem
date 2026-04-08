-- Phase 2: Academics Enhancement - SRS, Exam Scheduler, Daily Challenges
-- Local migration file - apply via supabase db push when ready

-- ============================================================
-- 1. SRS Card State - Spaced Repetition tracking per flashcard
-- ============================================================
CREATE TABLE IF NOT EXISTS srs_card_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL,
  card_index INTEGER NOT NULL,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, item_id, card_index)
);

COMMENT ON TABLE srs_card_state IS 'Tracks spaced repetition state for each flashcard per user';
COMMENT ON COLUMN srs_card_state.ease_factor IS 'SM-2 ease factor, starts at 2.5';
COMMENT ON COLUMN srs_card_state.interval_days IS 'Current interval in days until next review';
COMMENT ON COLUMN srs_card_state.repetitions IS 'Number of consecutive correct reviews';

ALTER TABLE srs_card_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own srs cards" ON srs_card_state;
CREATE POLICY "Users can view own srs cards" ON srs_card_state
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own srs cards" ON srs_card_state;
CREATE POLICY "Users can insert own srs cards" ON srs_card_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own srs cards" ON srs_card_state;
CREATE POLICY "Users can update own srs cards" ON srs_card_state
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own srs cards" ON srs_card_state;
CREATE POLICY "Users can delete own srs cards" ON srs_card_state
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 2. Course Exams - Exam dates and countdowns
-- ============================================================
CREATE TABLE IF NOT EXISTS course_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academics_courses(id) ON DELETE CASCADE,
  exam_name TEXT NOT NULL,
  exam_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE course_exams IS 'Tracks exam dates per course for countdown and study planning';

ALTER TABLE course_exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own exams" ON course_exams;
CREATE POLICY "Users can view own exams" ON course_exams
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own exams" ON course_exams;
CREATE POLICY "Users can insert own exams" ON course_exams
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own exams" ON course_exams;
CREATE POLICY "Users can update own exams" ON course_exams
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own exams" ON course_exams;
CREATE POLICY "Users can delete own exams" ON course_exams
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 3. Daily Challenges - One challenge per course per day
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academics_courses(id) ON DELETE CASCADE,
  challenge_date DATE NOT NULL DEFAULT CURRENT_DATE,
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('flashcard_review', 'quiz', 'mixed')),
  challenge_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  xp_earned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, course_id, challenge_date)
);

COMMENT ON TABLE daily_challenges IS 'Daily study challenges generated from course content';

ALTER TABLE daily_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own challenges" ON daily_challenges;
CREATE POLICY "Users can view own challenges" ON daily_challenges
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own challenges" ON daily_challenges;
CREATE POLICY "Users can insert own challenges" ON daily_challenges
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own challenges" ON daily_challenges;
CREATE POLICY "Users can update own challenges" ON daily_challenges
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own challenges" ON daily_challenges;
CREATE POLICY "Users can delete own challenges" ON daily_challenges
  FOR DELETE USING (auth.uid() = user_id);
