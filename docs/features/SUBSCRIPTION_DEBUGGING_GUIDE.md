# Subscription Persistence Debugging Guide

## Problem Fixed
Users were losing their subscription status after closing and reopening their browser, even though subscriptions were stored in the database.

## Changes Made

### 1. Database Layer Improvements

#### New Table: `subscription_status_log`
- Tracks every subscription status change with timestamp
- Records old/new status, old/new end_date, change reason, and who triggered it
- Provides audit trail for debugging subscription lifecycle issues

#### Enhanced RLS Policies
- Simplified subscription SELECT policies to ensure users can ALWAYS read their own data
- Fixed policy: `user_id = auth.uid()` (previously had complex conditions that could fail)
- Added policies for users to INSERT and UPDATE their own subscriptions

#### New Database Functions
- `log_subscription_change()` - Automatic trigger that logs all subscription changes
- `validate_subscription_data()` - Validates subscription data before insert/update
- `get_subscription_debug_info(user_id)` - Returns detailed debug information including:
  - Active subscription count
  - Latest subscription details
  - Recent status changes
  - Days until expiry
  - Whether subscription is expired

#### Improved Expiration Function
- `check_subscription_expiration()` now includes 1-hour buffer to prevent premature expiration
- Only marks subscriptions as expired if they're clearly past end_date

### 2. Frontend Improvements

#### Enhanced `useSubscription` Hook
- Added comprehensive logging to track subscription fetch attempts
- Implemented retry logic with exponential backoff (up to 3 retries)
- Calls `get_subscription_debug_info()` to understand subscription state
- If no active subscription found, checks for ANY subscription to diagnose issues
- Uses `useCallback` and `useRef` to prevent memory leaks and stale closures
- Checks if component is still mounted before setting state

#### Enhanced `AuthContext`
- Added logging when checking for existing subscriptions
- Logs subscription creation success/failure
- Shows existing subscription details including expiry status

#### New Component: `SubscriptionRefreshListener`
- Listens for visibility change events (when user returns to tab)
- Listens for window focus events
- Automatically refreshes subscription when app becomes visible
- Ensures subscription state is up-to-date when user reopens browser

### 3. Session Persistence
- Supabase client already configured with `persistSession: true`
- Auth sessions are stored in localStorage by default
- Subscription data fetched fresh on every app load
- Auto-refresh on visibility change ensures data is current

## Testing Checklist

### Test 1: Basic Subscription Persistence
1. Sign in as a regular user
2. Note your subscription tier (check browser console for logs)
3. Close the browser completely
4. Reopen browser and navigate to the app
5. **Expected**: User should still be logged in and subscription should still be active
6. **Check console logs** for subscription fetch logs

### Test 2: Check Database Directly
Run this query in Supabase SQL Editor:
```sql
SELECT
  s.*,
  u.email,
  CASE
    WHEN s.end_date <= now() THEN 'EXPIRED'
    WHEN s.end_date <= now() + interval '7 days' THEN 'EXPIRING_SOON'
    ELSE 'VALID'
  END as validity_status,
  EXTRACT(DAY FROM s.end_date - now()) as days_remaining
FROM subscriptions s
JOIN auth.users u ON s.user_id = u.id
WHERE u.email = 'YOUR_USER_EMAIL'
ORDER BY s.created_at DESC;
```

### Test 3: View Subscription Logs
Check what's happening to subscriptions:
```sql
SELECT * FROM subscription_status_log
WHERE user_id = 'USER_ID_HERE'
ORDER BY created_at DESC
LIMIT 20;
```

### Test 4: Get Debug Info
Use the new debug function:
```sql
SELECT get_subscription_debug_info('USER_ID_HERE');
```

### Test 5: Visibility Change Test
1. Sign in as a user with active subscription
2. Open browser console
3. Switch to another tab or minimize browser
4. Wait a few seconds
5. Return to the app tab
6. **Expected**: Console should show "App became visible, refreshing subscription"
7. Subscription data should be refreshed

