/*
  # Create Test Admin Account
  
  1. Purpose
    - Creates a test admin account that can be used to access the admin panel
    - Email: admin@test.com
    - Password: Admin123!
    
  2. Details
    - Creates user in auth.users with confirmed email
    - Creates user_profile entry with admin role
    - Sets up basic usage tracking fields
    
  3. Security
    - This is a test account - change credentials in production
    - Account has full admin privileges
    
  4. Usage
    - Go to /admin/login
    - Email: admin@test.com
    - Password: Admin123!
*/

-- Create admin user using the create_admin_user function if it exists
-- Otherwise create manually
DO $$
DECLARE
  new_admin_id uuid;
BEGIN
  -- Try to use the function first
  BEGIN
    SELECT create_admin_user('admin@test.com', 'Admin123!') INTO new_admin_id;
    RAISE NOTICE 'Admin account created successfully with ID: %', new_admin_id;
  EXCEPTION 
    WHEN OTHERS THEN
      -- If function doesn't work, create manually
      RAISE NOTICE 'Function method failed, creating admin manually: %', SQLERRM;
      
      -- Generate a new UUID for the admin user
      new_admin_id := gen_random_uuid();
      
      -- Insert into auth.users
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        confirmation_sent_at,
        confirmed_at,
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
        'admin@test.com',
        crypt('Admin123!', gen_salt('bf')),
        now(),
        now(),
        now(),
        now(),
        now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Test Admin"}',
        false
      );
      
      -- Insert into user_profiles
      INSERT INTO user_profiles (id, email, user_role, monthly_usage, last_reset)
      VALUES (new_admin_id, 'admin@test.com', 'admin', 0, now());
      
      RAISE NOTICE 'Admin account created manually with ID: %', new_admin_id;
      RAISE NOTICE 'Email: admin@test.com';
      RAISE NOTICE 'Password: Admin123!';
  END;
END $$;
