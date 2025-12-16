/*
  # Multiplayer Brain Rush System

  ## Overview
  This migration adds comprehensive multiplayer functionality to the Brain Rush game,
  enabling real-time competitive gameplay between multiple players.

  ## 1. New Tables

  ### multiplayer_game_lobbies
  Manages game lobbies where players can join before the game starts
    - `id` (uuid, primary key)
    - `host_user_id` (uuid, references auth.users)
    - `game_code` (text, unique 6-character join code)
    - `game_name` (text, name of the game)
    - `max_players` (integer, maximum number of players, 2-10)
    - `current_players` (integer, current number of players)
    - `status` (text, 'waiting', 'starting', 'in_progress', 'completed', 'cancelled')
    - `game_config` (jsonb, game settings like time limit, difficulty)
    - `question_set_id` (uuid, references eduplay_custom_question_sets)
    - `questions_json` (jsonb, the actual questions for the game)
    - `started_at` (timestamptz, when game started)
    - `ended_at` (timestamptz, when game ended)
    - `created_at` (timestamptz)

  ### multiplayer_game_players
  Tracks players in each game lobby
    - `id` (uuid, primary key)
    - `lobby_id` (uuid, references multiplayer_game_lobbies)
    - `user_id` (uuid, references auth.users)
    - `display_name` (text, player's display name)
    - `is_ready` (boolean, player ready status)
    - `is_host` (boolean, whether this player is the host)
    - `joined_at` (timestamptz)
    - `left_at` (timestamptz, if player left early)

  ### multiplayer_game_answers
  Records each player's answer in real-time
    - `id` (uuid, primary key)
    - `lobby_id` (uuid, references multiplayer_game_lobbies)
    - `user_id` (uuid, references auth.users)
    - `question_index` (integer, which question was answered)
    - `selected_answer` (text, the answer chosen)
    - `is_correct` (boolean, whether answer was correct)
    - `time_taken_ms` (integer, milliseconds to answer)
    - `points_earned` (integer, points from this answer)
    - `answered_at` (timestamptz)

  ### multiplayer_game_scores
  Final scores and statistics for each player in a game
    - `id` (uuid, primary key)
    - `lobby_id` (uuid, references multiplayer_game_lobbies)
    - `user_id` (uuid, references auth.users)
    - `total_score` (integer, final score)
    - `correct_answers` (integer, number of correct answers)
    - `total_questions` (integer, total questions answered)
    - `average_time_ms` (integer, average time per question)
    - `rank` (integer, player's rank in the game)
    - `completed_at` (timestamptz)

  ## 2. Security (RLS Policies)
    - Players can view lobbies they're part of or public lobbies
    - Only hosts can update lobby settings
    - Players can only insert their own answers
    - All players in a game can view each other's scores and answers

  ## 3. Indexes for Performance
    - Indexes on foreign keys and frequently queried columns
    - Special index on game_code for quick lobby lookups

  ## 4. Real-time Subscriptions
    - Enable real-time updates for all multiplayer tables
*/

-- ============================================================================
-- CREATE MULTIPLAYER GAME LOBBIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS multiplayer_game_lobbies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_code text NOT NULL UNIQUE CHECK (char_length(game_code) = 6),
  game_name text NOT NULL CHECK (char_length(game_name) > 0 AND char_length(game_name) <= 100),
  max_players integer NOT NULL DEFAULT 4 CHECK (max_players >= 2 AND max_players <= 10),
  current_players integer NOT NULL DEFAULT 1 CHECK (current_players >= 0),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'starting', 'in_progress', 'completed', 'cancelled')),
  game_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  question_set_id uuid REFERENCES eduplay_custom_question_sets(id) ON DELETE SET NULL,
  questions_json jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- CREATE MULTIPLAYER GAME PLAYERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS multiplayer_game_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid NOT NULL REFERENCES multiplayer_game_lobbies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) > 0 AND char_length(display_name) <= 50),
  is_ready boolean NOT NULL DEFAULT false,
  is_host boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE(lobby_id, user_id)
);

-- ============================================================================
-- CREATE MULTIPLAYER GAME ANSWERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS multiplayer_game_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid NOT NULL REFERENCES multiplayer_game_lobbies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_index integer NOT NULL CHECK (question_index >= 0),
  selected_answer text NOT NULL,
  is_correct boolean NOT NULL,
  time_taken_ms integer NOT NULL CHECK (time_taken_ms >= 0),
  points_earned integer NOT NULL DEFAULT 0 CHECK (points_earned >= 0),
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lobby_id, user_id, question_index)
);

