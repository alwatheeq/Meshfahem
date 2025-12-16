/*
  # Create EduPlay, Quiz Folders, and Global Exams System

  ## Overview
  This migration adds three major feature sets:
  1. EduPlay - Kahoot-style multiplayer quiz game system
  2. Quiz Folders - Organize quizzes into subject-based folders
  3. Global Exams - Standardized test preparation system

  ## 1. Quiz Folders System
  ### New Tables
    - `quiz_folders`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text, folder name)
      - `color` (text, hex color code, nullable)
      - `icon` (text, icon name, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  ### Modified Tables
    - `quiz_sessions` - Add `folder_id` column (uuid, nullable)

  ## 2. EduPlay Multiplayer System
  ### New Tables
    - `eduplay_game_sessions`
      - `id` (uuid, primary key)
      - `host_id` (uuid, references auth.users)
      - `game_code` (text, unique 6-digit code)
      - `game_title` (text)
      - `quiz_session_id` (uuid, references quiz_sessions, nullable)
      - `question_timer_seconds` (integer, 5-60 seconds)
      - `total_questions` (integer)
      - `difficulty_level` (text)
      - `status` (text: 'waiting', 'in_progress', 'completed')
      - `current_question_index` (integer)
      - `created_at` (timestamptz)
      - `started_at` (timestamptz, nullable)
      - `ended_at` (timestamptz, nullable)

    - `eduplay_participants`
      - `id` (uuid, primary key)
      - `game_session_id` (uuid, references eduplay_game_sessions)
      - `user_id` (uuid, references auth.users, nullable for guest players)
      - `display_name` (text)
      - `score` (integer, default 0)
      - `rank` (integer, nullable)
      - `is_host` (boolean, default false)
      - `joined_at` (timestamptz)
      - `left_at` (timestamptz, nullable)

    - `eduplay_game_questions`
      - `id` (uuid, primary key)
      - `game_session_id` (uuid, references eduplay_game_sessions)
      - `question_index` (integer)
      - `question_text` (text)
      - `options` (jsonb, array of answer options)
      - `correct_answer` (text)
      - `difficulty` (text)
      - `time_limit_seconds` (integer)

    - `eduplay_answers`
      - `id` (uuid, primary key)
      - `game_session_id` (uuid, references eduplay_game_sessions)
      - `participant_id` (uuid, references eduplay_participants)
      - `question_index` (integer)
      - `selected_answer` (text)
      - `is_correct` (boolean)
      - `time_taken_ms` (integer)
      - `points_earned` (integer)
      - `answered_at` (timestamptz)

  ## 3. Global Exams System
  ### New Tables
    - `global_exams`
      - `id` (uuid, primary key)
      - `exam_name` (text)
      - `exam_code` (text, unique short code)
      - `country` (text)
      - `region` (text, nullable)
      - `exam_type` (text: 'standardized', 'entrance', 'proficiency')
      - `subject` (text, nullable)
      - `description` (text, nullable)
      - `total_questions` (integer)
      - `time_limit_minutes` (integer)
      - `passing_score` (integer, nullable)
      - `difficulty_level` (text)
      - `is_active` (boolean, default true)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `global_exam_sections`
      - `id` (uuid, primary key)
      - `exam_id` (uuid, references global_exams)
      - `section_name` (text)
      - `section_order` (integer)
      - `question_count` (integer)
      - `time_limit_minutes` (integer, nullable)

    - `global_exam_questions`
      - `id` (uuid, primary key)
      - `exam_id` (uuid, references global_exams)
      - `section_id` (uuid, references global_exam_sections, nullable)
      - `question_text` (text)
      - `question_type` (text: 'multiple_choice', 'true_false', 'fill_blank')
      - `options` (jsonb, array of options)
      - `correct_answer` (text)
      - `explanation` (text, nullable)
      - `difficulty_level` (text)
      - `question_order` (integer)
      - `points` (integer, default 1)

    - `global_exam_attempts`
      - `id` (uuid, primary key)
      - `exam_id` (uuid, references global_exams)
      - `user_id` (uuid, references auth.users)
      - `answers_json` (jsonb)
      - `score_percentage` (numeric(5,2))
      - `correct_count` (integer)
      - `incorrect_count` (integer)
      - `unanswered_count` (integer)
      - `time_taken_seconds` (integer)
      - `section_scores` (jsonb, nullable)
      - `started_at` (timestamptz)
      - `completed_at` (timestamptz)

  ## 4. Security (RLS Policies)
    - Quiz folders: Users can CRUD their own folders
    - EduPlay: Public read for active games, participants can join
    - Global exams: Public read, authenticated users can attempt
    - Exam attempts: Users can only view their own attempts

  ## 5. Indexes for Performance
    - Indexes on foreign keys
    - Indexes on frequently queried columns
    - Indexes on game_code and exam_code for fast lookups
*/

