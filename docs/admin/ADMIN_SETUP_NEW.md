# Admin Users System - Setup Guide

Your application now uses a **dedicated `admin_users` table** to control admin access. This provides better security, easier management, and a clear separation between regular users and administrators.

---

## What Changed?

### Before:
- Admin access was controlled by the `user_role` column in `user_profiles` table
- Admins were just regular users with a different role flag

### After:
- Admin access is controlled by the **`admin_users` table**
- Only users present in this table (with `is_active = true`) can access the admin portal
- Better security with dedicated admin management functions
- Complete audit trail of admin logins and changes

---

## How to Make Any Account an Admin

### Method 1: Using Supabase SQL Editor (Recommended)

1. Go to your **Supabase Dashboard** at https://supabase.com/dashboard
2. Navigate to your project
3. Click on **SQL Editor** in the left sidebar
4. Run this query (replace the email):

```sql
INSERT INTO admin_users (id, email)
SELECT id, email
FROM auth.users
WHERE email = 'user@example.com';
```

That's it! The user can now log in at `/admin/login`

### Method 2: Using the Quick Script

Open the file `ADMIN_MANAGEMENT_GUIDE.sql` in your project and use any of the scripts provided. The most common ones are:

**Add Admin:**
```sql
INSERT INTO admin_users (id, email)
SELECT id, email FROM auth.users WHERE email = 'EMAIL_HERE';
```

**Remove Admin:**
```sql
UPDATE admin_users SET is_active = false WHERE email = 'EMAIL_HERE';
```

**View All Admins:**
```sql
SELECT * FROM admin_users_detailed;
```

---

## Admin Login

Admins can log in at: **`/admin/login`**

After adding a user to the `admin_users` table:
1. They must **sign out** if currently logged in
2. Go to `/admin/login`
3. Sign in with their regular account credentials
4. They will automatically be redirected to the admin dashboard

---

## Migration Details

### What Was Migrated?

All existing users with `user_role = 'admin'` in the `user_profiles` table were automatically migrated to the new `admin_users` table when you applied the migration.

### Verify Migration Success

Run this query in Supabase SQL Editor to see all admins:

```sql
SELECT
  email,
  is_active,
  created_at,
  last_login_at,
  notes
FROM admin_users
ORDER BY created_at DESC;
```

---

## Troubleshooting

### Problem: User Can't Access Admin Portal

**Check 1:** Verify they're in the admin_users table
```sql
SELECT * FROM admin_users WHERE email = 'user@example.com';
```

If no results, add them using Method 1 above.

**Check 2:** Verify they're active
```sql
SELECT email, is_active FROM admin_users WHERE email = 'user@example.com';
```

If `is_active = false`, reactivate them:
```sql
UPDATE admin_users SET is_active = true WHERE email = 'user@example.com';
```

**Check 3:** User must log out and log back in
After adding to admin_users, the user MUST:
1. Sign out completely
2. Go to `/admin/login`
3. Sign in again

### Problem: Getting "Access Denied" Error

This means the user is **not in the admin_users table** or is **inactive**.

Solution:
1. Verify the user account exists in `auth.users`
2. Add them to `admin_users` using the SQL commands above
3. Have them log out and log back in

---

## Security Features

### Admin Table Benefits:
- **Separation of Concerns**: Admin users are managed separately from regular users
- **Audit Trail**: Track when admins were added, by whom, and when they last logged in
- **Easy Deactivation**: Disable admin access without deleting user accounts
- **Login Monitoring**: All admin login attempts are logged in `admin_login_attempts` table
- **No Self-Deletion**: Admins cannot deactivate their own accounts

### Viewing Admin Activity:
```sql
-- Recent admin logins
SELECT email, attempted_at, success
FROM admin_login_attempts
WHERE attempted_at > now() - interval '7 days'
ORDER BY attempted_at DESC;

-- Admin statistics
SELECT
  COUNT(*) as total_admins,
  COUNT(*) FILTER (WHERE is_active) as active_admins,
  COUNT(*) FILTER (WHERE last_login_at > now() - interval '7 days') as recently_active
FROM admin_users;
```

---

## Quick Reference

### Add Admin
```sql
INSERT INTO admin_users (id, email)
SELECT id, email FROM auth.users WHERE email = 'EMAIL_HERE';
```

### Remove Admin
```sql
UPDATE admin_users SET is_active = false WHERE email = 'EMAIL_HERE';
```

### View All Admins
```sql
SELECT * FROM admin_users_detailed;
```

### Check If User Is Admin
```sql
SELECT is_admin_user('USER_UUID_HERE');
```

---

## Advanced Management

For more advanced admin management operations, including:
- Bulk operations (add/remove multiple admins)
- Login history analysis
- Security audits
- Admin activity reports

Please refer to the **`ADMIN_MANAGEMENT_GUIDE.sql`** file in your project root.

---

## Need Help?

If you encounter any issues:

1. Check the Supabase logs for errors
2. Verify the migration applied successfully
3. Review the browser console for debug logs (they're prefixed with admin-related emojis)
4. Run the verification queries in the Troubleshooting section above

The system includes extensive debug logging to help identify any issues.
