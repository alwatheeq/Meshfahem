/*
  # Fix Security Issues - Part 2: Optimize RLS Policies

  ## Overview
  Optimize RLS policies by wrapping auth functions in SELECT subqueries.
  This prevents re-evaluation of auth functions for each row, significantly
  improving query performance at scale.

  ## Changes
  - Replace `auth.uid()` with `(select auth.uid())`
  - Drop and recreate affected policies with optimized versions

  ## Performance Impact
  - Dramatically improves query performance for large datasets
  - Reduces CPU usage by evaluating auth functions once per query
  - Recommended best practice by Supabase

  ## Tables Affected
  - user_profiles
  - user_history
  - user_library_items
  - user_folders
  - item_tags
  - user_feedback
  - feature_usage_tracking
  - quiz_documents
  - quiz_sessions
  - quiz_attempts
  - comments
  - item_reactions
  - subscriptions
  - transactions
  - promotional_codes
  - notifications
  - study_sessions
  - quiz_generation_errors
  - quiz_folders
  - tags
  - token_usage_history
  - eduplay_game_sessions
  - eduplay_participants
  - eduplay_game_questions
  - eduplay_answers
  - global_exam_attempts
  - eduplay_custom_question_sets
  - admin_users
*/

-- ============================================================================
-- USER_PROFILES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (select auth.uid()));

-- ============================================================================
-- USER_HISTORY
-- ============================================================================

DROP POLICY IF EXISTS "Users can read own history" ON user_history;
CREATE POLICY "Users can read own history"
  ON user_history FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own history" ON user_history;
CREATE POLICY "Users can insert own history"
  ON user_history FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- USER_LIBRARY_ITEMS
-- ============================================================================

DROP POLICY IF EXISTS "Users can read own library items" ON user_library_items;
CREATE POLICY "Users can read own library items"
  ON user_library_items FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own library items" ON user_library_items;
CREATE POLICY "Users can insert own library items"
  ON user_library_items FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own library items" ON user_library_items;
CREATE POLICY "Users can update own library items"
  ON user_library_items FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own library items" ON user_library_items;
CREATE POLICY "Users can delete own library items"
  ON user_library_items FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read items with public tags or own items" ON user_library_items;
CREATE POLICY "Users can read items with public tags or own items"
  ON user_library_items FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid()) OR
    item_has_public_tag(id)
  );

-- ============================================================================
-- USER_FOLDERS
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage own folders" ON user_folders;
CREATE POLICY "Users can manage own folders"
  ON user_folders
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- ITEM_TAGS
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage tags for own items" ON item_tags;
CREATE POLICY "Users can manage tags for own items"
  ON item_tags
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_library_items
      WHERE user_library_items.id = item_tags.item_id
      AND user_library_items.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_library_items
      WHERE user_library_items.id = item_tags.item_id
      AND user_library_items.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- USER_FEEDBACK
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert own feedback" ON user_feedback;
CREATE POLICY "Users can insert own feedback"
  ON user_feedback FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own feedback" ON user_feedback;
CREATE POLICY "Users can view own feedback"
  ON user_feedback FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- FEATURE_USAGE_TRACKING
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert own feature usage" ON feature_usage_tracking;
CREATE POLICY "Users can insert own feature usage"
  ON feature_usage_tracking FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own feature usage" ON feature_usage_tracking;
CREATE POLICY "Users can view own feature usage"
  ON feature_usage_tracking FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- QUIZ_DOCUMENTS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own quiz documents" ON quiz_documents;
CREATE POLICY "Users can view own quiz documents"
  ON quiz_documents FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own quiz documents" ON quiz_documents;
CREATE POLICY "Users can insert own quiz documents"
  ON quiz_documents FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own quiz documents" ON quiz_documents;
CREATE POLICY "Users can update own quiz documents"
  ON quiz_documents FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own quiz documents" ON quiz_documents;
CREATE POLICY "Users can delete own quiz documents"
  ON quiz_documents FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- QUIZ_SESSIONS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own quiz sessions" ON quiz_sessions;
CREATE POLICY "Users can view own quiz sessions"
  ON quiz_sessions FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own quiz sessions" ON quiz_sessions;
CREATE POLICY "Users can insert own quiz sessions"
  ON quiz_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own quiz sessions" ON quiz_sessions;
CREATE POLICY "Users can update own quiz sessions"
  ON quiz_sessions FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own quiz sessions" ON quiz_sessions;