-- ============================================================================
-- QUIZ FOLDERS SYSTEM
-- ============================================================================

-- Create quiz_folders table
CREATE TABLE IF NOT EXISTS quiz_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 100),
  color text CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text CHECK (icon IS NULL OR char_length(icon) <= 50),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add folder_id to quiz_sessions if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_sessions' AND column_name = 'folder_id'
  ) THEN
    ALTER TABLE quiz_sessions ADD COLUMN folder_id uuid REFERENCES quiz_folders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS on quiz_folders
ALTER TABLE quiz_folders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quiz_folders
CREATE POLICY "Users can view own quiz folders"
  ON quiz_folders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own quiz folders"
  ON quiz_folders
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quiz folders"
  ON quiz_folders
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own quiz folders"
  ON quiz_folders
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- EDUPLAY MULTIPLAYER SYSTEM
-- ============================================================================

-- Create eduplay_game_sessions table
CREATE TABLE IF NOT EXISTS eduplay_game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_code text NOT NULL UNIQUE CHECK (char_length(game_code) = 6),
  game_title text NOT NULL CHECK (char_length(game_title) > 0 AND char_length(game_title) <= 200),
  quiz_session_id uuid REFERENCES quiz_sessions(id) ON DELETE SET NULL,
  question_timer_seconds integer NOT NULL DEFAULT 30 CHECK (question_timer_seconds >= 5 AND question_timer_seconds <= 60),
  total_questions integer NOT NULL CHECK (total_questions >= 5 AND total_questions <= 50),
  difficulty_level text NOT NULL CHECK (difficulty_level IN ('easy', 'medium', 'hard')),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled')),
  current_question_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz
);

-- Create eduplay_participants table
CREATE TABLE IF NOT EXISTS eduplay_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id uuid NOT NULL REFERENCES eduplay_game_sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text NOT NULL CHECK (char_length(display_name) > 0 AND char_length(display_name) <= 50),
  score integer NOT NULL DEFAULT 0,
  rank integer,
  is_host boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz
);

-- Create eduplay_game_questions table
CREATE TABLE IF NOT EXISTS eduplay_game_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id uuid NOT NULL REFERENCES eduplay_game_sessions(id) ON DELETE CASCADE,
  question_index integer NOT NULL CHECK (question_index >= 0),
  question_text text NOT NULL CHECK (char_length(question_text) > 0),
  options jsonb NOT NULL,
  correct_answer text NOT NULL,
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  time_limit_seconds integer NOT NULL DEFAULT 30,
  UNIQUE(game_session_id, question_index)
);

-- Create eduplay_answers table
CREATE TABLE IF NOT EXISTS eduplay_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id uuid NOT NULL REFERENCES eduplay_game_sessions(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES eduplay_participants(id) ON DELETE CASCADE,
  question_index integer NOT NULL,
  selected_answer text NOT NULL,
  is_correct boolean NOT NULL,
  time_taken_ms integer NOT NULL CHECK (time_taken_ms >= 0),
  points_earned integer NOT NULL DEFAULT 0,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(participant_id, question_index)
);

-- Enable RLS on all EduPlay tables
ALTER TABLE eduplay_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE eduplay_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE eduplay_game_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE eduplay_answers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for eduplay_game_sessions
CREATE POLICY "Anyone can view active game sessions"
  ON eduplay_game_sessions
  FOR SELECT
  USING (status IN ('waiting', 'in_progress'));

CREATE POLICY "Authenticated users can create game sessions"
  ON eduplay_game_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their game sessions"
  ON eduplay_game_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their game sessions"
  ON eduplay_game_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = host_id);

-- RLS Policies for eduplay_participants
CREATE POLICY "Participants can view participants in their games"
  ON eduplay_participants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM eduplay_participants AS ep
      WHERE ep.game_session_id = eduplay_participants.game_session_id
      AND (ep.user_id = auth.uid() OR ep.user_id IS NULL)
    )
  );

