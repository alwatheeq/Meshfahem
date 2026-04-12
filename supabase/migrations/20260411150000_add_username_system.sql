-- Add username system to user_profiles
-- First, create a function to generate unique public user IDs
CREATE OR REPLACE FUNCTION generate_public_user_id()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  new_id text;
  counter integer;
BEGIN
  SELECT COUNT(*) + 1 INTO counter FROM user_profiles WHERE public_user_id IS NOT NULL;
  new_id := 'u' || counter || substr(md5(random()::text), 1, 2);
  WHILE EXISTS (SELECT 1 FROM user_profiles WHERE public_user_id = new_id) LOOP
    new_id := 'u' || counter || substr(md5(random()::text), 1, 2);
  END LOOP;
  RETURN new_id;
END;
$$;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS username text UNIQUE,
  ADD COLUMN IF NOT EXISTS public_user_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;

-- Add check constraint for username format  
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'username_format_chk') THEN
    ALTER TABLE user_profiles ADD CONSTRAINT username_format_chk CHECK (username ~ '^[a-z0-9_]{3,20}$');
  END IF;
END $$;

-- Backfill existing profiles with public_user_id
UPDATE user_profiles SET public_user_id = generate_public_user_id() WHERE public_user_id IS NULL;

-- Make public_user_id NOT NULL after backfill
ALTER TABLE user_profiles ALTER COLUMN public_user_id SET DEFAULT generate_public_user_id();
ALTER TABLE user_profiles ALTER COLUMN public_user_id SET NOT NULL;

-- Create an index for username lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);
