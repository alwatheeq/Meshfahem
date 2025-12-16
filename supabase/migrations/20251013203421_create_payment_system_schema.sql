/*
  # Payment System Database Schema
  
  1. New Tables
    - `subscriptions` - Tracks user subscriptions with Stripe integration
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `subscription_tier` (text: trial_1day, trial_7day, monthly, quarterly, biannual)
      - `status` (text: active, canceled, expired, payment_failed)
      - `start_date` (timestamptz)
      - `end_date` (timestamptz)
      - `next_billing_date` (timestamptz, nullable)
      - `stripe_subscription_id` (text, nullable)
      - `stripe_customer_id` (text, nullable)
      - `payment_method_saved` (boolean, default false)
      - `auto_renew` (boolean, default true)
      - `canceled_at` (timestamptz, nullable)
      - `trial_end_date` (timestamptz, nullable)
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())
    
    - `transactions` - Payment transaction history
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `subscription_id` (uuid, foreign key to subscriptions, nullable)
      - `stripe_payment_intent_id` (text, nullable)
      - `amount` (numeric)
      - `currency` (text, default 'usd')
      - `status` (text: succeeded, failed, pending, refunded)
      - `payment_method` (text, nullable)
      - `transaction_type` (text: subscription_payment, trial_conversion, manual_payment)
      - `receipt_url` (text, nullable)
      - `created_at` (timestamptz, default now())
    
    - `feature_usage_tracking` - Tracks feature usage for analytics and trial limits
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `feature_name` (text: summary_generation, flashcard_generation, video_processing, quiz_generation)
      - `usage_count` (integer, default 1)
      - `subscription_tier_at_use` (text)
      - `last_used_at` (timestamptz, default now())
      - `created_at` (timestamptz, default now())
    
    - `promotional_codes` - Discount codes managed by admins
      - `id` (uuid, primary key)
      - `code` (text, unique)
      - `discount_percentage` (numeric, nullable)
      - `discount_amount` (numeric, nullable)
      - `valid_from` (timestamptz, default now())
      - `valid_until` (timestamptz, nullable)
      - `max_uses` (integer, nullable)
      - `current_uses` (integer, default 0)
      - `applicable_plans` (text[], default array of all plans)
      - `created_by_admin_id` (uuid, foreign key to auth.users)
      - `is_active` (boolean, default true)
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())
    
    - `notifications` - In-app notifications for payment events
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `notification_type` (text: payment_failed, subscription_renewed, trial_expiring, subscription_canceled)
      - `message` (text)
      - `is_read` (boolean, default false)
      - `action_url` (text, nullable)
      - `expires_at` (timestamptz, nullable)
      - `created_at` (timestamptz, default now())
  
  2. Updates to Existing Tables
    - Add `subscription_tier` column to `user_profiles` (text, default 'none')
    - Add `trial_features_used` column to `user_profiles` (jsonb, default '{}')
  
  3. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users to read their own data
    - Add policies for admins to manage all data
  
  4. Indexes
    - Index on subscriptions (user_id, status, next_billing_date)
    - Index on transactions (user_id, created_at)
    - Index on feature_usage_tracking (user_id, feature_name)
    - Index on promotional_codes (code, is_active)
    - Index on notifications (user_id, is_read, created_at)
  
  5. Functions
    - Helper function to check if user has active subscription
    - Helper function to check feature access eligibility
*/

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_tier text NOT NULL CHECK (subscription_tier IN ('trial_1day', 'trial_7day', 'monthly', 'quarterly', 'biannual')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'expired', 'payment_failed')),
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz NOT NULL,
  next_billing_date timestamptz,
  stripe_subscription_id text,
  stripe_customer_id text,
  payment_method_saved boolean NOT NULL DEFAULT false,
  auto_renew boolean NOT NULL DEFAULT true,
  canceled_at timestamptz,
  trial_end_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  stripe_payment_intent_id text,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('succeeded', 'failed', 'pending', 'refunded')),
  payment_method text,
  transaction_type text NOT NULL CHECK (transaction_type IN ('subscription_payment', 'trial_conversion', 'manual_payment')),
  receipt_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create feature_usage_tracking table
CREATE TABLE IF NOT EXISTS feature_usage_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_name text NOT NULL CHECK (feature_name IN ('summary_generation', 'flashcard_generation', 'video_processing', 'quiz_generation')),
  usage_count integer NOT NULL DEFAULT 1,
  subscription_tier_at_use text NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create promotional_codes table
