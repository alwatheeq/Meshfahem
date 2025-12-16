# Manual Supabase Setup Instructions

## Overview
You need to run **2 database migrations** in Supabase to fix:
1. **Subscription Credits Issue** - New users who subscribe don't receive credits
2. **Profile Page Access Issue** - Users can't access profile page when profile doesn't exist

---

## Step 1: Access Supabase SQL Editor

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Select your project
3. Click on **"SQL Editor"** in the left sidebar
4. Click **"New query"** button

---

## Step 2: Run Migration 1 - Fix Subscription Credits

### Copy and paste this entire migration:

**File**: `supabase/migrations/20251202160000_fix_subscription_credits_initialization_v2.sql`

Open the file and copy **ALL** its contents, then paste into the SQL Editor.

### What this migration does:
- ✅ Enhances `initialize_subscription_credits` function to handle edge cases
- ✅ Ensures trigger exists and works correctly
- ✅ Fixes `admin_create_subscription_for_user` to explicitly initialize credits
- ✅ Backfills existing broken subscriptions (users with active subscriptions but 0 credits)

### After running:
1. Click **"Run"** button (or press Ctrl+Enter)
2. Check for any errors in the output
3. You should see messages like:
   - `✓ Function initialize_subscription_credits exists`
   - `[BACKFILL] Complete! Fixed: X, Skipped: Y, Errors: Z`

---

## Step 3: Run Migration 2 - Fix Profile Creation Permissions

### Copy and paste this entire migration:

**File**: `supabase/migrations/20251202170000_fix_profile_creation_permissions.sql`

Open the file and copy **ALL** its contents, then paste into the SQL Editor.

### What this migration does:
- ✅ Grants EXECUTE permission on `create_missing_profile` function to authenticated users
- ✅ Verifies function exists and has correct signature
- ✅ Checks RLS policies
- ✅ Creates verification function

### After running:
1. Click **"Run"** button (or press Ctrl+Enter)
2. Check for any errors in the output
3. You should see messages like:
   - `✓ Function create_missing_profile(uuid, text) found`
   - `✓ Granted EXECUTE permission on ensure_user_profile`
   - A summary table showing PASS/FAIL status

---

## Step 4: Verify Everything Works

### Run these verification queries:

#### Check Credit Initialization:
```sql
SELECT * FROM verify_credit_initialization();
```

**Expected Results:**
- `Trigger exists`: **PASS**
- `Function exists`: **PASS**
- `Broken subscriptions`: Should show **PASS** or **WARNING** with count

#### Check Profile Creation Permissions:
```sql
SELECT * FROM verify_profile_creation_permissions();
```

**Expected Results:**
- `create_missing_profile EXECUTE permission`: **PASS**
- `create_missing_profile function exists`: **PASS**
- `RLS enabled on user_profiles`: **PASS**

#### Check for Active Subscriptions with 0 Credits:
```sql
SELECT 
  s.id as subscription_id,
  s.user_id,
  up.email,
  s.subscription_tier,
  up.credits_remaining,
  s.status,
  s.end_date
FROM subscriptions s
JOIN user_profiles up ON s.user_id = up.id
WHERE s.status = 'active'
  AND s.end_date > now()
  AND (up.credits_remaining IS NULL OR up.credits_remaining = 0);
```

**Expected Result:** Should return **0 rows** (or empty result) after migration runs successfully.

---

## Step 5: Test the Fixes

### Test 1: Subscription Credits
1. Create a new user account (or use existing test account)
2. Subscribe to monthly plan
3. Check credits - should show **2700 / 2700** (not 0 / 2700)
4. In Supabase, verify:
   ```sql
   SELECT credits_remaining, credits_total 
   FROM user_profiles 
   WHERE email = 'your-test-email@example.com';
   ```
   Should show: `credits_remaining: 2700, credits_total: 2700`

### Test 2: Profile Page Access
1. Sign in with a user account
2. Navigate to Profile page
3. Should load without errors
4. Profile should be created automatically if missing

---

## Troubleshooting

### If Migration 1 Fails:

**Error: "Function safe_create_subscription does not exist"**
- This is OK - the migration will skip updating it
- The trigger and admin functions will still work

**Error: "Function ensure_user_profile does not exist"**
- This is OK - the migration handles this gracefully
- Profile creation will use `create_missing_profile` instead

### If Migration 2 Fails:

**Error: "Function create_missing_profile does not exist"**
- You need to run the earlier migration first: `20251201121617_profile_repair_and_monitoring_utilities.sql`
- Or manually create the function (contact support if needed)

**Error: "Permission denied"**
- Make sure you're running as the database owner (postgres role)
- Check that you have proper access to the Supabase project

### If Credits Still Not Working:

1. **Check trigger exists:**
   ```sql
   SELECT trigger_name, event_manipulation, event_object_table 
   FROM information_schema.triggers 
   WHERE trigger_name = 'after_subscription_insert_initialize_credits';
   ```

2. **Manually initialize credits for a test user:**
   ```sql
   SELECT initialize_subscription_credits(
     'user-uuid-here'::uuid,
     'monthly'
   );
   ```

3. **Check function permissions:**
   ```sql
   SELECT routine_name, grantee, privilege_type 
   FROM information_schema.routine_privileges 
   WHERE routine_name = 'initialize_subscription_credits';
   ```

### If Profile Page Still Not Working:

1. **Check function permissions:**
   ```sql
   SELECT routine_name, grantee, privilege_type 
   FROM information_schema.routine_privileges 
   WHERE routine_name = 'create_missing_profile' 
     AND grantee = 'authenticated';
   ```
   Should return at least one row with `privilege_type = 'EXECUTE'`

2. **Test function manually:**
   ```sql
   SELECT create_missing_profile(
     'your-user-id-here'::uuid,
     'your-email@example.com'
   );
   ```

3. **Check RLS policies:**
   ```sql
   SELECT * FROM pg_policies 
   WHERE tablename = 'user_profiles';
   ```

---

## Important Notes

1. **Run migrations in order**: Migration 1 first, then Migration 2
2. **Backup first**: Consider backing up your database before running migrations (Supabase has automatic backups)
3. **Test in staging**: If you have a staging environment, test there first
4. **Monitor logs**: Check Supabase logs after running migrations for any warnings

---

## Migration Files Location

The migration files are located in your project:
- `supabase/migrations/20251202160000_fix_subscription_credits_initialization_v2.sql`
- `supabase/migrations/20251202170000_fix_profile_creation_permissions.sql`

---

## Need Help?

If you encounter any issues:
1. Check the error message in Supabase SQL Editor
2. Run the verification queries to see what's failing
3. Check Supabase logs for detailed error messages
4. The migrations include detailed error handling and logging

---

## Summary Checklist

- [ ] Opened Supabase SQL Editor
- [ ] Ran Migration 1 (subscription credits fix)
- [ ] Verified Migration 1 completed successfully
- [ ] Ran Migration 2 (profile creation permissions fix)
- [ ] Verified Migration 2 completed successfully
- [ ] Ran verification queries
- [ ] Tested subscription credits for new user
- [ ] Tested profile page access
- [ ] Everything working correctly ✅

---

**Last Updated**: December 2, 2024

