import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.21.0";
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse, successResponse } from '../_shared/response.ts';
import { getSupabaseClient } from '../_shared/auth.ts';
import { validateMethod } from '../_shared/validation.ts';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2024-04-10",
});

const supabase = getSupabaseClient();

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return handleCorsPreflight();
  }

  const methodError = validateMethod(req, ['POST']);
  if (methodError) {
    return methodError;
  }

  try {
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return errorResponse("No signature provided", 400);
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return errorResponse("Webhook signature verification failed", 400);
    }

    console.log(`Processing event: ${event.type}`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCreated(subscription);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return successResponse({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
});

function getTokenLimitForTier(tier: string): number {
  const limits: Record<string, number> = {
    trial_1day: 10000,
    trial_7day: 121000,
    monthly: 520000,
    quarterly: 520000,
    biannual: 520000,
  };
  return limits[tier] || 520000;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.supabase_user_id;
  const planType = session.metadata?.plan_type;

  if (!userId || !planType) {
    console.error("Missing user ID or plan type in session metadata");
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);

  const startDate = new Date(subscription.current_period_start * 1000);
  const endDate = new Date(subscription.current_period_end * 1000);
  const trialEndDate = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

  const billingCycleStart = startDate;
  let billingCycleEnd: Date;

  if (planType === 'trial_1day' || planType === 'trial_7day') {
    billingCycleEnd = trialEndDate || endDate;
  } else {
    billingCycleEnd = new Date(startDate);
    billingCycleEnd.setDate(billingCycleEnd.getDate() + 30);
  }

  const tokenLimit = getTokenLimitForTier(planType);

  const { error } = await supabase.from("subscriptions").insert({
    user_id: userId,
    subscription_tier: planType,
    status: "active",
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    next_billing_date: endDate.toISOString(),
    stripe_subscription_id: subscription.id,
    stripe_customer_id: session.customer as string,
    payment_method_saved: true,
    auto_renew: true,
    trial_end_date: trialEndDate?.toISOString() || null,
    billing_cycle_start: billingCycleStart.toISOString(),
    billing_cycle_end: billingCycleEnd.toISOString(),
    token_limit: tokenLimit,
    tokens_used_current_cycle: 0,
  });

  if (error) {
    console.error("Error creating subscription:", error);
    return;
  }

  // Initialize credits for the user (double-layer protection with trigger)
  console.log(`Initializing credits for user ${userId}...`);
  const { data: creditResult, error: creditError } = await supabase.rpc(
    "initialize_subscription_credits",
    {
      p_user_id: userId,
      p_subscription_tier: planType,
    }
  );

  if (creditError) {
    console.error("Error initializing credits:", creditError);
    // Don't return - trigger should handle this, but log the error
  } else {
    console.log("Credit initialization result:", creditResult);
  }

  await supabase.from("notifications").insert({
    user_id: userId,
    notification_type: "subscription_renewed",
    message: `Welcome! Your ${planType} subscription is now active with a 7-day free trial.`,
    action_url: "/profile/subscription",
  });

  console.log(`Subscription created for user ${userId} with ${tokenLimit} token limit and 2700 credits`);
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log(`Subscription created: ${subscription.id}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const { data: existingSubscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (!existingSubscription) {
    console.error("Subscription not found in database");
    return;
  }

  const endDate = new Date(subscription.current_period_end * 1000);

  await supabase
    .from("subscriptions")
    .update({
      end_date: endDate.toISOString(),
      next_billing_date: endDate.toISOString(),
      status: subscription.status === "active" ? "active" : subscription.status === "canceled" ? "canceled" : "expired",
      payment_method_saved: subscription.default_payment_method ? true : false,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  console.log(`Subscription updated: ${subscription.id}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  const { data: subscriptionData } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (subscriptionData) {
    await supabase.from("notifications").insert({
      user_id: subscriptionData.user_id,
      notification_type: "subscription_canceled",
      message: "Your subscription has been canceled and will expire at the end of the billing period.",
      action_url: "/pricing",
    });
  }

  console.log(`Subscription deleted: ${subscription.id}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;

  const { data: subscriptionData } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!subscriptionData) {
    console.error("Subscription not found for invoice");
    return;
  }

  await supabase.from("transactions").insert({
    user_id: subscriptionData.user_id,
    subscription_id: subscriptionData.id,
    stripe_payment_intent_id: invoice.payment_intent as string,
    amount: invoice.amount_paid / 100,
    currency: invoice.currency,
    status: "succeeded",
    payment_method: "card",
    transaction_type: "subscription_payment",
    receipt_url: invoice.hosted_invoice_url,
  });

  const nextBillingDate = new Date(invoice.period_end * 1000);
  const updateData: any = {
    next_billing_date: nextBillingDate.toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!subscriptionData.billing_cycle_start || !subscriptionData.billing_cycle_end || !subscriptionData.token_limit) {
    console.warn(`Subscription ${subscriptionId} missing billing cycle fields, initializing...`);

    const cycleStart = subscriptionData.start_date ? new Date(subscriptionData.start_date) : new Date();
    const cycleEnd = new Date(cycleStart);
    cycleEnd.setDate(cycleEnd.getDate() + 30);

    updateData.billing_cycle_start = cycleStart.toISOString();
    updateData.billing_cycle_end = cycleEnd.toISOString();
    updateData.token_limit = getTokenLimitForTier(subscriptionData.subscription_tier);
    updateData.tokens_used_current_cycle = subscriptionData.tokens_used_current_cycle || 0;

    await supabase.from("notifications").insert({
      user_id: "admin",
      notification_type: "admin_notification",
      message: `Billing cycle initialized retroactively for subscription ${subscriptionId}`,
      action_url: "/admin/subscriptions",
    });
  }

  await supabase
    .from("subscriptions")
    .update(updateData)
    .eq("stripe_subscription_id", subscriptionId);

  await supabase.from("notifications").insert({
    user_id: subscriptionData.user_id,
    notification_type: "subscription_renewed",
    message: `Payment of $${(invoice.amount_paid / 100).toFixed(2)} successful. Your subscription has been renewed.`,
    action_url: "/profile/billing",
  });

  await supabase.from("notifications").insert({
    user_id: "admin",
    notification_type: "admin_notification",
    message: `Payment received: $${(invoice.amount_paid / 100).toFixed(2)} from user ${subscriptionData.user_id}`,
    action_url: "/admin/dashboard",
  });

  console.log(`Payment succeeded for subscription ${subscriptionId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;

  const { data: subscriptionData } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!subscriptionData) {
    console.error("Subscription not found for failed invoice");
    return;
  }

  await supabase
    .from("subscriptions")
    .update({
      status: "payment_failed",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId);

  await supabase.from("transactions").insert({
    user_id: subscriptionData.user_id,
    subscription_id: subscriptionData.id,
    stripe_payment_intent_id: invoice.payment_intent as string,
    amount: invoice.amount_due / 100,
    currency: invoice.currency,
    status: "failed",
    payment_method: "card",
    transaction_type: "subscription_payment",
  });

  await supabase.from("notifications").insert({
    user_id: subscriptionData.user_id,
    notification_type: "payment_failed",
    message: "Your payment failed. Please update your payment method to continue your subscription.",
    action_url: "/profile/subscription",
  });

  console.log(`Payment failed for subscription ${subscriptionId}`);
}