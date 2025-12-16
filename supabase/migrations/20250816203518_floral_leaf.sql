/*
  # Create user profiles table

  1. New Tables
    - `user_profiles`
      - `id` (uuid, primary key, references auth.users)
      - `monthly_usage` (integer, default 0)
      - `last_reset` (timestamptz, default now())
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `user_profiles` table
    - Add policy for users to read their own profile
    - Add policy for users to update their own profile
    - Add policy for users to insert their own profile

  3. Functions
    - Add trigger to automatically update `updated_at` timestamp
*/

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_usage integer NOT NULL DEFAULT 0,
  last_reset timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for user_profiles
CREATE POLICY "Users can view own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to handle monthly reset
CREATE OR REPLACE FUNCTION check_monthly_reset()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if we're in a new month compared to last_reset
  IF EXTRACT(YEAR FROM NEW.last_reset) != EXTRACT(YEAR FROM now()) OR 
     EXTRACT(MONTH FROM NEW.last_reset) != EXTRACT(MONTH FROM now()) THEN
    NEW.monthly_usage = 0;
    NEW.last_reset = now();
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically handle monthly reset on profile access
CREATE TRIGGER check_user_profiles_monthly_reset
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION check_monthly_reset();