CREATE POLICY "Users can join game sessions as participants"
  ON eduplay_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Participants can update their own data"
  ON eduplay_participants
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS Policies for eduplay_game_questions
CREATE POLICY "Participants can view questions in their games"
  ON eduplay_game_questions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM eduplay_participants
      WHERE eduplay_participants.game_session_id = eduplay_game_questions.game_session_id
      AND eduplay_participants.user_id = auth.uid()
      AND eduplay_participants.left_at IS NULL
    )
  );

CREATE POLICY "Hosts can insert questions for their games"
  ON eduplay_game_questions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM eduplay_game_sessions
      WHERE eduplay_game_sessions.id = game_session_id
      AND eduplay_game_sessions.host_id = auth.uid()
    )
  );

-- RLS Policies for eduplay_answers
CREATE POLICY "Participants can view their own answers"
  ON eduplay_answers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM eduplay_participants
      WHERE eduplay_participants.id = participant_id
      AND eduplay_participants.user_id = auth.uid()
    )
  );

CREATE POLICY "Participants can submit answers"
  ON eduplay_answers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM eduplay_participants
      WHERE eduplay_participants.id = participant_id
      AND eduplay_participants.user_id = auth.uid()
    )
  );

-- ============================================================================
-- GLOBAL EXAMS SYSTEM
-- ============================================================================

-- Create global_exams table
CREATE TABLE IF NOT EXISTS global_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_name text NOT NULL CHECK (char_length(exam_name) > 0 AND char_length(exam_name) <= 200),
  exam_code text NOT NULL UNIQUE CHECK (char_length(exam_code) > 0 AND char_length(exam_code) <= 20),
  country text NOT NULL CHECK (char_length(country) > 0 AND char_length(country) <= 100),
  region text CHECK (region IS NULL OR char_length(region) <= 100),
  exam_type text NOT NULL CHECK (exam_type IN ('standardized', 'entrance', 'proficiency', 'certification')),
  subject text CHECK (subject IS NULL OR char_length(subject) <= 100),
  description text,
  total_questions integer NOT NULL CHECK (total_questions > 0),
  time_limit_minutes integer NOT NULL CHECK (time_limit_minutes > 0),
  passing_score integer CHECK (passing_score IS NULL OR (passing_score >= 0 AND passing_score <= 100)),
  difficulty_level text NOT NULL CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create global_exam_sections table
CREATE TABLE IF NOT EXISTS global_exam_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES global_exams(id) ON DELETE CASCADE,
  section_name text NOT NULL CHECK (char_length(section_name) > 0 AND char_length(section_name) <= 100),
  section_order integer NOT NULL CHECK (section_order >= 0),
  question_count integer NOT NULL CHECK (question_count > 0),
  time_limit_minutes integer CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
  UNIQUE(exam_id, section_order)
);

-- Create global_exam_questions table
CREATE TABLE IF NOT EXISTS global_exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES global_exams(id) ON DELETE CASCADE,
  section_id uuid REFERENCES global_exam_sections(id) ON DELETE SET NULL,
  question_text text NOT NULL CHECK (char_length(question_text) > 0),
  question_type text NOT NULL CHECK (question_type IN ('multiple_choice', 'true_false', 'fill_blank', 'short_answer')),
  options jsonb,
  correct_answer text NOT NULL,
  explanation text,
  difficulty_level text NOT NULL CHECK (difficulty_level IN ('easy', 'medium', 'hard')),
  question_order integer NOT NULL CHECK (question_order >= 0),
  points integer NOT NULL DEFAULT 1 CHECK (points > 0),
  UNIQUE(exam_id, question_order)
);

-- Create global_exam_attempts table
CREATE TABLE IF NOT EXISTS global_exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES global_exams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers_json jsonb NOT NULL,
  score_percentage numeric(5,2) NOT NULL CHECK (score_percentage >= 0 AND score_percentage <= 100),
  correct_count integer NOT NULL DEFAULT 0,
  incorrect_count integer NOT NULL DEFAULT 0,
  unanswered_count integer NOT NULL DEFAULT 0,
  time_taken_seconds integer NOT NULL CHECK (time_taken_seconds >= 0),
  section_scores jsonb,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all Global Exams tables
ALTER TABLE global_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_exam_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_exam_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for global_exams
CREATE POLICY "Anyone can view active global exams"
  ON global_exams
  FOR SELECT
  USING (is_active = true);