CREATE POLICY "Users can delete own quiz sessions"
  ON quiz_sessions FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- COMMENTS
-- ============================================================================

DROP POLICY IF EXISTS "Item owners can read comments on own items" ON comments;
CREATE POLICY "Item owners can read comments on own items"
  ON comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_library_items
      WHERE user_library_items.id = comments.item_id
      AND user_library_items.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create comments" ON comments;
CREATE POLICY "Authenticated users can create comments"
  ON comments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own comments" ON comments;
CREATE POLICY "Users can update own comments"
  ON comments FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own comments" ON comments;
CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- ADMIN_USERS
-- ============================================================================

DROP POLICY IF EXISTS "Only admins can deactivate other admins" ON admin_users;
CREATE POLICY "Only admins can deactivate other admins"
  ON admin_users FOR UPDATE
  TO authenticated
  USING (
    is_admin_user((select auth.uid())::text)
  )
  WITH CHECK (
    is_admin_user((select auth.uid())::text)
  );

-- ============================================================================
-- ITEM_REACTIONS
-- ============================================================================

DROP POLICY IF EXISTS "Item owners can read reactions on own items" ON item_reactions;
CREATE POLICY "Item owners can read reactions on own items"
  ON item_reactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_library_items
      WHERE user_library_items.id = item_reactions.item_id
      AND user_library_items.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create reactions" ON item_reactions;
CREATE POLICY "Authenticated users can create reactions"
  ON item_reactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own reactions" ON item_reactions;
CREATE POLICY "Users can delete own reactions"
  ON item_reactions FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- SUBSCRIPTIONS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own subscriptions" ON subscriptions;
CREATE POLICY "Users can insert own subscriptions"
  ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;
CREATE POLICY "Users can update own subscriptions"
  ON subscriptions FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own subscriptions" ON subscriptions;
CREATE POLICY "Users can delete own subscriptions"
  ON subscriptions FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- TRANSACTIONS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- PROMOTIONAL_CODES
-- ============================================================================

DROP POLICY IF EXISTS "Admins can manage promotional codes" ON promotional_codes;
CREATE POLICY "Admins can manage promotional codes"
  ON promotional_codes
  TO authenticated
  USING (
    is_admin_user((select auth.uid())::text)
  )
  WITH CHECK (
    is_admin_user((select auth.uid())::text)
  );

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- QUIZ_ATTEMPTS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own quiz attempts" ON quiz_attempts;
CREATE POLICY "Users can view own quiz attempts"
  ON quiz_attempts FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own quiz attempts" ON quiz_attempts;
CREATE POLICY "Users can insert own quiz attempts"
  ON quiz_attempts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own quiz attempts" ON quiz_attempts;
CREATE POLICY "Users can update own quiz attempts"
  ON quiz_attempts FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own quiz attempts" ON quiz_attempts;
CREATE POLICY "Users can delete own quiz attempts"
  ON quiz_attempts FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- STUDY_SESSIONS
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage own study sessions" ON study_sessions;
CREATE POLICY "Users can manage own study sessions"
  ON study_sessions
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- QUIZ_GENERATION_ERRORS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own error logs" ON quiz_generation_errors;
CREATE POLICY "Users can view own error logs"
  ON quiz_generation_errors FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own error logs" ON quiz_generation_errors;
CREATE POLICY "Users can insert own error logs"
  ON quiz_generation_errors FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- QUIZ_FOLDERS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own quiz folders" ON quiz_folders;
CREATE POLICY "Users can view own quiz folders"
  ON quiz_folders FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own quiz folders" ON quiz_folders;
CREATE POLICY "Users can insert own quiz folders"
  ON quiz_folders FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own quiz folders" ON quiz_folders;
CREATE POLICY "Users can update own quiz folders"
  ON quiz_folders FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own quiz folders" ON quiz_folders;
CREATE POLICY "Users can delete own quiz folders"
  ON quiz_folders FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- TAGS
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage own private tags" ON tags;
CREATE POLICY "Users can manage own private tags"
  ON tags
  TO authenticated
  USING (user_id = (select auth.uid()) AND is_public = false)
  WITH CHECK (user_id = (select auth.uid()) AND is_public = false);

