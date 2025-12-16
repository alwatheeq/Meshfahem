/*
  # Seed Achievements Definitions

  1. Data
    - Insert 30 predefined achievements into achievements_definitions table
    - Categories: First Steps, Consistency, Mastery, Excellence, Social, Dedication, Levels, Special
    - Badge tiers: Bronze, Silver, Gold, Platinum, Diamond
    - XP rewards range from 10 to 500

  2. Notes
    - These are the master achievement definitions
    - Users earn these through various activities
    - unlock_criteria is stored as jsonb for flexibility
*/

-- First Steps Achievements (Bronze tier, 10-15 XP)
INSERT INTO achievements_definitions (achievement_key, title, description, icon_name, badge_tier, xp_reward, unlock_criteria, category, sort_order)
VALUES
  ('first_summary', 'First Steps', 'Generated your first summary', 'FileText', 'bronze', 10, '{"type": "summary_count", "value": 1}'::jsonb, 'study', 1),
  ('first_flashcard', 'Quick Learner', 'Studied your first flashcard', 'CreditCard', 'bronze', 10, '{"type": "flashcard_count", "value": 1}'::jsonb, 'study', 2),
  ('first_quiz', 'Quiz Rookie', 'Completed your first quiz', 'CheckCircle', 'bronze', 15, '{"type": "quiz_count", "value": 1}'::jsonb, 'study', 3),
  ('first_comment', 'Conversationalist', 'Posted your first comment', 'MessageSquare', 'bronze', 10, '{"type": "comment_count", "value": 1}'::jsonb, 'social', 4),
  ('first_library_item', 'Librarian', 'Published your first library item', 'BookOpen', 'bronze', 10, '{"type": "published_count", "value": 1}'::jsonb, 'social', 5)
ON CONFLICT (achievement_key) DO NOTHING;

-- Consistency Achievements (Silver to Platinum, 25-500 XP)
INSERT INTO achievements_definitions (achievement_key, title, description, icon_name, badge_tier, xp_reward, unlock_criteria, category, sort_order)
VALUES
  ('streak_3_days', 'Getting Started', 'Maintained a 3-day study streak', 'Flame', 'bronze', 25, '{"type": "streak_current", "value": 3}'::jsonb, 'achievement', 10),
  ('streak_7_days', 'Week Warrior', 'Maintained a 7-day study streak', 'Flame', 'silver', 50, '{"type": "streak_current", "value": 7}'::jsonb, 'achievement', 11),
  ('streak_30_days', 'Month Master', 'Maintained a 30-day study streak', 'Flame', 'gold', 150, '{"type": "streak_current", "value": 30}'::jsonb, 'achievement', 12),
  ('streak_100_days', 'Century Scholar', 'Achieved a 100-day study streak', 'Flame', 'platinum', 400, '{"type": "streak_longest", "value": 100}'::jsonb, 'achievement', 13),
  ('streak_365_days', 'Year-Round Learner', 'Maintained a full year study streak', 'Trophy', 'diamond', 1000, '{"type": "streak_longest", "value": 365}'::jsonb, 'achievement', 14)
ON CONFLICT (achievement_key) DO NOTHING;

-- Mastery Achievements (Bronze to Gold, 50-300 XP)
INSERT INTO achievements_definitions (achievement_key, title, description, icon_name, badge_tier, xp_reward, unlock_criteria, category, sort_order)
VALUES
  ('flashcards_100', 'Flashcard Enthusiast', 'Studied 100 flashcards', 'Layers', 'bronze', 50, '{"type": "flashcards_total", "value": 100}'::jsonb, 'study', 20),
  ('flashcards_500', 'Flashcard Expert', 'Studied 500 flashcards', 'Layers', 'silver', 150, '{"type": "flashcards_total", "value": 500}'::jsonb, 'study', 21),
  ('flashcards_1000', 'Flashcard Master', 'Studied 1000 flashcards', 'Layers', 'gold', 300, '{"type": "flashcards_total", "value": 1000}'::jsonb, 'study', 22)
ON CONFLICT (achievement_key) DO NOTHING;

-- Excellence Achievements (Silver to Platinum, 50-200 XP)
INSERT INTO achievements_definitions (achievement_key, title, description, icon_name, badge_tier, xp_reward, unlock_criteria, category, sort_order)
VALUES
  ('quiz_perfect_score', 'Perfect Score', 'Achieved a perfect 100% quiz score', 'Award', 'gold', 100, '{"type": "quiz_perfect", "value": true}'::jsonb, 'achievement', 30),
  ('quizzes_10', 'Quiz Apprentice', 'Completed 10 quizzes', 'FileQuestion', 'bronze', 50, '{"type": "quiz_count", "value": 10}'::jsonb, 'study', 31),
  ('quizzes_50', 'Quiz Expert', 'Completed 50 quizzes', 'FileQuestion', 'silver', 200, '{"type": "quiz_count", "value": 50}'::jsonb, 'study', 32),
  ('avg_score_90', 'High Achiever', 'Maintained 90%+ average quiz score', 'TrendingUp', 'gold', 150, '{"type": "avg_score", "value": 90}'::jsonb, 'achievement', 33)
