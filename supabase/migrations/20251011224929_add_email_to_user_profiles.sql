/*
  # Add Email to User Profiles

  1. Schema Changes
    - Add `email` column to `user_profiles` table
      - Type: text NOT NULL
      - Add unique constraint to prevent duplicate emails
    - Create index on email for efficient email-based queries
  
  2. Data Migration
    - Backfill existing user profiles with email from auth.users
    - Uses a function to safely populate emails for all existing users
  
  3. Functions & Triggers
    - Create trigger function to automatically sync email from auth.users
    - Trigger runs on INSERT to populate email when new profiles are created
    - This ensures email is always in sync with auth.users table
  
  4. Notes
    - Email is required for all user profiles
    - Email will be automatically populated from auth.users on profile creation
    - Existing users will have their emails backfilled from auth.users
    - Future user registrations will automatically include email via trigger
*/

-- Add email column to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'email'
  ) THEN
    -- Add email column (initially nullable for backfill)
    ALTER TABLE user_profiles ADD COLUMN email text;
  END IF;
END $$;

-- Backfill existing user profiles with emails from auth.users
UPDATE user_profiles
SET email = auth_users.email
FROM auth.users AS auth_users
WHERE user_profiles.id = auth_users.id
  AND user_profiles.email IS NULL;

-- Make email NOT NULL after backfill
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' 
      AND column_name = 'email'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE user_profiles ALTER COLUMN email SET NOT NULL;
  END IF;
END $$;

-- Create index on email for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Create function to sync email from auth.users
CREATE OR REPLACE FUNCTION sync_user_email()
RETURNS TRIGGER AS $$
BEGIN
  -- Get email from auth.users and set it on the new profile
  SELECT email INTO NEW.email
  FROM auth.users
  WHERE id = NEW.id;
  
  -- If email is still null, raise an exception
  IF NEW.email IS NULL THEN
    RAISE EXCEPTION 'Cannot create user profile: email not found in auth.users for user ID %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically sync email on profile creation
DROP TRIGGER IF EXISTS sync_user_profiles_email ON user_profiles;
CREATE TRIGGER sync_user_profiles_email
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  WHEN (NEW.email IS NULL)
  EXECUTE FUNCTION sync_user_email();

-- Create function to update email when auth.users email changes
CREATE OR REPLACE FUNCTION update_user_profile_email()
RETURNS TRIGGER AS $$
BEGIN
  -- Update email in user_profiles when it changes in auth.users
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE user_profiles
    SET email = NEW.email
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users to sync email updates to user_profiles
DROP TRIGGER IF EXISTS sync_auth_user_email ON auth.users;
CREATE TRIGGER sync_auth_user_email
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION update_user_profile_email();