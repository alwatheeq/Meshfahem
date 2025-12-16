# Library Access Verification Guide

## Overview
This guide provides step-by-step instructions to verify that the library publishing and subscription access system works correctly.

## System Requirements Summary

Based on the user's requirements:
1. **All published items are PUBLIC** - No private option exists
2. **Subscription required to access library** - Non-subscribed users see upgrade prompt
3. **No tag-based visibility** - Tags are for organization only, not visibility control
4. **Cross-user visibility** - All subscribed users can see all published items

## Changes Implemented

### 1. LibraryPage Protection (✅ Completed)
- Added `SubscriptionGuard` wrapper to `LibraryPage.tsx`
- Non-subscribed users will now see subscription upgrade prompt
- Users must have active subscription to access library

### 2. Simplified RLS Policies (✅ Completed)
- Created migration: `20251112000000_simplify_library_visibility.sql`
- Removed complex tag-based visibility logic
- New policies:
  - Users can read own items
  - Users can read all public items
  - Anonymous users can access items via shareable_link
- Tags are now purely for organization and filtering

### 3. Updated Publish Modal UI (✅ Completed)
- Added clear notice: "All published items are PUBLIC"
- Updated tag messaging to clarify they're for organization
- Removed confusing "private/public" visibility indicators based on tags
- Simplified user experience

## Verification Test Cases

### Test 1: Non-Subscribed User Access
**Objective**: Verify non-subscribed users cannot access library

**Steps**:
1. Create a test user account (User A)
2. Do NOT subscribe or activate trial
3. Navigate to `/library` route
4. **Expected Result**:
   - SubscriptionGuard displays upgrade prompt
   - User cannot see any library content
   - "View Plans & Pricing" button navigates to `/pricing`

**Status**: ⏳ Pending Manual Test

---

### Test 2: Subscribed User Publishing
**Objective**: Verify subscribed users can publish items to library

**Steps**:
1. Create or use a subscribed user account (User B)
2. Process a document or text to generate summary + flashcards
3. Click "Publish to Library" button
4. In publish modal:
   - Verify green notice says "All published items are PUBLIC"
   - Select a folder (optional)
   - Select at least one tag (required)
   - Click "Publish"
5. Navigate to Library page
6. **Expected Result**:
   - Item appears in "My Items" view
   - Item shows in "All Items" view
   - Item has is_public=true in database
   - Item has shareable_link generated

**Database Verification**:
```sql
SELECT id, title, is_public, shareable_link, user_id, created_at
FROM user_library_items
WHERE user_id = 'USER_B_UUID'
ORDER BY created_at DESC
LIMIT 5;
```

**Status**: ⏳ Pending Manual Test

---

### Test 3: Cross-User Library Access
**Objective**: Verify subscribed users can see each other's published items

**Prerequisites**:
- User B (subscribed) has published at least one item
- User C (subscribed) is a different user

**Steps**:
1. Login as User C (subscribed user)
2. Navigate to `/library`
3. Select "All Items" view
4. **Expected Result**:
   - User C can see User B's published item(s)
   - Items show creator email/username
   - Items display "Community" badge

