/*
  # Fix Security Issues - Part 1: Missing Indexes on Foreign Keys

  ## Overview
  Add missing indexes on foreign key columns to improve query performance.
  Unindexed foreign keys can lead to slow queries, especially on JOIN operations.

  ## Changes
  1. Add index on admin_users.created_by
  2. Add index on eduplay_game_sessions.quiz_session_id
  3. Add index on promotional_codes.created_by_admin_id
  4. Add index on user_feedback.user_id

  ## Performance Impact
  - Improves JOIN performance
  - Speeds up foreign key constraint checks
  - Reduces table scan overhead
*/

-- Add index for admin_users.created_by
CREATE INDEX IF NOT EXISTS idx_admin_users_created_by
ON admin_users(created_by);

-- Add index for eduplay_game_sessions.quiz_session_id
CREATE INDEX IF NOT EXISTS idx_eduplay_game_sessions_quiz_session_id
ON eduplay_game_sessions(quiz_session_id);

-- Add index for promotional_codes.created_by_admin_id
CREATE INDEX IF NOT EXISTS idx_promotional_codes_created_by_admin_id
ON promotional_codes(created_by_admin_id);

-- Add index for user_feedback.user_id (if not already exists)
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id
ON user_feedback(user_id);
