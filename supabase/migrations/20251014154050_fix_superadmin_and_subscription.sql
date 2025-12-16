/*
  # Fix Superadmin Account and Subscription
  
  1. Purpose
    - Ensure superadmin@app.com exists with correct credentials
    - Set user_role to 'admin' in user_profiles
    - Create a long-term subscription (10 years) for admin access
    - Fix admin authentication and subscription issues
  
  2. Changes Made
    - Create or verify superadmin user exists in auth.users
    - Create or update user_profile with admin role
    - Create active 10-year subscription for seamless admin access
    - No Stripe integration required for admin accounts
  
  3. Admin Credentials
    - Email: superadmin@app.com
    - Password: SuperAdmin2024!
    - Role: admin
    - Subscription: 10-year biannual (expires 2034)
  
  4. Security Notes
    - Password is securely hashed using bcrypt
    - Admin role grants full access without subscription checks
    - Subscription record prevents app errors when fetching subscription data
*/

-- Step 1: Create or verify superadmin user exists
DO $$
DECLARE
  admin_user_id uuid;
  admin_email text := 'superadmin@app.com';
  admin_password text := 'SuperAdmin2024!';
BEGIN
  -- Check if user exists
  SELECT id INTO admin_user_id FROM auth.users WHERE email = admin_email;
  
  IF admin_user_id IS NULL THEN
    -- Create new admin user
    admin_user_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', admin_user_id,
      'authenticated', 'authenticated', admin_email,
      crypt(admin_password, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Super Admin"}',
      '', ''
    );
    
    RAISE NOTICE '✓ Created new admin user: % with ID: %', admin_email, admin_user_id;
  ELSE
    -- Update password for existing user
    UPDATE auth.users
    SET encrypted_password = crypt(admin_password, gen_salt('bf')),
        email_confirmed_at = now(),
        updated_at = now()
    WHERE id = admin_user_id;
    
    RAISE NOTICE '✓ Updated existing admin user: % with ID: %', admin_email, admin_user_id;
  END IF;
  
  -- Step 2: Create or update user profile with admin role
  INSERT INTO user_profiles (
    id, email, user_role, monthly_usage, last_reset
  ) VALUES (
    admin_user_id, admin_email, 'admin', 0, now()
  )
  ON CONFLICT (id) DO UPDATE 
  SET user_role = 'admin',
      email = admin_email,
      updated_at = now();
  
  RAISE NOTICE '✓ Admin profile created/updated with admin role';
  
  -- Step 3: Create long-term subscription for admin (delete old ones first)
  DELETE FROM subscriptions WHERE user_id = admin_user_id;
  
  INSERT INTO subscriptions (
    user_id,
    subscription_tier,
    status,
    start_date,
    end_date,
    next_billing_date,
    stripe_subscription_id,
    stripe_customer_id,
    payment_method_saved,
    auto_renew,
    canceled_at,
    trial_end_date
  ) VALUES (
    admin_user_id,
    'biannual',                    -- Longest paid tier
    'active',                       -- Active status
    now(),                          -- Start now
    now() + interval '10 years',   -- End in 10 years
    null,                           -- No billing date
    null,                           -- No Stripe ID
    null,                           -- No Stripe customer
    false,                          -- No payment method
    false,                          -- No auto-renewal
    null,                           -- Not canceled
    null                            -- No trial period
  );
  
  RAISE NOTICE '✓ Created 10-year subscription for superadmin (expires: %)', (now() + interval '10 years')::date;
  
  -- Step 4: Verify setup
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'SUPERADMIN ACCOUNT READY';
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'Email: %', admin_email;
  RAISE NOTICE 'Password: %', admin_password;
  RAISE NOTICE 'Login URL: /admin/login';
  RAISE NOTICE '==================================================';
END $$;

-- Create verification view for easy checking
CREATE OR REPLACE VIEW admin_status AS
SELECT 
  u.email,
  u.email_confirmed_at IS NOT NULL as email_confirmed,
  up.user_role,
  s.subscription_tier,
  s.status as subscription_status,
  s.start_date::date as subscription_start,
  s.end_date::date as subscription_end,
  EXTRACT(YEAR FROM (s.end_date - now())) as years_remaining,
  CASE 
    WHEN up.user_role = 'admin' AND s.status = 'active' 
    THEN 'READY TO LOGIN'
    ELSE 'ISSUE DETECTED'
  END as status
FROM auth.users u
JOIN user_profiles up ON u.id = up.id
LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
WHERE up.user_role = 'admin';

-- Display current admin status
DO $$
DECLARE
  admin_record RECORD;
BEGIN
  FOR admin_record IN 
    SELECT * FROM admin_status WHERE email = 'superadmin@app.com'
  LOOP
    RAISE NOTICE 'Admin Email: %', admin_record.email;
    RAISE NOTICE 'Role: %', admin_record.user_role;
    RAISE NOTICE 'Subscription: % (%)', admin_record.subscription_tier, admin_record.subscription_status;
    RAISE NOTICE 'Valid Until: %', admin_record.subscription_end;
    RAISE NOTICE 'Status: %', admin_record.status;
  END LOOP;
END $$;