ON CONFLICT (achievement_key) DO NOTHING;

-- Social Achievements (Bronze to Platinum, 30-200 XP)
INSERT INTO achievements_definitions (achievement_key, title, description, icon_name, badge_tier, xp_reward, unlock_criteria, category, sort_order)
VALUES
  ('items_published_5', 'Content Creator', 'Published 5 items to the library', 'Share2', 'bronze', 30, '{"type": "published_count", "value": 5}'::jsonb, 'social', 40),
  ('items_published_20', 'Content Producer', 'Published 20 items to the library', 'Share2', 'silver', 100, '{"type": "published_count", "value": 20}'::jsonb, 'social', 41),
  ('comments_50', 'Active Discusser', 'Posted 50 comments', 'MessageCircle', 'silver', 75, '{"type": "comment_count", "value": 50}'::jsonb, 'social', 42),
  ('likes_received_100', 'Popular Creator', 'Received 100 likes on your content', 'Heart', 'gold', 100, '{"type": "likes_received", "value": 100}'::jsonb, 'social', 43)
ON CONFLICT (achievement_key) DO NOTHING;

-- Dedication Achievements (Silver to Platinum, 50-400 XP)
INSERT INTO achievements_definitions (achievement_key, title, description, icon_name, badge_tier, xp_reward, unlock_criteria, category, sort_order)
VALUES
  ('study_time_10h', 'Dedicated Student', 'Studied for 10 hours total', 'Clock', 'bronze', 50, '{"type": "study_time_minutes", "value": 600}'::jsonb, 'study', 50),
  ('study_time_50h', 'Committed Scholar', 'Studied for 50 hours total', 'Clock', 'silver', 200, '{"type": "study_time_minutes", "value": 3000}'::jsonb, 'study', 51),
  ('study_time_100h', 'Master Dedicator', 'Studied for 100 hours total', 'Clock', 'gold', 400, '{"type": "study_time_minutes", "value": 6000}'::jsonb, 'study', 52)
ON CONFLICT (achievement_key) DO NOTHING;

-- Level Milestones (Bronze to Platinum, 50-500 XP)
INSERT INTO achievements_definitions (achievement_key, title, description, icon_name, badge_tier, xp_reward, unlock_criteria, category, sort_order)
VALUES
  ('level_5', 'Rising Star', 'Reached Level 5', 'Star', 'bronze', 50, '{"type": "level", "value": 5}'::jsonb, 'achievement', 60),
  ('level_10', 'Skilled Learner', 'Reached Level 10', 'Star', 'silver', 100, '{"type": "level", "value": 10}'::jsonb, 'achievement', 61),
  ('level_25', 'Expert Scholar', 'Reached Level 25', 'Star', 'gold', 250, '{"type": "level", "value": 25}'::jsonb, 'achievement', 62),
  ('level_50', 'Master Scholar', 'Reached Level 50', 'Trophy', 'platinum', 500, '{"type": "level", "value": 50}'::jsonb, 'achievement', 63)
ON CONFLICT (achievement_key) DO NOTHING;

-- Special Achievements (Gold tier, 50-100 XP)
INSERT INTO achievements_definitions (achievement_key, title, description, icon_name, badge_tier, xp_reward, unlock_criteria, category, sort_order)
VALUES
  ('night_owl', 'Night Owl', 'Studied after 10 PM on 5 different days', 'Moon', 'gold', 50, '{"type": "time_range", "start": 22, "end": 2, "days": 5}'::jsonb, 'special', 70),
  ('early_bird', 'Early Bird', 'Studied before 7 AM on 5 different days', 'Sunrise', 'gold', 50, '{"type": "time_range", "start": 5, "end": 7, "days": 5}'::jsonb, 'special', 71),
  ('weekend_warrior', 'Weekend Warrior', 'Studied on 10 different weekends', 'Calendar', 'gold', 75, '{"type": "weekend_study", "value": 10}'::jsonb, 'special', 72),
  ('study_group_leader', 'Study Group Leader', 'Created 5 study rooms', 'Users', 'silver', 100, '{"type": "rooms_created", "value": 5}'::jsonb, 'special', 73)
ON CONFLICT (achievement_key) DO NOTHING;
