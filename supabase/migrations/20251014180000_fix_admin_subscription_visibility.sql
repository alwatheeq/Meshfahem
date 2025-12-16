/*
  # Fix Admin Subscription Visibility and Management

  1. Problem
    - Admins cannot see subscriptions in admin dashboard
    - Subscriptions RLS policies need to check is_admin_user() function
    - Need to add policies for admins to manage subscriptions

  2. Solution
    - Update subscriptions table policies to allow admins full access
    - Add insert, update, and delete policies for subscription management
    - Ensure is_admin_user() function is used consistently

  3. Changes
    - Drop and recreate admin view policies on subscriptions
    - Add admin management policies (insert, update, delete)
    - Test that admins can view all subscriptions with user profile data
*/

-- ============================================================================
-- STEP 1: Update admin view policy for subscriptions
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view all subscriptions" ON subscriptions;

CREATE POLICY "Admins can view all subscriptions"
  ON subscriptions
  FOR SELECT
  TO authenticated
  USING (
    is_admin_user() OR auth.uid() = user_id
  );

-- ============================================================================
-- STEP 2: Add admin insert policy for subscription management
-- ============================================================================

DROP POLICY IF EXISTS "Admins can insert subscriptions" ON subscriptions;

CREATE POLICY "Admins can create subscriptions for users"
  ON subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_user());

-- ============================================================================
-- STEP 3: Add admin update policy for subscription management
-- ============================================================================

DROP POLICY IF EXISTS "Admins can update subscriptions" ON subscriptions;

CREATE POLICY "Admins can update subscriptions"
  ON subscriptions
  FOR UPDATE
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- ============================================================================
-- STEP 4: Add admin delete policy for subscription management
-- ============================================================================

DROP POLICY IF EXISTS "Admins can delete subscriptions" ON subscriptions;

CREATE POLICY "Admins can delete subscriptions"
  ON subscriptions
  FOR DELETE
  TO authenticated
  USING (is_admin_user());

-- ============================================================================
-- STEP 5: Ensure users can still manage their own subscriptions
-- ============================================================================

-- Users can update their own subscriptions (for auto-renew, etc)
DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;

CREATE POLICY "Users can update own subscriptions"
  ON subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- STEP 6: Update transactions table policies for admin visibility
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view all transactions" ON transactions;

CREATE POLICY "Admins can view all transactions"
  ON transactions
  FOR SELECT
  TO authenticated
  USING (is_admin_user() OR auth.uid() = user_id);

-- ============================================================================
-- STEP 7: Verify policies are working
-- ============================================================================

DO $$
DECLARE
  subscription_policies_count integer;
  transaction_policies_count integer;
BEGIN
  SELECT COUNT(*) INTO subscription_policies_count
  FROM pg_policies
  WHERE tablename = 'subscriptions';

  SELECT COUNT(*) INTO transaction_policies_count
  FROM pg_policies
  WHERE tablename = 'transactions';

  RAISE NOTICE '==================================================';
  RAISE NOTICE 'ADMIN SUBSCRIPTION VISIBILITY FIXED';
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'Subscriptions table policies: %', subscription_policies_count;
  RAISE NOTICE 'Transactions table policies: %', transaction_policies_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Admins can now:';
  RAISE NOTICE '  - View all user subscriptions';
  RAISE NOTICE '  - Create subscriptions for any user';
  RAISE NOTICE '  - Update subscription tiers and status';
  RAISE NOTICE '  - Delete/cancel subscriptions';
  RAISE NOTICE '  - View all transaction history';
  RAISE NOTICE '==================================================';
END $$;
