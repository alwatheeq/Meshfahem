/*
  # Add Performance Indexes for Admin Dashboard
  
  ## Overview
  This migration adds additional indexes to improve admin dashboard query performance.
  
  ## Changes
  
  ### 1. user_feedback table indexes
  - Index on status for filtering
  - Index on created_at for sorting recent feedback
  - Index on user_id for user-specific queries
  
  ### 2. user_folders table indexes
  - Index on user_id for folder listing
  - Index on is_public for public folder queries
  
  ### 3. tags table indexes  
  - Index on is_public for public tag queries
  - Index on created_at for sorting
  
  ### 4. Composite indexes
  - user_feedback(status, created_at) for admin filtering
  - subscriptions(status, subscription_tier) for stats queries
  
  ## Performance Impact
  - Faster admin page loads
  - Optimized filtering and sorting
  - Better query plans for JOIN operations
*/

-- =====================================================================
-- user_feedback table indexes
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_user_feedback_status
  ON user_feedback(status);

CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at
  ON user_feedback(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id
  ON user_feedback(user_id);

-- Composite index for admin filtering (status + date sorting)
CREATE INDEX IF NOT EXISTS idx_user_feedback_status_created
  ON user_feedback(status, created_at DESC);

-- =====================================================================
-- user_folders table indexes
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_user_folders_user_id
  ON user_folders(user_id);

CREATE INDEX IF NOT EXISTS idx_user_folders_is_public
  ON user_folders(is_public)
  WHERE is_public = true;

CREATE INDEX IF NOT EXISTS idx_user_folders_created_at
  ON user_folders(created_at DESC);

-- =====================================================================
-- tags table indexes
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_tags_is_public
  ON tags(is_public)
  WHERE is_public = true;

CREATE INDEX IF NOT EXISTS idx_tags_created_at
  ON tags(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tags_name
  ON tags(LOWER(name));  -- For case-insensitive search

-- =====================================================================
-- subscriptions table additional indexes
-- =====================================================================

-- Composite index for admin stats queries (status + tier filtering)
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_tier
  ON subscriptions(status, subscription_tier);

-- Index for subscription date range queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_created_at
  ON subscriptions(created_at DESC);

-- Index for trial subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end
  ON subscriptions(trial_end_date)
  WHERE trial_end_date IS NOT NULL;

-- =====================================================================
-- transactions table additional indexes
-- =====================================================================

-- Composite index for filtering by status and date
CREATE INDEX IF NOT EXISTS idx_transactions_status_created
  ON transactions(status, created_at DESC);

-- Index for amount-based queries (revenue calculations)
CREATE INDEX IF NOT EXISTS idx_transactions_amount
  ON transactions(amount)
  WHERE status = 'succeeded';

-- =====================================================================
-- notifications table indexes (for future notifications management)
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON notifications(notification_type);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id, is_read)
  WHERE is_read = false;

-- =====================================================================
-- Add helpful comments
-- =====================================================================

COMMENT ON INDEX idx_user_feedback_status_created IS 'Optimizes admin feedback page filtering and sorting';
COMMENT ON INDEX idx_subscriptions_status_tier IS 'Optimizes admin subscription stats calculations';
COMMENT ON INDEX idx_transactions_status_created IS 'Optimizes admin transaction history queries';
COMMENT ON INDEX idx_notifications_unread IS 'Optimizes unread notification counts';
