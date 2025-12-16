/*
  # Create Quiz System Tables

  1. New Tables
    - `quiz_documents` - Stores uploaded documents for quiz generation
    - `quiz_sessions` - Stores quiz configurations and questions
    - `quiz_attempts` - Records user quiz attempts and scores

  2. Security
    - Enable RLS on all tables
    - Users can only access their own quiz data

  3. Functions
    - Function to calculate quiz score
    - Function to update user stats after quiz completion
    - Trigger to automatically update user stats
*/

-- Create quiz_documents table
CREATE TABLE IF NOT EXISTS quiz_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  file_type text NOT NULL,
  extracted_text text NOT NULL,
  upload_date timestamptz NOT NULL DEFAULT now()
);

-- Create quiz_sessions table
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_title text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('uploaded_document', 'library_item')),
  source_id uuid,
  question_count integer NOT NULL CHECK (question_count >= 5 AND question_count <= 50),
  time_limit_minutes integer CHECK (time_limit_minutes IS NULL OR (time_limit_minutes >= 5 AND time_limit_minutes <= 120)),
  difficulty_level text NOT NULL CHECK (difficulty_level IN ('easy', 'medium', 'hard')),
  questions_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create quiz_attempts table
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_session_id uuid NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers_json jsonb NOT NULL,
  score_percentage numeric(5,2) NOT NULL CHECK (score_percentage >= 0 AND score_percentage <= 100),
  correct_count integer NOT NULL DEFAULT 0,
  incorrect_count integer NOT NULL DEFAULT 0,
  unanswered_count integer NOT NULL DEFAULT 0,
  time_taken_seconds integer NOT NULL CHECK (time_taken_seconds >= 0),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE quiz_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quiz_documents
CREATE POLICY "Users can view own quiz documents"
  ON quiz_documents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own quiz documents"
  ON quiz_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quiz documents"
  ON quiz_documents
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own quiz documents"
  ON quiz_documents
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for quiz_sessions
CREATE POLICY "Users can view own quiz sessions"
  ON quiz_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own quiz sessions"
  ON quiz_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quiz sessions"
  ON quiz_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own quiz sessions"
  ON quiz_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for quiz_attempts
CREATE POLICY "Users can view own quiz attempts"
  ON quiz_attempts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own quiz attempts"
  ON quiz_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quiz attempts"
  ON quiz_attempts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own quiz attempts"
  ON quiz_attempts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to calculate user level based on XP
CREATE OR REPLACE FUNCTION calculate_user_level(xp integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN FLOOR(SQRT(xp / 100.0)) + 1;
END;
$$;

-- Create function to calculate quiz score
CREATE OR REPLACE FUNCTION calculate_quiz_score(
  questions jsonb,
  answers jsonb
)
RETURNS TABLE (
  score_percentage numeric,
  correct_count integer,
  incorrect_count integer,
  unanswered_count integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  total_questions integer;
  correct integer := 0;
  incorrect integer := 0;
  unanswered integer := 0;
  question jsonb;
  user_answer text;
  correct_answer text;
BEGIN
  total_questions := jsonb_array_length(questions);

  FOR question IN SELECT * FROM jsonb_array_elements(questions)
  LOOP
    user_answer := answers->>((question->>'index')::text);
    correct_answer := question->>'correct_answer';

    IF user_answer IS NULL OR user_answer = '' THEN
      unanswered := unanswered + 1;
    ELSIF LOWER(TRIM(user_answer)) = LOWER(TRIM(correct_answer)) THEN
      correct := correct + 1;
    ELSE
      incorrect := incorrect + 1;
    END IF;
  END LOOP;

  score_percentage := CASE
    WHEN total_questions > 0 THEN (correct::numeric / total_questions) * 100
    ELSE 0
  END;

  correct_count := correct;
  incorrect_count := incorrect;
  unanswered_count := unanswered;

  RETURN NEXT;
END;
$$;

-- Create function to update user stats after quiz completion
CREATE OR REPLACE FUNCTION update_user_stats_after_quiz()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_profiles
  SET
    total_quizzes_completed = total_quizzes_completed + 1,
    experience_points = experience_points + 10 + FLOOR(NEW.score_percentage / 10),
    level = calculate_user_level(experience_points + 10 + FLOOR(NEW.score_percentage / 10))
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS update_user_stats_after_quiz_trigger ON quiz_attempts;

-- Create trigger to update user stats after quiz
CREATE TRIGGER update_user_stats_after_quiz_trigger
  AFTER INSERT ON quiz_attempts
  FOR EACH ROW
  EXECUTE FUNCTION update_user_stats_after_quiz();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quiz_documents_user ON quiz_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user ON quiz_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_created ON quiz_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_session ON quiz_attempts(quiz_session_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_completed ON quiz_attempts(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_score ON quiz_attempts(score_percentage DESC);