-- RLS Policies for global_exam_sections
CREATE POLICY "Anyone can view exam sections"
  ON global_exam_sections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM global_exams
      WHERE global_exams.id = exam_id
      AND global_exams.is_active = true
    )
  );

-- RLS Policies for global_exam_questions
CREATE POLICY "Anyone can view exam questions"
  ON global_exam_questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM global_exams
      WHERE global_exams.id = exam_id
      AND global_exams.is_active = true
    )
  );

-- RLS Policies for global_exam_attempts
CREATE POLICY "Users can view own exam attempts"
  ON global_exam_attempts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own exam attempts"
  ON global_exam_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own exam attempts"
  ON global_exam_attempts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to generate unique 6-digit game code
CREATE OR REPLACE FUNCTION generate_eduplay_game_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
  code_exists boolean;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;

    SELECT EXISTS(SELECT 1 FROM eduplay_game_sessions WHERE game_code = result) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;

  RETURN result;
END;
$$;

-- Function to update eduplay participant rank after score change
CREATE OR REPLACE FUNCTION update_eduplay_participant_rank()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update ranks for all participants in the game session
  WITH ranked_participants AS (
    SELECT
      id,
      RANK() OVER (PARTITION BY game_session_id ORDER BY score DESC, joined_at ASC) as new_rank
    FROM eduplay_participants
    WHERE game_session_id = NEW.game_session_id
    AND left_at IS NULL
  )
  UPDATE eduplay_participants ep
  SET rank = rp.new_rank
  FROM ranked_participants rp
  WHERE ep.id = rp.id;

  RETURN NEW;
END;
$$;

-- Create trigger to update participant ranks
DROP TRIGGER IF EXISTS update_eduplay_ranks_trigger ON eduplay_participants;
CREATE TRIGGER update_eduplay_ranks_trigger
  AFTER INSERT OR UPDATE OF score ON eduplay_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_eduplay_participant_rank();

-- Function to update folder updated_at timestamp
CREATE OR REPLACE FUNCTION update_quiz_folder_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger to update folder timestamp
DROP TRIGGER IF EXISTS update_quiz_folder_timestamp_trigger ON quiz_folders;
CREATE TRIGGER update_quiz_folder_timestamp_trigger
  BEFORE UPDATE ON quiz_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_quiz_folder_timestamp();

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Quiz Folders indexes
CREATE INDEX IF NOT EXISTS idx_quiz_folders_user ON quiz_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_folders_name ON quiz_folders(name);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_folder ON quiz_sessions(folder_id);

-- EduPlay indexes
CREATE INDEX IF NOT EXISTS idx_eduplay_sessions_host ON eduplay_game_sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_eduplay_sessions_code ON eduplay_game_sessions(game_code);
CREATE INDEX IF NOT EXISTS idx_eduplay_sessions_status ON eduplay_game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_eduplay_participants_session ON eduplay_participants(game_session_id);
CREATE INDEX IF NOT EXISTS idx_eduplay_participants_user ON eduplay_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_eduplay_questions_session ON eduplay_game_questions(game_session_id);
CREATE INDEX IF NOT EXISTS idx_eduplay_answers_participant ON eduplay_answers(participant_id);
CREATE INDEX IF NOT EXISTS idx_eduplay_answers_session ON eduplay_answers(game_session_id);

-- Global Exams indexes
CREATE INDEX IF NOT EXISTS idx_global_exams_country ON global_exams(country);
CREATE INDEX IF NOT EXISTS idx_global_exams_code ON global_exams(exam_code);
CREATE INDEX IF NOT EXISTS idx_global_exams_type ON global_exams(exam_type);
CREATE INDEX IF NOT EXISTS idx_global_exams_subject ON global_exams(subject);
CREATE INDEX IF NOT EXISTS idx_global_exams_active ON global_exams(is_active);
CREATE INDEX IF NOT EXISTS idx_global_exam_sections_exam ON global_exam_sections(exam_id);
CREATE INDEX IF NOT EXISTS idx_global_exam_questions_exam ON global_exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_global_exam_questions_section ON global_exam_questions(section_id);
CREATE INDEX IF NOT EXISTS idx_global_exam_attempts_user ON global_exam_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_global_exam_attempts_exam ON global_exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_global_exam_attempts_completed ON global_exam_attempts(completed_at DESC);
