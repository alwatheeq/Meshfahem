/*
  # Create Progress Tracking System

  1. New Tables
    - `study_session_log`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `session_type` (text, 'flashcards', 'quiz', 'reading', 'video_room')
      - `duration_minutes` (integer)
      - `items_studied_count` (integer)
      - `started_at` (timestamp)
      - `ended_at` (timestamp)

    - `flashcard_study_log`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `item_id` (uuid, foreign key to user_library_items, nullable)
      - `flashcard_index` (integer)
      - `flashcard_front` (text, copy for historical tracking)
      - `user_rating` (text, 'easy', 'good', 'hard')
      - `study_mode` (text, e.g., 'flip', 'type_answer')
      - `time_spent_seconds` (integer)
      - `studied_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Users can only access their own logs

  3. Functions
    - Function to update study streak
    - Function to log study session
    - Triggers to update user stats
*/

-- Create study_session_log table
CREATE TABLE IF NOT EXISTS study_session_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type text NOT NULL CHECK (session_type IN ('flashcards', 'quiz', 'reading', 'video_room')),
  duration_minutes integer NOT NULL CHECK (duration_minutes >= 0),
  items_studied_count integer NOT NULL DEFAULT 0 CHECK (items_studied_count >= 0),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_session_duration CHECK (ended_at >= started_at)
);

-- Create flashcard_study_log table
CREATE TABLE IF NOT EXISTS flashcard_study_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid REFERENCES user_library_items(id) ON DELETE SET NULL,
  flashcard_index integer NOT NULL CHECK (flashcard_index >= 0),
  flashcard_front text NOT NULL,
  user_rating text NOT NULL CHECK (user_rating IN ('easy', 'good', 'hard')),
  study_mode text NOT NULL,
  time_spent_seconds integer NOT NULL CHECK (time_spent_seconds >= 0),
  studied_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE study_session_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_study_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for study_session_log

CREATE POLICY "Users can manage own study sessions"
  ON study_session_log
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for flashcard_study_log

CREATE POLICY "Users can manage own flashcard logs"
  ON flashcard_study_log
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to update study streak
CREATE OR REPLACE FUNCTION update_study_streak()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_study_date date;
  v_current_streak integer;
  v_longest_streak integer;
  v_session_date date;
BEGIN
  v_session_date := DATE(NEW.ended_at);

  -- Get current streak data
  SELECT last_study_date, study_streak_current, study_streak_longest
  INTO v_last_study_date, v_current_streak, v_longest_streak
  FROM user_profiles
  WHERE id = NEW.user_id;

  -- If no previous study date or first time
  IF v_last_study_date IS NULL THEN
    UPDATE user_profiles
    SET
      last_study_date = v_session_date,
      study_streak_current = 1,
      study_streak_longest = GREATEST(1, v_longest_streak)
    WHERE id = NEW.user_id;

  -- If studied same day, don't change streak
  ELSIF v_last_study_date = v_session_date THEN
    -- No change needed
    NULL;

  -- If studied consecutive day, increment streak
  ELSIF v_last_study_date = v_session_date - interval '1 day' THEN
    UPDATE user_profiles
    SET
      last_study_date = v_session_date,
      study_streak_current = v_current_streak + 1,
      study_streak_longest = GREATEST(v_current_streak + 1, v_longest_streak)
    WHERE id = NEW.user_id;

  -- If streak broken, reset to 1
  ELSE
    UPDATE user_profiles
    SET
      last_study_date = v_session_date,
      study_streak_current = 1
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger to update study streak
CREATE TRIGGER update_study_streak_trigger
  AFTER INSERT ON study_session_log
  FOR EACH ROW
  EXECUTE FUNCTION update_study_streak();

-- Create function to update total study time
CREATE OR REPLACE FUNCTION update_total_study_time()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_profiles
  SET
    total_study_time_minutes = total_study_time_minutes + NEW.duration_minutes,
    experience_points = experience_points + NEW.duration_minutes,
    level = calculate_user_level(experience_points + NEW.duration_minutes)
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- Create trigger to update total study time
CREATE TRIGGER update_total_study_time_trigger
  AFTER INSERT ON study_session_log
  FOR EACH ROW
  EXECUTE FUNCTION update_total_study_time();

-- Create function to update flashcard count
CREATE OR REPLACE FUNCTION update_flashcard_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_profiles
  SET
    total_flashcards_studied = total_flashcards_studied + 1,
    experience_points = experience_points + 5,
    level = calculate_user_level(experience_points + 5)
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- Create trigger to update flashcard count
CREATE TRIGGER update_flashcard_count_trigger
  AFTER INSERT ON flashcard_study_log
  FOR EACH ROW
  EXECUTE FUNCTION update_flashcard_count();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_study_session_user ON study_session_log(user_id);
CREATE INDEX IF NOT EXISTS idx_study_session_ended ON study_session_log(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_session_user_ended ON study_session_log(user_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_session_type ON study_session_log(session_type);

CREATE INDEX IF NOT EXISTS idx_flashcard_log_user ON flashcard_study_log(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_log_studied ON flashcard_study_log(studied_at DESC);
CREATE INDEX IF NOT EXISTS idx_flashcard_log_user_studied ON flashcard_study_log(user_id, studied_at DESC);
CREATE INDEX IF NOT EXISTS idx_flashcard_log_item ON flashcard_study_log(item_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_log_rating ON flashcard_study_log(user_rating);