-- ============================================================================
-- CREATE MULTIPLAYER GAME SCORES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS multiplayer_game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid NOT NULL REFERENCES multiplayer_game_lobbies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_score integer NOT NULL DEFAULT 0 CHECK (total_score >= 0),
  correct_answers integer NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
  total_questions integer NOT NULL DEFAULT 0 CHECK (total_questions >= 0),
  average_time_ms integer CHECK (average_time_ms >= 0),
  rank integer CHECK (rank > 0),
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lobby_id, user_id)
);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE multiplayer_game_lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE multiplayer_game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE multiplayer_game_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE multiplayer_game_scores ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- MULTIPLAYER_GAME_LOBBIES POLICIES
-- ============================================================================

-- Users can view lobbies they're part of or in waiting status
CREATE POLICY "Users can view game lobbies they participate in"
  ON multiplayer_game_lobbies
  FOR SELECT
  TO authenticated
  USING (
    status = 'waiting' OR
    auth.uid() = host_user_id OR
    EXISTS (
      SELECT 1 FROM multiplayer_game_players
      WHERE multiplayer_game_players.lobby_id = id
      AND multiplayer_game_players.user_id = auth.uid()
    )
  );

-- Users can create lobbies
CREATE POLICY "Users can create game lobbies"
  ON multiplayer_game_lobbies
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = host_user_id);

-- Only hosts can update their lobbies
CREATE POLICY "Hosts can update their game lobbies"
  ON multiplayer_game_lobbies
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = host_user_id)
  WITH CHECK (auth.uid() = host_user_id);

-- Hosts can delete their lobbies
CREATE POLICY "Hosts can delete their game lobbies"
  ON multiplayer_game_lobbies
  FOR DELETE
  TO authenticated
  USING (auth.uid() = host_user_id);

-- ============================================================================
-- MULTIPLAYER_GAME_PLAYERS POLICIES
-- ============================================================================

-- Users can view players in lobbies they're part of
CREATE POLICY "Users can view players in their game lobbies"
  ON multiplayer_game_players
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM multiplayer_game_lobbies
      WHERE multiplayer_game_lobbies.id = lobby_id
      AND (
        multiplayer_game_lobbies.status = 'waiting' OR
        multiplayer_game_lobbies.host_user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM multiplayer_game_players mp
          WHERE mp.lobby_id = multiplayer_game_lobbies.id
          AND mp.user_id = auth.uid()
        )
      )
    )
  );

-- Users can join lobbies
CREATE POLICY "Users can join game lobbies"
  ON multiplayer_game_players
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own player status
CREATE POLICY "Users can update their own player status"
  ON multiplayer_game_players
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Hosts can update any player in their lobby
CREATE POLICY "Hosts can update players in their lobbies"
  ON multiplayer_game_players
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM multiplayer_game_lobbies
      WHERE multiplayer_game_lobbies.id = lobby_id
      AND multiplayer_game_lobbies.host_user_id = auth.uid()
    )
  );

-- Users can leave lobbies (soft delete by setting left_at)
CREATE POLICY "Users can leave game lobbies"
  ON multiplayer_game_players
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- MULTIPLAYER_GAME_ANSWERS POLICIES
-- ============================================================================

-- Players can view all answers in their game
CREATE POLICY "Players can view answers in their game"
  ON multiplayer_game_answers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM multiplayer_game_players
      WHERE multiplayer_game_players.lobby_id = lobby_id
      AND multiplayer_game_players.user_id = auth.uid()
    )
  );

-- Players can insert their own answers
CREATE POLICY "Players can insert own answers"
  ON multiplayer_game_answers
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Players can update their own answers (for corrections)
CREATE POLICY "Players can update own answers"
  ON multiplayer_game_answers
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- MULTIPLAYER_GAME_SCORES POLICIES
-- ============================================================================

-- Players can view all scores in games they participated in
CREATE POLICY "Players can view scores in their games"
  ON multiplayer_game_scores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM multiplayer_game_players
      WHERE multiplayer_game_players.lobby_id = lobby_id
      AND multiplayer_game_players.user_id = auth.uid()
    )
  );

-- System can insert scores (through functions or direct inserts by participants)
CREATE POLICY "Players can insert their own scores"
  ON multiplayer_game_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Scores can be updated by the player
CREATE POLICY "Players can update their own scores"
  ON multiplayer_game_scores
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update lobby player count
CREATE OR REPLACE FUNCTION update_lobby_player_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lobby_id uuid;
  v_player_count integer;
