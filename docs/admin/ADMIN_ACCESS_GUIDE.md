# Admin Access Setup Guide

This guide will help you create an admin user and access the admin portal.

## Quick Start

### Step 1: Create Admin User Account

You have two options to create an admin user:

#### Option A: Using Supabase Dashboard (Recommended)

1. Open your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication > Users**
4. Click the **"Add User"** button
5. Fill in the form:
   - **Email**: `admin@example.com` (or your preferred email)
   - **Password**: `AdminPassword123!` (or your preferred password)
   - **Enable "Auto Confirm User"** checkbox (important!)
6. Click **"Create User"**
7. The user will appear in the users list

#### Option B: Sign Up Through Your Application

1. Go to your application's URL
2. Click on **Sign Up**
3. Create an account with your desired admin email and password
4. Log in to verify the account works
5. Sign out

### Step 2: Promote User to Admin

1. In Supabase Dashboard, go to **SQL Editor**
2. Open the `CREATE_ADMIN_USER.sql` file in your project directory
3. Copy the following SQL query and paste it into the SQL Editor:

```sql
UPDATE user_profiles
SET user_role = 'admin'
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = 'admin@example.com'
);
```

4. **Important**: Replace `admin@example.com` with the email you used in Step 1
5. Click **"Run"** to execute the query
6. You should see "Success. No rows returned" (this is normal)

### Step 3: Verify Admin Access

Run this query in the SQL Editor to verify:

```sql
SELECT
  u.id,
  u.email,
  u.created_at,
  up.user_role,
  up.monthly_usage
FROM auth.users u
JOIN user_profiles up ON u.id = up.id
WHERE up.user_role = 'admin';
```

You should see your admin user with `user_role = 'admin'`.

### Step 4: Access the Admin Portal

1. Go to your application URL + `/admin/login`
   - Example: `http://localhost:5173/admin/login`
   - Or: `https://yourdomain.com/admin/login`

2. Log in with your admin credentials:
   - **Email**: The email you created in Step 1
   - **Password**: The password you created in Step 1

3. You should be redirected to the Admin Dashboard

## Admin Portal Features

Once logged in, you can access:

- **Overview**: System statistics and metrics
- **Users Management**: View and manage all users
- **Feedback Management**: View and respond to user feedback
- **History**: View all user activity and history
- **Library**: Access all user library items

## Security Best Practices

### Change Default Password

If you used the default credentials (`admin@example.com` / `AdminPassword123!`):

1. Log in to the admin portal
2. Change your password immediately
3. Use a strong, unique password

### Creating Additional Admins

To promote an existing user to admin:

1. Log in to the admin portal
2. Go to **Users** page
3. Find the user you want to promote
4. Click on their profile
5. Change their role to "Admin"

OR use SQL in Supabase SQL Editor:

```sql
UPDATE user_profiles
SET user_role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'user@example.com');
```

### Demoting Admins

To remove admin access from a user:

```sql
UPDATE user_profiles
SET user_role = 'user'
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@example.com');
```

## Troubleshooting

### "Invalid credentials or you do not have admin access"

**Possible causes:**
1. Wrong email or password
2. User exists but not promoted to admin yet (run Step 2 again)
3. User account not confirmed (enable auto-confirm in Step 1)

**Solution:**
- Verify credentials in Supabase Dashboard > Authentication > Users
- Check user_role in SQL Editor:
  ```sql
  SELECT u.email, up.user_role
  FROM auth.users u
  JOIN user_profiles up ON u.id = up.id
  WHERE u.email = 'your-email@example.com';
  ```
- If user_role is 'user', run the promotion query from Step 2

### Cannot Access Admin Dashboard

**Check:**
1. Are you logged in? (You should see user info in the header)
2. Is your role 'admin'? (Run the verification query from Step 3)
3. Are you accessing the correct URL? (Should be `/admin/login` or `/admin/dashboard`)

### User Profile Not Created

If a user_profiles entry wasn't automatically created:

```sql
INSERT INTO user_profiles (id, user_role, monthly_usage, last_reset)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'admin@example.com'),
  'admin',
  0,
  now()
)
ON CONFLICT (id) DO UPDATE
SET user_role = 'admin';
```

## Additional SQL Queries

### List All Admin Users

```sql
SELECT
  u.email,
  up.user_role,
  up.created_at
FROM auth.users u
JOIN user_profiles up ON u.id = up.id
WHERE up.user_role = 'admin'
ORDER BY up.created_at DESC;
```

### Count Users by Role

```sql
SELECT
  user_role,
  COUNT(*) as total
FROM user_profiles
GROUP BY user_role;
```

### Find User by Email

```sql
SELECT
  u.id,
  u.email,
  u.created_at,
  up.user_role,
  up.monthly_usage,
  up.last_reset
FROM auth.users u
LEFT JOIN user_profiles up ON u.id = up.id
WHERE u.email = 'user@example.com';
```

## Support

If you continue to have issues:

1. Check the browser console for error messages (F12 > Console)
2. Verify your Supabase environment variables in `.env` file
3. Ensure your Supabase project is running
4. Check the Supabase Dashboard logs for authentication errors

---

**Last Updated**: October 2025