5. Select "Community Items" view
6. **Expected Result**:
   - Only shows items from other users (not User C's own items)
   - User B's items are visible

7. Select "My Items" view
8. **Expected Result**:
   - Only shows User C's own items
   - User B's items are NOT visible here

**Database Verification**:
```sql
-- Verify User C can query User B's public items
SELECT
  uli.id,
  uli.title,
  uli.is_public,
  up.email as creator_email
FROM user_library_items uli
LEFT JOIN user_profiles up ON uli.user_id = up.id
WHERE uli.is_public = true
ORDER BY uli.created_at DESC;
```

**Status**: ⏳ Pending Manual Test

---

### Test 4: Item Interactions (Like, Favorite, Comment)
**Objective**: Verify subscribed users can interact with community items

**Prerequisites**:
- User B has published an item
- User C is logged in (subscribed)

**Steps**:
1. Login as User C
2. Navigate to Library
3. View User B's published item
4. Click "Like" button
5. **Expected Result**: Like count increases, button shows active state

6. Click "Favorite" button
7. **Expected Result**: Favorite count increases, button shows active state

8. Write a comment and submit
9. **Expected Result**: Comment appears under the item with User C's email

**Database Verification**:
```sql
-- Check reactions
SELECT item_id, user_id, reaction_type, created_at
FROM item_reactions
WHERE item_id = 'USER_B_ITEM_UUID';

-- Check comments
SELECT item_id, user_id, comment_text, created_at
FROM comments
WHERE item_id = 'USER_B_ITEM_UUID';
```

**Status**: ⏳ Pending Manual Test

---

### Test 5: Anonymous User Access via Shareable Link
**Objective**: Verify anonymous users can view items via direct link

**Prerequisites**:
- User B has published an item with shareable_link

**Steps**:
1. Logout or use incognito window
2. Navigate to shareable link: `/share/{shareable_link_uuid}`
3. **Expected Result**:
   - Item is viewable in read-only mode
   - Summary and flashcards are visible
   - Like/Favorite/Comment features are disabled (requires login)

**Status**: ⏳ Pending Manual Test

---

### Test 6: Expired Subscription
**Objective**: Verify users with expired subscriptions cannot access library

**Steps**:
1. Create a user with 1-day trial (User D)
2. Wait for trial to expire OR manually set end_date in past
3. Login as User D
4. Navigate to `/library`
5. **Expected Result**:
   - SubscriptionGuard displays "Subscription Expired" prompt
   - User cannot access library
   - Previously published items by User D remain accessible to OTHER subscribed users

**Database Verification**:
```sql
-- Manually expire subscription
UPDATE subscriptions
SET end_date = NOW() - INTERVAL '1 day',
    status = 'expired'
WHERE user_id = 'USER_D_UUID';
```

**Status**: ⏳ Pending Manual Test

---

### Test 7: Admin User Access
**Objective**: Verify admin users always have library access

**Steps**:
1. Login as admin user
2. Navigate to `/library`
3. **Expected Result**:
   - Admin can access library without subscription check
   - Admin can see all published items
   - Admin can interact with all items

**Status**: ⏳ Pending Manual Test

---

### Test 8: RLS Policy Verification
**Objective**: Verify database-level security is correctly enforced

**Steps**:
1. Connect to Supabase database
2. Run the following queries as different users:

**Query 1: Non-subscribed User (application-level block)**
```sql
-- This query works at DB level but is blocked by SubscriptionGuard
SET ROLE authenticated;
SET request.jwt.claim.sub = 'NON_SUBSCRIBED_USER_UUID';

SELECT id, title, is_public, user_id
FROM user_library_items
WHERE is_public = true;

-- Expected: Returns public items (DB allows, but React blocks)
```

**Query 2: Subscribed User**
```sql
SET ROLE authenticated;
SET request.jwt.claim.sub = 'SUBSCRIBED_USER_UUID';

SELECT id, title, is_public, user_id
FROM user_library_items
WHERE is_public = true OR user_id = 'SUBSCRIBED_USER_UUID';

-- Expected: Returns all public items + own items
```

**Query 3: Anonymous User**
```sql
SET ROLE anon;

SELECT id, title, is_public, shareable_link
FROM user_library_items
WHERE shareable_link = 'SOME_SHAREABLE_LINK_UUID';

-- Expected: Returns only that specific item if is_public=true
```

**Status**: ⏳ Pending Manual Test

---

## Database Schema Verification

Run these queries to verify the schema is correct:

```sql
-- 1. Check user_library_items columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'user_library_items'
ORDER BY ordinal_position;

-- 2. Check RLS policies on user_library_items
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'user_library_items';

-- 3. Verify is_public column is NOT NULL
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'user_library_items'
  AND column_name = 'is_public';

-- Expected: is_nullable = 'NO', column_default = 'false'
```

## Edge Cases to Test

### Edge Case 1: User Creates Item Before Subscribing
1. User creates content but doesn't publish
2. User subscribes
3. User publishes item
4. **Expected**: Item is successfully published and visible to all

### Edge Case 2: Tag Deletion Impact
1. User B publishes item with Tag X
2. Admin deletes Tag X
3. **Expected**: Item remains public and accessible (tags don't control visibility)

### Edge Case 3: Folder Deletion Impact
1. User B publishes item in Folder Y
2. User B deletes Folder Y
3. **Expected**: Item moves to "Uncategorized" but remains public

### Edge Case 4: Multiple Items Same User
1. User B publishes 10 items
2. User C views community library
3. **Expected**: All 10 items from User B are visible to User C

## Performance Verification

Check query performance for common operations:

```sql
-- 1. Fetch all public items (community library)
EXPLAIN ANALYZE
SELECT *
FROM user_library_items
WHERE is_public = true
ORDER BY created_at DESC
LIMIT 50;

-- 2. Fetch user's own items
EXPLAIN ANALYZE
SELECT *
FROM user_library_items
WHERE user_id = 'SOME_USER_UUID'
ORDER BY created_at DESC;

-- 3. Check if using indexes
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename = 'user_library_items';
```

## Success Criteria

All tests must pass with the following results:
- ✅ Non-subscribed users CANNOT access library page
- ✅ Subscribed users CAN access library page
- ✅ All published items have is_public=true
- ✅ Subscribed users can see all public items from all users
- ✅ Users can interact (like, favorite, comment) on community items
- ✅ Anonymous users can view items via shareable link only
- ✅ Tags do NOT control visibility (only organization)
- ✅ RLS policies are correctly enforced at database level
- ✅ SubscriptionGuard prevents non-subscribed access at UI level

## Rollback Plan

If issues are found, rollback by:
1. Remove SubscriptionGuard from LibraryPage.tsx
2. Rollback migration: `20251112000000_simplify_library_visibility.sql`
3. Revert SummaryDisplay.tsx UI changes

## Next Steps After Verification

Once all tests pass:
1. Mark all tests as ✅ Completed
2. Document any issues found and resolved
3. Update user documentation with new library access requirements
4. Train support team on new subscription requirements
5. Monitor error logs for any access issues

## Support Queries

Common support queries and resolutions:

**Q: "I can't see the library"**
A: Check if user has active subscription. If not, guide them to pricing page.

**Q: "My published item isn't visible to others"**
A: Verify is_public=true in database. Check if item was successfully published.

**Q: "I can see someone's item but can't comment"**
A: Check if user's subscription is still active.

## Monitoring Recommendations

Set up monitoring for:
- Failed library access attempts (subscription required)
- RLS policy violations (should be rare/none)
- Publishing failures (is_public not set correctly)
- Subscription check performance
- Database query performance on user_library_items table

---

**Document Created**: 2025-11-12
**Last Updated**: 2025-11-12
**Status**: Implementation Complete - Testing Pending
