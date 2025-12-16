# Admin Access Credentials

## Admin Account Details

A test admin account has been created for you to access the admin panel.

### Login Information

- **URL**: `/admin/login`
- **Email**: `admin@test.com`
- **Password**: `Admin123!`

### How to Login

1. Navigate to `/admin/login` in your browser
2. Enter the email: `admin@test.com`
3. Enter the password: `Admin123!`
4. Click "Sign In to Admin Panel"

### Existing Admin Accounts

There are also two other admin accounts in the system:
- `aboodayyashy@gmail.com`
- `anafahem@meshfahem.com`

If you know the passwords for these accounts, you can use them to login as well.

## Important Notes

- This is a test admin account created for development purposes
- In production, you should change this password immediately
- You can promote any user to admin by running this SQL query:
  ```sql
  UPDATE user_profiles SET user_role = 'admin' WHERE email = 'user@example.com';
  ```

## Changes Made

### 1. Admin Account Creation ✅
- Created a new admin user in the database with email `admin@test.com`
- Set up proper user_profile entry with admin role
- Email is confirmed and account is ready to use

### 2. Stripe Disabled - Free Tier Mode ✅
- All Stripe checkout code has been commented out in `CheckoutPage.tsx`
- Users can now freely switch between any subscription tier
- No payment is required - all tiers are completely free
- Subscriptions are set to last 1 year from activation date
- When users click on a tier button, it directly creates/updates their subscription in the database
- The pricing page now shows "All plans are currently FREE - No payment required!"

### 3. Navigation Bar Scrolling Fixed ✅
- Added `overflow-y-auto` to the Sidebar navigation container
- Users can now scroll through all navigation items
- Custom scrollbar styling applied (thin, gradient design)
- Dark mode scrollbar styling added for better visibility
- Scrollbar width increased to 8px for easier usability

## To Re-enable Stripe Payments Later

When you're ready to re-enable Stripe payments:

1. Open `src/components/Pricing/CheckoutPage.tsx`
2. Find the `initiateCheckout` function
3. Remove the free tier code (lines 85-129)
4. Uncomment the Stripe integration code (marked with comments)
5. Update the pricing page header text back to original
6. Ensure your Stripe API keys are configured in environment variables

The Stripe edge function (`create-checkout-session`) is still intact and ready to use.