-- ============================================================================
-- TOKEN_USAGE_HISTORY
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own usage history" ON token_usage_history;
CREATE POLICY "Users can view own usage history"
  ON token_usage_history FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- EDUPLAY_GAME_SESSIONS
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can create game sessions" ON eduplay_game_sessions;
CREATE POLICY "Authenticated users can create game sessions"
  ON eduplay_game_sessions FOR INSERT
  TO authenticated
  WITH CHECK (host_id = (select auth.uid()));

DROP POLICY IF EXISTS "Hosts can update their game sessions" ON eduplay_game_sessions;
CREATE POLICY "Hosts can update their game sessions"
  ON eduplay_game_sessions FOR UPDATE
  TO authenticated
  USING (host_id = (select auth.uid()))
  WITH CHECK (host_id = (select auth.uid()));

DROP POLICY IF EXISTS "Hosts can delete their game sessions" ON eduplay_game_sessions;
CREATE POLICY "Hosts can delete their game sessions"
  ON eduplay_game_sessions FOR DELETE
  TO authenticated
  USING (host_id = (select auth.uid()));

-- ============================================================================
-- EDUPLAY_PARTICIPANTS
-- ============================================================================

DROP POLICY IF EXISTS "Participants can view participants in their games" ON eduplay_participants;
CREATE POLICY "Participants can view participants in their games"
  ON eduplay_participants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM eduplay_participants p2
      WHERE p2.game_session_id = eduplay_participants.game_session_id
      AND p2.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can join game sessions as participants" ON eduplay_participants;
CREATE POLICY "Users can join game sessions as participants"
  ON eduplay_participants FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()) OR user_id IS NULL);

DROP POLICY IF EXISTS "Participants can update their own data" ON eduplay_participants;
CREATE POLICY "Participants can update their own data"
  ON eduplay_participants FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- EDUPLAY_GAME_QUESTIONS
-- ============================================================================

DROP POLICY IF EXISTS "Participants can view questions in their games" ON eduplay_game_questions;
CREATE POLICY "Participants can view questions in their games"
  ON eduplay_game_questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM eduplay_participants
      WHERE eduplay_participants.game_session_id = eduplay_game_questions.game_session_id
      AND eduplay_participants.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Hosts can insert questions for their games" ON eduplay_game_questions;
CREATE POLICY "Hosts can insert questions for their games"
  ON eduplay_game_questions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM eduplay_game_sessions
      WHERE eduplay_game_sessions.id = eduplay_game_questions.game_session_id
      AND eduplay_game_sessions.host_id = (select auth.uid())
    )
  );

-- ============================================================================
-- EDUPLAY_ANSWERS
-- ============================================================================

DROP POLICY IF EXISTS "Participants can view their own answers" ON eduplay_answers;
CREATE POLICY "Participants can view their own answers"
  ON eduplay_answers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM eduplay_participants
      WHERE eduplay_participants.id = eduplay_answers.participant_id
      AND eduplay_participants.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Participants can submit answers" ON eduplay_answers;
CREATE POLICY "Participants can submit answers"
  ON eduplay_answers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM eduplay_participants
      WHERE eduplay_participants.id = eduplay_answers.participant_id
      AND eduplay_participants.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- GLOBAL_EXAM_ATTEMPTS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own exam attempts" ON global_exam_attempts;
CREATE POLICY "Users can view own exam attempts"
  ON global_exam_attempts FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own exam attempts" ON global_exam_attempts;
CREATE POLICY "Users can insert own exam attempts"
  ON global_exam_attempts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own exam attempts" ON global_exam_attempts;
CREATE POLICY "Users can update own exam attempts"
  ON global_exam_attempts FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- EDUPLAY_CUSTOM_QUESTION_SETS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own custom question sets" ON eduplay_custom_question_sets;
CREATE POLICY "Users can view own custom question sets"
  ON eduplay_custom_question_sets FOR SELECT
  TO authenticated
  USING (created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own custom question sets" ON eduplay_custom_question_sets;
CREATE POLICY "Users can insert own custom question sets"
  ON eduplay_custom_question_sets FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own custom question sets" ON eduplay_custom_question_sets;
CREATE POLICY "Users can update own custom question sets"
  ON eduplay_custom_question_sets FOR UPDATE
  TO authenticated
  USING (created_by = (select auth.uid()))
  WITH CHECK (created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own custom question sets" ON eduplay_custom_question_sets;
CREATE POLICY "Users can delete own custom question sets"
  ON eduplay_custom_question_sets FOR DELETE
  TO authenticated
  USING (created_by = (select auth.uid()));
