/*
  # Add expiration to user history

  1. Changes
    - Add `expires_at` column to `user_history` table
    - Set default expiration to 365 days from creation
    - Update existing records to have expiration dates
  
  2. Security
    - Add RLS policy to allow deletion of expired history entries
    - Maintain existing user access controls
*/

-- Add expires_at column to user_history table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_history' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE user_history ADD COLUMN expires_at timestamptz;
  END IF;
END $$;

-- Set default expiration date for new records (365 days from creation)
ALTER TABLE user_history 
ALTER COLUMN expires_at SET DEFAULT (now() + interval '365 days');

-- Update existing records that don't have expiration dates
UPDATE user_history 
SET expires_at = created_at + interval '365 days' 
WHERE expires_at IS NULL;

-- Make expires_at NOT NULL after updating existing records
ALTER TABLE user_history 
ALTER COLUMN expires_at SET NOT NULL;

-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_user_history_expires_at 
ON user_history (expires_at);

-- Add RLS policy to allow cleanup of expired history entries
CREATE POLICY "Allow cleanup of expired history entries"
  ON user_history
  FOR DELETE
  TO authenticated
  USING (expires_at <= now());