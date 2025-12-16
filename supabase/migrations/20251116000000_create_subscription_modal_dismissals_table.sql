/*
  # Create Subscription Modal Dismissals Tracking Table

  1. New Tables
    - `subscription_modal_dismissals`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `feature_name` (text) - The feature that triggered the modal
      - `dismissed_at` (timestamptz) - When the modal was dismissed
      - `created_at` (timestamptz) - Record creation timestamp

  2. Security
    - Enable RLS on `subscription_modal_dismissals` table
    - Add policy for authenticated users to read their own dismissals
    - Add policy for authenticated users to insert their own dismissals

  3. Indexes
    - Add index on user_id and feature_name for fast lookups
*/

-- Create the subscription_modal_dismissals table
CREATE TABLE IF NOT EXISTS subscription_modal_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_name text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, feature_name)
);

-- Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_subscription_modal_dismissals_user_feature
  ON subscription_modal_dismissals(user_id, feature_name);

-- Enable Row Level Security
ALTER TABLE subscription_modal_dismissals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own dismissals
CREATE POLICY "Users can read own modal dismissals"
  ON subscription_modal_dismissals
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own dismissals
CREATE POLICY "Users can insert own modal dismissals"
  ON subscription_modal_dismissals
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own dismissals (for reset purposes)
CREATE POLICY "Users can delete own modal dismissals"
  ON subscription_modal_dismissals
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
