/*
  # Brain Rush Game Platform Enhancements

  ## Overview
  This migration enhances the EduPlay system to support the Brain Rush game with custom question sets,
  AI-generated questions from topics, and manual question creation.

  ## 1. New Tables

  ### eduplay_custom_question_sets
  Stores reusable question sets created by users for Brain Rush games
    - `id` (uuid, primary key)
    - `user_id` (uuid, references auth.users)
    - `set_name` (text, name of the question set)
    - `description` (text, optional description)
    - `difficulty_level` (text, easy/medium/hard)
    - `questions_json` (jsonb, array of questions)
    - `question_count` (integer, number of questions)
    - `is_public` (boolean, whether set can be shared)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## 2. Enhanced Tables

  ### eduplay_game_sessions enhancements
    - Add `game_type` column (default: 'brain_rush')
    - Add `question_source_type` column ('auto_generated', 'manual', 'saved_set', 'quiz_session')
    - Add `custom_question_set_id` foreign key to eduplay_custom_question_sets

  ## 3. Security (RLS Policies)
    - Users can CRUD their own custom question sets
    - Users can view public question sets from others
    - Question sets follow secure access patterns

  ## 4. Indexes for Performance
    - Indexes on foreign keys and frequently queried columns
*/

-- ============================================================================
-- CREATE CUSTOM QUESTION SETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS eduplay_custom_question_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set_name text NOT NULL CHECK (char_length(set_name) > 0 AND char_length(set_name) <= 200),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  difficulty_level text NOT NULL CHECK (difficulty_level IN ('easy', 'medium', 'hard', 'mixed')),
  questions_json jsonb NOT NULL,
  question_count integer NOT NULL CHECK (question_count > 0 AND question_count <= 100),
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- ENHANCE EDUPLAY_GAME_SESSIONS TABLE
-- ============================================================================

-- Add game_type column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'eduplay_game_sessions' AND column_name = 'game_type'
  ) THEN
    ALTER TABLE eduplay_game_sessions
    ADD COLUMN game_type text NOT NULL DEFAULT 'brain_rush'
    CHECK (game_type IN ('brain_rush', 'quiz_battle', 'speed_challenge'));
  END IF;
END $$;

-- Add question_source_type column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'eduplay_game_sessions' AND column_name = 'question_source_type'
  ) THEN
    ALTER TABLE eduplay_game_sessions
    ADD COLUMN question_source_type text NOT NULL DEFAULT 'quiz_session'
    CHECK (question_source_type IN ('auto_generated', 'manual', 'saved_set', 'quiz_session'));
  END IF;
END $$;

-- Add custom_question_set_id column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'eduplay_game_sessions' AND column_name = 'custom_question_set_id'
  ) THEN
    ALTER TABLE eduplay_game_sessions
    ADD COLUMN custom_question_set_id uuid REFERENCES eduplay_custom_question_sets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on custom question sets
ALTER TABLE eduplay_custom_question_sets ENABLE ROW LEVEL SECURITY;

-- Users can view their own question sets
CREATE POLICY "Users can view own custom question sets"
  ON eduplay_custom_question_sets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can view public question sets from others
CREATE POLICY "Users can view public custom question sets"
  ON eduplay_custom_question_sets
  FOR SELECT
  TO authenticated
  USING (is_public = true);

-- Users can insert their own question sets
CREATE POLICY "Users can insert own custom question sets"
  ON eduplay_custom_question_sets
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own question sets
CREATE POLICY "Users can update own custom question sets"
  ON eduplay_custom_question_sets
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own question sets
CREATE POLICY "Users can delete own custom question sets"
  ON eduplay_custom_question_sets
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update custom question set timestamp
CREATE OR REPLACE FUNCTION update_custom_question_set_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger to update timestamp
DROP TRIGGER IF EXISTS update_custom_question_set_timestamp_trigger ON eduplay_custom_question_sets;
CREATE TRIGGER update_custom_question_set_timestamp_trigger
  BEFORE UPDATE ON eduplay_custom_question_sets
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_question_set_timestamp();

-- Function to automatically set question_count from questions_json
CREATE OR REPLACE FUNCTION set_question_count_from_json()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.questions_json IS NOT NULL THEN
    NEW.question_count = jsonb_array_length(NEW.questions_json);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to auto-set question count
DROP TRIGGER IF EXISTS set_question_count_trigger ON eduplay_custom_question_sets;
CREATE TRIGGER set_question_count_trigger
  BEFORE INSERT OR UPDATE ON eduplay_custom_question_sets
  FOR EACH ROW
  EXECUTE FUNCTION set_question_count_from_json();

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Custom question sets indexes
CREATE INDEX IF NOT EXISTS idx_custom_question_sets_user ON eduplay_custom_question_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_question_sets_public ON eduplay_custom_question_sets(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_custom_question_sets_difficulty ON eduplay_custom_question_sets(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_custom_question_sets_created ON eduplay_custom_question_sets(created_at DESC);

-- Game sessions indexes for new columns
CREATE INDEX IF NOT EXISTS idx_game_sessions_game_type ON eduplay_game_sessions(game_type);
CREATE INDEX IF NOT EXISTS idx_game_sessions_source_type ON eduplay_game_sessions(question_source_type);
CREATE INDEX IF NOT EXISTS idx_game_sessions_custom_set ON eduplay_game_sessions(custom_question_set_id);