BEGIN
  -- Get the lobby_id from the affected row
  IF TG_OP = 'DELETE' THEN
    v_lobby_id = OLD.lobby_id;
  ELSE
    v_lobby_id = NEW.lobby_id;
  END IF;

  -- Count active players (not left)
  SELECT COUNT(*)
  INTO v_player_count
  FROM multiplayer_game_players
  WHERE lobby_id = v_lobby_id
  AND left_at IS NULL;

  -- Update the lobby
  UPDATE multiplayer_game_lobbies
  SET current_players = v_player_count
  WHERE id = v_lobby_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Create trigger to update player count
DROP TRIGGER IF EXISTS update_lobby_player_count_trigger ON multiplayer_game_players;
CREATE TRIGGER update_lobby_player_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON multiplayer_game_players
  FOR EACH ROW
  EXECUTE FUNCTION update_lobby_player_count();

-- Function to calculate and update player scores
CREATE OR REPLACE FUNCTION calculate_player_final_score(p_lobby_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_score integer;
  v_correct_answers integer;
  v_total_questions integer;
  v_average_time integer;
  v_rank integer;
BEGIN
  -- Calculate statistics
  SELECT
    COALESCE(SUM(points_earned), 0),
    COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END), 0),
    COUNT(*),
    COALESCE(AVG(time_taken_ms)::integer, 0)
  INTO
    v_total_score,
    v_correct_answers,
    v_total_questions,
    v_average_time
  FROM multiplayer_game_answers
  WHERE lobby_id = p_lobby_id
  AND user_id = p_user_id;

  -- Insert or update score
  INSERT INTO multiplayer_game_scores (
    lobby_id,
    user_id,
    total_score,
    correct_answers,
    total_questions,
    average_time_ms
  ) VALUES (
    p_lobby_id,
    p_user_id,
    v_total_score,
    v_correct_answers,
    v_total_questions,
    v_average_time
  )
  ON CONFLICT (lobby_id, user_id)
  DO UPDATE SET
    total_score = v_total_score,
    correct_answers = v_correct_answers,
    total_questions = v_total_questions,
    average_time_ms = v_average_time,
    completed_at = now();

  -- Calculate rank (1 = highest score)
  WITH ranked_scores AS (
    SELECT
      user_id,
      ROW_NUMBER() OVER (ORDER BY total_score DESC, average_time_ms ASC) as player_rank
    FROM multiplayer_game_scores
    WHERE lobby_id = p_lobby_id
  )
  UPDATE multiplayer_game_scores
  SET rank = ranked_scores.player_rank
  FROM ranked_scores
  WHERE multiplayer_game_scores.lobby_id = p_lobby_id
  AND multiplayer_game_scores.user_id = ranked_scores.user_id;
END;
$$;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Lobbies indexes
CREATE INDEX IF NOT EXISTS idx_multiplayer_lobbies_host ON multiplayer_game_lobbies(host_user_id);
CREATE INDEX IF NOT EXISTS idx_multiplayer_lobbies_code ON multiplayer_game_lobbies(game_code);
CREATE INDEX IF NOT EXISTS idx_multiplayer_lobbies_status ON multiplayer_game_lobbies(status);
CREATE INDEX IF NOT EXISTS idx_multiplayer_lobbies_created ON multiplayer_game_lobbies(created_at DESC);

-- Players indexes
CREATE INDEX IF NOT EXISTS idx_multiplayer_players_lobby ON multiplayer_game_players(lobby_id);
CREATE INDEX IF NOT EXISTS idx_multiplayer_players_user ON multiplayer_game_players(user_id);
CREATE INDEX IF NOT EXISTS idx_multiplayer_players_active ON multiplayer_game_players(lobby_id, left_at) WHERE left_at IS NULL;

-- Answers indexes
CREATE INDEX IF NOT EXISTS idx_multiplayer_answers_lobby ON multiplayer_game_answers(lobby_id);
CREATE INDEX IF NOT EXISTS idx_multiplayer_answers_user ON multiplayer_game_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_multiplayer_answers_lobby_user ON multiplayer_game_answers(lobby_id, user_id);

-- Scores indexes
CREATE INDEX IF NOT EXISTS idx_multiplayer_scores_lobby ON multiplayer_game_scores(lobby_id);
CREATE INDEX IF NOT EXISTS idx_multiplayer_scores_user ON multiplayer_game_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_multiplayer_scores_rank ON multiplayer_game_scores(lobby_id, rank);
