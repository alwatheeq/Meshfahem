# Email/Password Sign-Up Fix - COMPLETE

## Problem Summary

Email/password sign-ups were failing with "Database error saving new user" - a 500 Internal Server Error. Google OAuth sign-ups worked fine.

## Root Cause

Two database functions were missing the `SECURITY DEFINER` clause:
- `prevent_admin_user_profile()`
- `prevent_admin_subscription()`

These functions are called by BEFORE INSERT triggers when creating user profiles. They check if a user is an admin by querying the `admin_users` table. Without `SECURITY DEFINER`, they ran with regular user privileges and were blocked by Row Level Security (RLS), causing all sign-ups to fail.

## The Sign-Up Flow

### Before Fix (BROKEN)
1. User submits email/password
2. `supabase.auth.signUp()` creates record in `auth.users` ✓
3. Trigger fires: `create_profile_on_signup()` tries to insert into `user_profiles`
4. BEFORE INSERT trigger: `prevent_admin_user_profile()` tries to check `admin_users`
5. RLS blocks the query (function runs as regular user) ✗
6. Profile creation fails with 500 error
7. User sees: "Database error saving new user"

### After Fix (WORKING)
1. User submits email/password
2. `supabase.auth.signUp()` creates record in `auth.users` ✓
3. Trigger fires: `create_profile_on_signup()` tries to insert into `user_profiles`
4. BEFORE INSERT trigger: `prevent_admin_user_profile()` checks `admin_users` with SECURITY DEFINER ✓
5. Check passes (user is not admin)
6. Profile created with email, 2700 starting credits ✓
7. AFTER INSERT trigger: `initialize_user_preferences()` creates preferences ✓
8. Sign-up completes successfully ✓

## Fix Applied

**Migration:** `20251130181707_20251130181643_fix_prevent_admin_functions_security_definer.sql`

Added `SECURITY DEFINER` to both functions:

```sql
CREATE OR REPLACE FUNCTION prevent_admin_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- Added this
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = NEW.id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Cannot create user_profile for admin user...';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_admin_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- Added this
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = NEW.user_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Cannot create subscription for admin user...';
  END IF;
  RETURN NEW;
END;
$$;
```

## Verification Results

All critical functions now have SECURITY DEFINER:
- ✓ `create_profile_on_signup` - SECURITY DEFINER
- ✓ `prevent_admin_user_profile` - SECURITY DEFINER (FIXED)
- ✓ `prevent_admin_subscription` - SECURITY DEFINER (FIXED)
- ✓ `initialize_user_preferences` - SECURITY DEFINER

All triggers properly attached:
- ✓ `prevent_admin_in_user_profiles` on `user_profiles` table
- ✓ `prevent_admin_subscriptions` on `subscriptions` table

## What Now Works

1. **Email/Password Sign-Up**: Users can sign up with email and password
2. **Profile Creation**: User profiles are automatically created with:
   - Email address
   - 2700 starting credits (90% of 3000 free tier)
   - Billing cycle initialization
3. **Preferences**: User preferences initialized with sidebar mode
4. **Admin Protection**: Admin users still cannot have regular user profiles
5. **Google OAuth**: Still works (was never broken)

## Security Impact

Adding `SECURITY DEFINER` is safe because:
- Functions only check if user is admin (read-only operation)
- They don't return or expose any admin data
- They don't allow privilege escalation
- They only enable the security check to complete
- Without it, ALL sign-ups fail (security by accident, not design)

## Testing Instructions

1. Go to the sign-up page
2. Enter a new email and password
3. Click "Sign Up"
4. Should succeed without any errors
5. User should be logged in with 2700 credits

## Files Changed

- `supabase/migrations/20251130181707_20251130181643_fix_prevent_admin_functions_security_definer.sql` (NEW)

## No Frontend Changes Required

The frontend code was already correct. The issue was entirely in the database layer.
