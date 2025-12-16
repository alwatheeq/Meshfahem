/*
  # Create Achievements System

  1. New Tables
    - `achievements_definitions`
      - `id` (uuid, primary key)
      - `achievement_key` (text, unique)
      - `title` (text)
      - `description` (text)
      - `icon_name` (text, Lucide icon name)
      - `badge_tier` (text, bronze/silver/gold/platinum/diamond)
      - `xp_reward` (integer)
      - `unlock_criteria` (jsonb, conditions for earning)
      - `category` (text, study/social/achievement/special)
      - `is_active` (boolean, default true)
      - `created_at` (timestamp)

    - `user_achievements`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `achievement_id` (uuid, foreign key to achievements_definitions)
      - `earned_at` (timestamp)
      - `progress_value` (integer, for tracking partial progress)
      - Unique constraint on (user_id, achievement_id)

  2. Security
    - `achievements_definitions` has public read access (no RLS needed for definitions)
    - `user_achievements` has RLS - users can only see their own achievements

  3. Functions
    - Function to check if user earned an achievement
    - Function to award achievement to user
*/

-- Create achievements_definitions table (master list of all possible achievements)
CREATE TABLE IF NOT EXISTS achievements_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_key text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  icon_name text NOT NULL,
  badge_tier text NOT NULL CHECK (badge_tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond')),
  xp_reward integer NOT NULL CHECK (xp_reward > 0),
  unlock_criteria jsonb NOT NULL,
  category text NOT NULL CHECK (category IN ('study', 'social', 'achievement', 'special')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create user_achievements table (tracks which users earned which achievements)
CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements_definitions(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  progress_value integer DEFAULT 0,
  CONSTRAINT unique_user_achievement UNIQUE(user_id, achievement_id)
);

-- Enable RLS on user_achievements (achievements_definitions is public read)
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can read achievement definitions
-- (No RLS needed on achievements_definitions - it's a reference table)

-- RLS Policy: Users can read their own achievements
CREATE POLICY "Users can read own achievements"
  ON user_achievements
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policy: System can insert achievements (via triggers/functions)
CREATE POLICY "System can insert achievements"
  ON user_achievements
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create function to award achievement to user
CREATE OR REPLACE FUNCTION award_achievement(
  p_user_id uuid,
  p_achievement_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_achievement_id uuid;
  v_xp_reward integer;
  v_already_earned boolean;
BEGIN
  -- Get achievement details
  SELECT id, xp_reward INTO v_achievement_id, v_xp_reward
  FROM achievements_definitions
  WHERE achievement_key = p_achievement_key
  AND is_active = true;

  IF v_achievement_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check if user already has this achievement
  SELECT EXISTS(
    SELECT 1 FROM user_achievements
    WHERE user_id = p_user_id AND achievement_id = v_achievement_id
  ) INTO v_already_earned;

  IF v_already_earned THEN
    RETURN false;
  END IF;

  -- Award the achievement
  INSERT INTO user_achievements (user_id, achievement_id)
  VALUES (p_user_id, v_achievement_id);

  -- Award XP
  UPDATE user_profiles
  SET
    experience_points = experience_points + v_xp_reward,
    level = calculate_user_level(experience_points + v_xp_reward)
  WHERE id = p_user_id;

  RETURN true;
END;
$$;

-- Create function to check and award achievements based on user stats
CREATE OR REPLACE FUNCTION check_user_achievements(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_achievement RECORD;
  v_criteria jsonb;
  v_should_award boolean;
BEGIN
  -- Get user profile with all stats
  SELECT * INTO v_profile
  FROM user_profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Check each achievement
  FOR v_achievement IN
    SELECT * FROM achievements_definitions
    WHERE is_active = true
    AND id NOT IN (
      SELECT achievement_id FROM user_achievements WHERE user_id = p_user_id
    )
  LOOP
    v_criteria := v_achievement.unlock_criteria;
    v_should_award := false;

    -- Check criteria based on achievement type
    CASE v_achievement.achievement_key
      -- Streak achievements
      WHEN 'streak_3_days' THEN
        v_should_award := v_profile.study_streak_current >= 3;
      WHEN 'streak_7_days' THEN
        v_should_award := v_profile.study_streak_current >= 7;
      WHEN 'streak_30_days' THEN
        v_should_award := v_profile.study_streak_current >= 30;
      WHEN 'streak_100_days' THEN
        v_should_award := v_profile.study_streak_longest >= 100;

      -- Flashcard achievements
      WHEN 'flashcards_100' THEN
        v_should_award := v_profile.total_flashcards_studied >= 100;
      WHEN 'flashcards_500' THEN
        v_should_award := v_profile.total_flashcards_studied >= 500;
      WHEN 'flashcards_1000' THEN
        v_should_award := v_profile.total_flashcards_studied >= 1000;

      -- Quiz achievements
      WHEN 'quizzes_10' THEN
        v_should_award := v_profile.total_quizzes_completed >= 10;
      WHEN 'quizzes_50' THEN
        v_should_award := v_profile.total_quizzes_completed >= 50;

      -- Level achievements
      WHEN 'level_5' THEN
        v_should_award := v_profile.level >= 5;
      WHEN 'level_10' THEN
        v_should_award := v_profile.level >= 10;
      WHEN 'level_25' THEN
        v_should_award := v_profile.level >= 25;

      -- Study time achievements
      WHEN 'study_time_10h' THEN
        v_should_award := v_profile.total_study_time_minutes >= 600;
      WHEN 'study_time_50h' THEN
        v_should_award := v_profile.total_study_time_minutes >= 3000;
      WHEN 'study_time_100h' THEN
        v_should_award := v_profile.total_study_time_minutes >= 6000;

      -- Social achievements
      WHEN 'items_published_5' THEN
        v_should_award := v_profile.items_published_count >= 5;
      WHEN 'items_published_20' THEN
        v_should_award := v_profile.items_published_count >= 20;

      ELSE
        -- Skip unknown achievements
        CONTINUE;
    END CASE;

    -- Award if criteria met
    IF v_should_award THEN
      PERFORM award_achievement(p_user_id, v_achievement.achievement_key);
    END IF;
  END LOOP;
END;
$$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_achievements_key ON achievements_definitions(achievement_key);
CREATE INDEX IF NOT EXISTS idx_achievements_category ON achievements_definitions(category, sort_order);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_earned ON user_achievements(earned_at DESC);
