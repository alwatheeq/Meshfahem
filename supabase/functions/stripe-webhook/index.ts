/// <reference path="../_shared/deno.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.21.0";
import { handleCorsPreflight } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
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

function getTokenLimitForTier(tier: string, chatBlocks: number = 0): number {
  const limits: Record<string, number> = {
    trial_1day: 10000,
    trial_7day: 121000,
    monthly: 520000,
    quarterly: 520000,
    biannual: 520000,
  };
  if (tier === "standard") {
    return 520000 + Math.max(0, chatBlocks) * 100000;
  }
  return limits[tier] ?? 520000;
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
  // Stripe current_period_end reflects interval × interval_count (1/3/6 months)
  let billingCycleEnd: Date;
  if (planType === 'trial_1day' || planType === 'trial_7day') {
    billingCycleEnd = trialEndDate || endDate;
  } else {
    billingCycleEnd = endDate;
  }

  const meta = subscription.metadata || {};
  const zegoHours = Math.max(0, Math.min(100, parseInt(String(meta.zego_hours ?? 0), 10) || 0));
  const chatBlocks = Math.max(0, Math.min(100, parseInt(String(meta.chat_blocks ?? 0), 10) || 0));
  const tokenLimit = getTokenLimitForTier(planType, chatBlocks);

  const { data: priorActiveRows } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("end_date", new Date().toISOString());

  const hadActiveSubscription = (priorActiveRows?.length ?? 0) > 0;

  if (hadActiveSubscription) {
    await supabase
      .from("subscriptions")
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("status", "active");
  }

  const insertPayload: Record<string, unknown> = {
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
    zego_hours_per_cycle: zegoHours,
    chat_blocks_per_cycle: chatBlocks,
  };

  const { error } = await supabase.from("subscriptions").upsert(insertPayload, {
    onConflict: "stripe_subscription_id",
  });

  if (error) {
    console.error("Error upserting subscription:", error);
    return;
  }

  // Idempotent repair: refill only when profile tool credits are still zero (safe on duplicate webhooks)
  console.log(`Ensuring credits for user ${userId}...`);
  const { data: creditResult, error: creditError } = await supabase.rpc(
    "ensure_subscription_credits",
    { p_user_id: userId },
  );

  if (creditError) {
    console.error("Error ensuring subscription credits:", creditError);
  } else {
    console.log("ensure_subscription_credits result:", creditResult);
  }

  await supabase.from("notifications").insert({
    user_id: userId,
    notification_type: "subscription_renewed",
    message:
      planType === "standard"
        ? "Your Standard subscription is now active."
        : `Your ${planType} subscription is now active.`,
    action_url: "/profile/subscription",
  });

  // zegoHours and chatBlocks in metadata are totals (included base + any extras)
  const creditsDesc = planType === "standard"
    ? `1500 tools, 500 chat, ${zegoHours * 60} Zego credits (${zegoHours} hr, 1 cr/min)`
    : "1500 tools, 500 chat, 1000 Zego credits";
  console.log(`Subscription created for user ${userId} with ${tokenLimit} token limit and ${creditsDesc}`);
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
  const updatePayload: Record<string, unknown> = {
    end_date: endDate.toISOString(),
    next_billing_date: endDate.toISOString(),
    status: subscription.status === "active" ? "active" : subscription.status === "canceled" ? "canceled" : "expired",
    payment_method_saved: subscription.default_payment_method ? true : false,
    updated_at: new Date().toISOString(),
  };

  const meta = subscription.metadata || {};
  const zegoHours = Math.max(0, Math.min(100, parseInt(String(meta.zego_hours ?? 0), 10) || 0));
  const chatBlocks = Math.max(0, Math.min(100, parseInt(String(meta.chat_blocks ?? 0), 10) || 0));
  updatePayload.zego_hours_per_cycle = zegoHours;
  updatePayload.chat_blocks_per_cycle = chatBlocks;
  if (existingSubscription.subscription_tier === "standard") {
    updatePayload.token_limit = getTokenLimitForTier("standard", chatBlocks);
  }

  await supabase
    .from("subscriptions")
    .update(updatePayload)
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
  const invoiceId = invoice.id;
  if (!invoiceId) {
    console.warn("handlePaymentSucceeded: missing invoice id");
    return;
  }

  const { data: alreadyProcessed } = await supabase
    .from("transactions")
    .select("id")
    .eq("stripe_invoice_id", invoiceId)
    .maybeSingle();

  if (alreadyProcessed) {
    console.log(`Invoice ${invoiceId} already processed (idempotent skip)`);
    return;
  }

  const subscriptionId = invoice.subscription as string | null;
  if (!subscriptionId) {
    console.log("handlePaymentSucceeded: no subscription on invoice (one-time or draft), skipping");
    return;
  }

  const { data: subscriptionData, error: subErr } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (subErr || !subscriptionData) {
    console.error("Subscription not found for invoice", subErr);
    return;
  }

  const paymentIntentId =
    typeof invoice.payment_intent === "string"
      ? invoice.payment_intent
      : invoice.payment_intent?.id ?? null;

  const { error: txError } = await supabase.from("transactions").insert({
    user_id: subscriptionData.user_id,
    subscription_id: subscriptionData.id,
    stripe_payment_intent_id: paymentIntentId,
    stripe_invoice_id: invoiceId,
    amount: invoice.amount_paid / 100,
    currency: invoice.currency,
    status: "succeeded",
    payment_method: "card",
    transaction_type: "subscription_payment",
    receipt_url: invoice.hosted_invoice_url,
  });

  if (txError) {
    if (String(txError.message || txError).includes("duplicate") || String(txError.code) === "23505") {
      console.log(`Invoice ${invoiceId} duplicate insert (race), skipping`);
      return;
    }
    console.error("Failed to insert transaction for invoice", txError);
    return;
  }

  const periodStart = new Date(invoice.period_start * 1000);
  const periodEnd = new Date(invoice.period_end * 1000);
  const nextBillingDate = periodEnd;

  const updateData: Record<string, unknown> = {
    next_billing_date: nextBillingDate.toISOString(),
    billing_cycle_start: periodStart.toISOString(),
    billing_cycle_end: periodEnd.toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!subscriptionData.billing_cycle_start || !subscriptionData.billing_cycle_end || !subscriptionData.token_limit) {
    console.warn(`Subscription ${subscriptionId} missing billing cycle fields, backfilling token_limit...`);
    const chatBlocksCycle = subscriptionData.chat_blocks_per_cycle ?? 0;
    updateData.token_limit = getTokenLimitForTier(subscriptionData.subscription_tier, chatBlocksCycle);
    updateData.tokens_used_current_cycle = subscriptionData.tokens_used_current_cycle || 0;

    await supabase.from("notifications").insert({
      user_id: "admin",
      notification_type: "admin_notification",
      message: `Billing cycle initialized retroactively for subscription ${subscriptionId}`,
      action_url: "/admin/subscriptions",
    });
  }

  const billingReason = invoice.billing_reason;

  const shouldRefillCredits =
    billingReason === "subscription_cycle" ||
    billingReason === "subscription_update" ||
    billingReason === "subscription_create";

  if (billingReason === "subscription_cycle" || billingReason === "subscription_update") {
    updateData.tokens_used_current_cycle = 0;
  }

  await supabase
    .from("subscriptions")
    .update(updateData)
    .eq("stripe_subscription_id", subscriptionId);

  if (shouldRefillCredits) {
    const { error: creditError } = await supabase.rpc("initialize_subscription_credits", {
      p_user_id: subscriptionData.user_id,
      p_subscription_tier: subscriptionData.subscription_tier,
      p_force_refill: true,
      p_additive: false,
    });
    if (creditError) {
      console.error("Error refilling credits on invoice payment:", creditError);
    } else {
      console.log(`Credits refilled for user ${subscriptionData.user_id} (${billingReason})`);
    }
  }

  if (billingReason === "subscription_cycle" || billingReason === "subscription_update") {
    await supabase.from("notifications").insert({
      user_id: subscriptionData.user_id,
      notification_type: "subscription_renewed",
      message: `Payment of $${(invoice.amount_paid / 100).toFixed(2)} successful. Your subscription has been renewed.`,
      action_url: "/profile/billing",
    });
  }

  await supabase.from("notifications").insert({
    user_id: "admin",
    notification_type: "admin_notification",
    message: `Payment received: $${(invoice.amount_paid / 100).toFixed(2)} from user ${subscriptionData.user_id} (${billingReason ?? "unknown"})`,
    action_url: "/admin/dashboard",
  });

  console.log(`Payment succeeded for subscription ${subscriptionId}, invoice ${invoiceId}`);
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