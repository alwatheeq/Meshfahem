/*
  # Fix Subscription Policies and Create New Admin Account

  1. Problem Fixed
    - Users cannot create their own subscriptions during trial activation
    - Only admin INSERT policy exists, blocking regular user self-registration
    - Need new admin account to replace non-working admin@test.com

  2. Changes
    - Add INSERT policy for users to create their own subscriptions
    - Add UPDATE policy for users to manage their own subscriptions
    - Create new admin account: superadmin@app.com with password SuperAdmin2024!
    - Ensure proper user_profiles entry with admin role

  3. Security
    - Users can only insert subscriptions for themselves (user_id = auth.uid())
    - Users can only update their own subscriptions
    - Admin policies remain in place for full access
    - New admin account confirmed and ready to use

  4. Testing
    - New users should be able to activate 1-day trials
    - New users should be able to purchase paid subscriptions
    - Admin login should work at /admin/login with superadmin@app.com
*/

-- Drop existing INSERT policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON subscriptions;

-- Create policy for users to insert their own subscriptions
CREATE POLICY "Users can insert own subscriptions"
  ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Drop existing UPDATE policy for users if it exists
DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;

-- Create policy for users to update their own subscriptions
CREATE POLICY "Users can update own subscriptions"
  ON subscriptions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create new admin account
DO $$
DECLARE
  new_admin_id uuid;
  admin_email text := 'superadmin@app.com';
  admin_password text := 'SuperAdmin2024!';
BEGIN
  -- Check if this admin already exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = admin_email) THEN
    RAISE NOTICE 'Admin account % already exists', admin_email;
  ELSE
    -- Generate UUID for new admin
    new_admin_id := gen_random_uuid();
    
    -- Create user in auth.users (without confirmed_at as it's generated)
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
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_admin_id,
      'authenticated',
      'authenticated',
      admin_email,
      crypt(admin_password, gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Super Admin"}',
      false
    );
    
    -- Create user_profiles entry with admin role
    INSERT INTO user_profiles (
      id, 
      email, 
      user_role, 
      monthly_usage, 
      last_reset
    ) VALUES (
      new_admin_id, 
      admin_email, 
      'admin', 
      0, 
      now()
    );
    
    RAISE NOTICE '====================================';
    RAISE NOTICE 'NEW ADMIN ACCOUNT CREATED';
    RAISE NOTICE '====================================';
    RAISE NOTICE 'Email: %', admin_email;
    RAISE NOTICE 'Password: %', admin_password;
    RAISE NOTICE 'Login URL: /admin/login';
    RAISE NOTICE '====================================';
    RAISE NOTICE 'IMPORTANT: Save these credentials!';
    RAISE NOTICE '====================================';
  END IF;
END $$;