CREATE TABLE IF NOT EXISTS promotional_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  discount_percentage numeric CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  discount_amount numeric CHECK (discount_amount >= 0),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  max_uses integer,
  current_uses integer NOT NULL DEFAULT 0,
  applicable_plans text[] NOT NULL DEFAULT ARRAY['monthly', 'quarterly', 'biannual'],
  created_by_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('payment_failed', 'subscription_renewed', 'trial_expiring', 'subscription_canceled', 'admin_notification')),
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  action_url text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add columns to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'subscription_tier'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN subscription_tier text NOT NULL DEFAULT 'none';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'trial_features_used'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN trial_features_used jsonb NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing ON subscriptions(next_billing_date) WHERE next_billing_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_subscription_id ON transactions(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feature_usage_user_id ON feature_usage_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_feature_usage_feature_name ON feature_usage_tracking(feature_name);
CREATE INDEX IF NOT EXISTS idx_promotional_codes_code ON promotional_codes(code) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read, created_at) WHERE is_read = false;

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotional_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Subscriptions policies
CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND user_role = 'admin'
    )
  );

CREATE POLICY "Admins can insert subscriptions"
  ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND user_role = 'admin'
    )
  );

CREATE POLICY "Admins can update subscriptions"
  ON subscriptions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND user_role = 'admin'
    )
  );

-- Transactions policies
CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND user_role = 'admin'
    )
  );

CREATE POLICY "Admins can insert transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND user_role = 'admin'
    )
  );

-- Feature usage tracking policies
CREATE POLICY "Users can view own feature usage"
  ON feature_usage_tracking FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all feature usage"
  ON feature_usage_tracking FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND user_role = 'admin'
    )
  );

CREATE POLICY "Users can insert own feature usage"
  ON feature_usage_tracking FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Promotional codes policies
CREATE POLICY "Anyone can view active promotional codes"
  ON promotional_codes FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage promotional codes"
  ON promotional_codes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND user_role = 'admin'
    )
  );

-- Notifications policies
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Helper function to check if user has active subscription
CREATE OR REPLACE FUNCTION has_active_subscription(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_active boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND end_date > now()
  ) INTO v_has_active;
  
  RETURN v_has_active;
END;
$$;

-- Helper function to get user's current subscription tier
CREATE OR REPLACE FUNCTION get_user_subscription_tier(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier text;
BEGIN
  SELECT subscription_tier
  INTO v_tier
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > now()
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN COALESCE(v_tier, 'none');
END;
$$;

-- Helper function to check if user can use a feature (1-day trial limits)
CREATE OR REPLACE FUNCTION can_use_feature(p_user_id uuid, p_feature_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription_tier text;
  v_feature_used boolean;
BEGIN
  -- Get current subscription tier
  v_subscription_tier := get_user_subscription_tier(p_user_id);
  
  -- If user has active paid subscription, allow access
  IF v_subscription_tier IN ('monthly', 'quarterly', 'biannual', 'trial_7day') THEN
    RETURN true;
  END IF;
  
  -- For 1-day trial users, check if feature was already used
  IF v_subscription_tier = 'trial_1day' THEN
    SELECT EXISTS (
      SELECT 1
      FROM feature_usage_tracking
      WHERE user_id = p_user_id
        AND feature_name = p_feature_name
    ) INTO v_feature_used;
    
    RETURN NOT v_feature_used;
  END IF;
  
  -- No active subscription
  RETURN false;
END;
$$;

-- Function to update subscription tier in user_profiles when subscription changes
CREATE OR REPLACE FUNCTION sync_user_subscription_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update user_profiles with new subscription tier
  UPDATE user_profiles
  SET subscription_tier = NEW.subscription_tier
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$;

-- Create trigger to sync subscription tier
DROP TRIGGER IF EXISTS trigger_sync_subscription_tier ON subscriptions;
CREATE TRIGGER trigger_sync_subscription_tier
  AFTER INSERT OR UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_subscription_tier();

-- Function to auto-update subscription status based on dates
CREATE OR REPLACE FUNCTION check_subscription_expiration()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark expired subscriptions
  UPDATE subscriptions
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND end_date <= now();
    
  -- Update user_profiles for expired subscriptions
  UPDATE user_profiles up
  SET subscription_tier = 'none'
  WHERE NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = up.id
      AND s.status = 'active'
      AND s.end_date > now()
  );
END;
$$;