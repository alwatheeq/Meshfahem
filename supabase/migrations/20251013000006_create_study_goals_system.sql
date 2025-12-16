/*
  # Create Study Goals System

  1. New Tables
    - `study_goals`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `goal_type` (text)
      - `goal_title` (text)
      - `goal_description` (text)
      - `target_value` (integer)
      - `current_value` (integer, default 0)
      - `deadline_date` (date, nullable)
      - `is_completed` (boolean, default false)
      - `completed_at` (timestamp, nullable)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `study_goals` table
    - Users can only access their own goals

  3. Functions
    - Function to update goal progress
    - Function to mark goal as completed when target reached
    - Function to award XP for goal completion
*/

-- Create study_goals table
CREATE TABLE IF NOT EXISTS study_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_type text NOT NULL CHECK (goal_type IN ('daily_study_time', 'weekly_flashcards', 'quiz_streak', 'items_published', 'custom')),
  goal_title text NOT NULL CHECK (char_length(goal_title) <= 200),
  goal_description text CHECK (char_length(goal_description) <= 1000),
  target_value integer NOT NULL CHECK (target_value > 0),
  current_value integer NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  deadline_date date,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on study_goals
ALTER TABLE study_goals ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage their own goals
CREATE POLICY "Users can manage own goals"
  ON study_goals
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to update goal progress
CREATE OR REPLACE FUNCTION update_goal_progress(
  p_user_id uuid,
  p_goal_type text,
  p_increment_value integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  goal_record RECORD;
BEGIN
  -- Update all matching active goals
  FOR goal_record IN
    SELECT id, target_value, current_value
    FROM study_goals
    WHERE user_id = p_user_id
    AND goal_type = p_goal_type
    AND is_completed = false
    AND (deadline_date IS NULL OR deadline_date >= CURRENT_DATE)
  LOOP
    UPDATE study_goals
    SET
      current_value = LEAST(current_value + p_increment_value, goal_record.target_value),
      updated_at = now(),
      is_completed = (current_value + p_increment_value >= goal_record.target_value),
      completed_at = CASE
        WHEN (current_value + p_increment_value >= goal_record.target_value) THEN now()
        ELSE completed_at
      END
    WHERE id = goal_record.id;

    -- If goal completed, award XP
    IF (goal_record.current_value + p_increment_value >= goal_record.target_value) THEN
      UPDATE user_profiles
      SET
        experience_points = experience_points + 50,
        level = calculate_user_level(experience_points + 50)
      WHERE id = p_user_id;
    END IF;
  END LOOP;
END;
$$;

-- Create function to check and expire old goals
CREATE OR REPLACE FUNCTION check_expired_goals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark goals as failed if deadline passed and not completed
  UPDATE study_goals
  SET
    is_completed = false,
    updated_at = now()
  WHERE deadline_date < CURRENT_DATE
  AND is_completed = false
  AND current_value < target_value;
END;
$$;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_study_goals_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_study_goals_updated_at_trigger
  BEFORE UPDATE ON study_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_study_goals_updated_at();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_study_goals_user ON study_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_study_goals_type ON study_goals(goal_type);
CREATE INDEX IF NOT EXISTS idx_study_goals_active ON study_goals(user_id, is_completed, deadline_date);
CREATE INDEX IF NOT EXISTS idx_study_goals_completed ON study_goals(is_completed, completed_at DESC);
