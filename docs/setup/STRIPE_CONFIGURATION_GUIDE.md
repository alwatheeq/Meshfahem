# Stripe Configuration Guide

This guide explains how to enable or disable Stripe payment processing in your application.

## Current Status

**Stripe is currently DISABLED** - All subscriptions are free and activated immediately without payment processing.

## How It Works

The application uses a feature flag system to control Stripe integration:

- **Environment Variable**: `VITE_STRIPE_ENABLED` in `.env` file
- **Default**: `false` (Stripe disabled, free mode)
- **To Enable Stripe**: Change to `true`

## Free Mode (Current Setting)

When `VITE_STRIPE_ENABLED=false`:

✅ **What Happens:**
- Users can select any pricing tier
- Subscriptions are created immediately
- No payment processing occurs
- All subscriptions are set to `active` status
- Subscription end dates are set to 1 year from activation
- No Stripe API calls are made
- Checkout errors related to Stripe are hidden

✅ **Benefits:**
- Test the application without Stripe setup
- Offer free beta access to users
- No payment processing overhead
- Simplified user onboarding

## Stripe Mode (When Enabled)

When `VITE_STRIPE_ENABLED=true`:

⚙️ **Requirements:**
1. Stripe account created
2. Stripe API keys configured in Supabase Edge Functions
3. Stripe webhook endpoint set up
4. Product and price IDs configured

⚙️ **What Happens:**
- Users are redirected to Stripe Checkout
- Payment processing through Stripe
- Webhook handles subscription updates
- Proper billing cycles and renewals
- Payment method management

## How to Enable Stripe

### Step 1: Update Environment Variable

Edit the `.env` file:

```bash
# Change from false to true
VITE_STRIPE_ENABLED=true
```

### Step 2: Configure Stripe Keys

Add Stripe keys to your Supabase Edge Functions:

1. Go to Supabase Dashboard > Edge Functions > Settings
2. Add the following secrets:
   - `STRIPE_SECRET_KEY`: Your Stripe secret key
   - `STRIPE_WEBHOOK_SECRET`: Your webhook signing secret
   - `STRIPE_PUBLISHABLE_KEY`: Your Stripe publishable key (optional)

### Step 3: Update Edge Functions

The following Edge Functions need Stripe configuration:
- `create-checkout-session`
- `stripe-webhook`

These functions are already implemented and will automatically work when Stripe is enabled.

### Step 4: Configure Stripe Products

In your Stripe Dashboard, create products for:
- Monthly Plan ($29.99/month)
- Quarterly Plan ($79.99/3 months)
- Biannual Plan ($149.99/6 months)

Note: Update the price IDs in the `create-checkout-session` function.

### Step 5: Set Up Webhook

1. In Stripe Dashboard > Developers > Webhooks
2. Add endpoint: `https://your-project.supabase.co/functions/v1/stripe-webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

### Step 6: Test and Deploy

1. Rebuild the application: `npm run build`
2. Test in Stripe test mode first
3. Verify webhook events are received
4. Switch to live mode when ready

## How to Disable Stripe (Return to Free Mode)

Simply change the environment variable back:

```bash
VITE_STRIPE_ENABLED=false
```

Then rebuild: `npm run build`

## Code Integration Points

The feature flag is checked in these key locations:

### 1. Subscription Helpers (`src/utils/subscriptionHelpers.ts`)
```typescript
export const isStripeEnabled = (): boolean => {
  return import.meta.env.VITE_STRIPE_ENABLED === 'true';
};

export const getCheckoutMode = (): 'stripe' | 'free' => {
  return isStripeEnabled() ? 'stripe' : 'free';
};
```

### 2. Checkout Page (`src/components/Pricing/CheckoutPage.tsx`)
- Checks mode before initiating checkout
- Shows different UI based on mode
- Handles errors differently for each mode

### 3. Pricing Page (`src/components/Pricing/PricingPage.tsx`)
- Adjusts pricing display
- Shows/hides payment-related FAQs
- Updates messaging based on mode

## Troubleshooting

### Issue: Stripe checkout fails even when enabled

**Solution:**
1. Verify `VITE_STRIPE_ENABLED=true` in `.env`
2. Rebuild the application: `npm run build`
3. Check Stripe keys are configured in Supabase Edge Functions
4. Verify product and price IDs match your Stripe account

### Issue: Still seeing "free" messaging after enabling Stripe

**Solution:**
1. Clear browser cache
2. Rebuild: `npm run build`
3. Restart dev server
4. Check environment variable is exactly `true` (not `"true"` with quotes)

### Issue: Webhook not receiving events

**Solution:**
1. Verify webhook URL is correct
2. Check webhook signing secret matches
3. Ensure selected events include required types
4. Check Supabase function logs for errors

## Database Schema

The application supports both modes with the same schema:

- `subscriptions` table: Tracks all subscriptions (free or paid)
- `transactions` table: Only populated when Stripe is enabled
- `stripe_subscription_id`: Null in free mode, populated in Stripe mode
- `stripe_customer_id`: Null in free mode, populated in Stripe mode

## Best Practices

1. **Test thoroughly** in Stripe test mode before going live
2. **Keep the integration code** - Don't delete Stripe code when disabled
3. **Monitor logs** when first enabling Stripe
4. **Set up alerts** for failed payments
5. **Have a rollback plan** - Can quickly switch back to free mode if needed

## Support

For Stripe-specific issues:
- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Support](https://support.stripe.com/)

For application integration issues:
- Check Supabase Edge Function logs
- Review browser console for errors
- Verify environment variables are set correctly