### Test 6: Check RLS Policies
Verify user can read their subscription:
```sql
-- Run as authenticated user (using their JWT)
SELECT * FROM subscriptions WHERE user_id = auth.uid();

-- Should return their subscription(s)
```

### Test 7: Test After Payment
1. User completes payment/activates trial
2. Check console logs for subscription creation
3. Close browser
4. Reopen and verify subscription persists

## Console Logs to Watch For

### Successful Flow:
```
🔄 [SUBSCRIPTION] User detected, fetching subscription for: [user-id]
🔍 [SUBSCRIPTION] Fetching subscription for user: [user-id]
🔍 [SUBSCRIPTION] Current time: [timestamp]
🔍 [SUBSCRIPTION] Debug info: {active_subscription_count: 1, ...}
✅ [SUBSCRIPTION] Found active subscription: {id, tier, status, end_date, days_remaining}
```

### Problem Indicators:
```
⚠️ [SUBSCRIPTION] No active subscription found for user
🔍 [SUBSCRIPTION] Found non-active subscription: {status: 'expired', ...}
⚠️ [SUBSCRIPTION] No subscriptions found at all for this user
❌ [SUBSCRIPTION] Fetch error: [error details]
```

## Common Issues and Solutions

### Issue 1: User logged in but no subscription
**Symptoms**: Console shows "No active subscription found"
**Solution**: Check subscription_status_log to see if subscription was cancelled/expired
**Query**:
```sql
SELECT * FROM subscription_status_log
WHERE user_id = 'USER_ID'
ORDER BY created_at DESC;
```

### Issue 2: Subscription exists but not fetched
**Symptoms**: Database has active subscription, but frontend doesn't see it
**Solution**: Check RLS policies and auth token
**Query**:
```sql
-- Check if subscription exists
SELECT * FROM subscriptions
WHERE user_id = 'USER_ID' AND status = 'active';

-- Check RLS policies
SELECT * FROM pg_policies
WHERE tablename = 'subscriptions';
```

### Issue 3: Subscription expires prematurely
**Symptoms**: Subscription shows as expired before end_date
**Solution**: Check if check_subscription_expiration() is running too frequently
**Fix**: The function now has 1-hour buffer to prevent premature expiration

### Issue 4: Auth token expired
**Symptoms**: User appears logged in but queries fail
**Solution**: Supabase auto-refreshes tokens, but check:
```javascript
const { data: { session } } = await supabase.auth.getSession();
console.log('Session expires at:', new Date(session?.expires_at * 1000));
```

## Admin Debugging Commands

### View All Recent Subscription Changes
```sql
SELECT
  ssl.created_at,
  u.email,
  ssl.old_status,
  ssl.new_status,
  ssl.change_reason,
  ssl.triggered_by
FROM subscription_status_log ssl
JOIN auth.users u ON ssl.user_id = u.id
ORDER BY ssl.created_at DESC
LIMIT 50;
```

### Find Users Without Active Subscriptions
```sql
SELECT
  u.id,
  u.email,
  u.created_at as user_created
FROM auth.users u
LEFT JOIN subscriptions s ON u.id = s.user_id
  AND s.status = 'active'
  AND s.end_date > now()
WHERE s.id IS NULL
  AND u.email NOT LIKE '%admin%'
ORDER BY u.created_at DESC;
```

### View Subscription Debug View (Admins Only)
```sql
SELECT * FROM subscription_debug_view
ORDER BY created_at DESC
LIMIT 20;
```

## Next Steps if Issue Persists

1. **Enable more logging**: Check browser console for all subscription-related logs
2. **Check database logs**: Look at subscription_status_log for unexpected changes
3. **Verify auth session**: Ensure user stays logged in across browser restarts
4. **Test with fresh user**: Create new account and test subscription flow
5. **Check Supabase dashboard**: Verify RLS policies are active and correct

## Support Information

If subscription persistence issues continue:
1. Export subscription_status_log for affected user
2. Check browser console logs for errors
3. Verify Supabase connection is stable
4. Check if any browser extensions are interfering
5. Test in incognito mode to rule out cache issues
