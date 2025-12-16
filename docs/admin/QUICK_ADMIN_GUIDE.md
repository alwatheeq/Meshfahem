# Quick Admin Guide

## Add Any Account as Admin (3 Steps)

### Step 1: Go to Supabase SQL Editor
1. Open https://supabase.com/dashboard
2. Select your project
3. Click "SQL Editor" in the sidebar

### Step 2: Run This Command
Replace `user@example.com` with the email you want to make admin:

```sql
INSERT INTO admin_users (id, email)
SELECT id, email FROM auth.users WHERE email = 'user@example.com';
```

### Step 3: User Logs In
The user should:
1. Sign out if currently logged in
2. Go to `/admin/login`
3. Log in with their normal credentials
4. They now have admin access!

---

## Remove Admin Access

```sql
UPDATE admin_users SET is_active = false WHERE email = 'user@example.com';
```

---

## View All Admins

```sql
SELECT email, is_active, created_at, last_login_at
FROM admin_users
ORDER BY created_at DESC;
```

---

## Verify Setup

Run this in SQL Editor to check everything is working:

```sql
SELECT * FROM admin_users_detailed;
```

You should see a list of all admin users with their details.

---

## Troubleshooting

**Problem:** User can't access admin portal

**Solution:**
1. Verify they're in the table:
   ```sql
   SELECT * FROM admin_users WHERE email = 'user@example.com';
   ```

2. If not there, add them using Step 2 above

3. If there but `is_active = false`, reactivate:
   ```sql
   UPDATE admin_users SET is_active = true WHERE email = 'user@example.com';
   ```

4. User must log out and log back in

---

## More Details

- **Complete SQL Guide:** `ADMIN_MANAGEMENT_GUIDE.sql`
- **Full Setup Guide:** `ADMIN_SETUP_NEW.md`
- **Verification Script:** `VERIFY_ADMIN_SETUP.sql`
- **System Summary:** `ADMIN_SYSTEM_SUMMARY.md`

---

## That's It!

Your admin system is now controlled by the `admin_users` table in Supabase. Just add users to this table to give them admin access.
