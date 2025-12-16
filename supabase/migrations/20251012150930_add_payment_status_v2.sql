/*
  # Add Payment Status Tracking to User Profiles

  1. Schema Changes
    - Add `has_paid` column to `user_profiles` table (boolean, default false)
    - Add `payment_date` column to `user_profiles` table (timestamptz, nullable)
    - Add `payment_notes` column to `user_profiles` table (text, nullable)

  2. Security
    - Update RLS policies to allow admin access to payment fields
    - Users can still read their own payment status
    - Only admins can update payment status

  3. Indexes
    - Add index on `has_paid` for efficient filtering

  4. Important Notes
    - This enables tracking of user payment status for subscription management
    - Admins can mark users as paid/unpaid through the admin portal
    - Payment date is automatically set when marking a user as paid
*/

-- Add payment tracking columns to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'has_paid'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN has_paid boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'payment_date'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN payment_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'payment_notes'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN payment_notes text;
  END IF;
END $$;

-- Create index on has_paid for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_payment ON user_profiles(has_paid);

-- Drop existing admin policies if they exist and recreate them
DROP POLICY IF EXISTS "Admins can view all user profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all user profiles" ON user_profiles;

-- Add admin policy to view all user profiles including payment info
CREATE POLICY "Admins can view all user profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND user_role = 'admin'
    )
  );

-- Add admin policy to update all user profiles including payment info
CREATE POLICY "Admins can update all user profiles"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND user_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND user_role = 'admin'
    )
  );