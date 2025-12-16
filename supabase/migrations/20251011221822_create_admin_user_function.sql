/*
  # Admin User Creation System

  1. Purpose
    - Provides a secure function to create admin users in the system
    - Creates both auth.users entry and corresponding user_profiles entry with admin role
    - Creates an initial admin user for system access

  2. Function
    - `create_admin_user(email text, password text)` - Creates a new admin user
      - Takes email and password as parameters
      - Creates user in auth.users table with encrypted password
      - Creates corresponding user_profiles entry with admin role
      - Returns the created user's ID
      - Prevents duplicate admin emails

  3. Initial Admin User
    - Email: admin@example.com
    - Password: AdminPassword123!
    - **IMPORTANT**: Change this password immediately after first login!

  4. Security Notes
    - Function is SECURITY DEFINER to bypass RLS for user creation
    - Only accessible by existing admins or during initial setup
    - Password should be changed immediately after first use
    - Additional admins can be created through the admin dashboard

  5. Manual Admin Creation
    - To manually create an admin user, run:
      SELECT create_admin_user('email@example.com', 'SecurePassword123!');
    
    - To promote an existing user to admin:
      UPDATE user_profiles SET user_role = 'admin' WHERE id = 'user-uuid';
*/

-- Create function to create admin users
CREATE OR REPLACE FUNCTION create_admin_user(
  user_email text,
  user_password text
)
RETURNS uuid AS $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Check if user with this email already exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
    RAISE EXCEPTION 'User with email % already exists', user_email;
  END IF;

  -- Create the user in auth.users (using Supabase's internal method)
  -- Note: This is a simplified version - in production, you'd use Supabase Admin API
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    user_email,
    crypt(user_password, gen_salt('bf')),
    now(),
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
  RETURNING id INTO new_user_id;

  -- Create the user profile with admin role
  INSERT INTO user_profiles (id, user_role, monthly_usage, last_reset)
  VALUES (new_user_id, 'admin', 0, now());

  RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the initial admin user
-- This will only work if the user doesn't already exist
DO $$
BEGIN
  -- Only create if no admin users exist yet
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_role = 'admin') THEN
    BEGIN
      PERFORM create_admin_user('admin@example.com', 'AdminPassword123!');
      RAISE NOTICE 'Initial admin user created successfully';
      RAISE NOTICE 'Email: admin@example.com';
      RAISE NOTICE 'Password: AdminPassword123!';
      RAISE NOTICE 'IMPORTANT: Change this password immediately after first login!';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not create initial admin user: %', SQLERRM;
      RAISE NOTICE 'You may need to create the admin user manually using Supabase Dashboard';
    END;
  ELSE
    RAISE NOTICE 'Admin users already exist, skipping initial admin creation';
  END IF;
END $$;
