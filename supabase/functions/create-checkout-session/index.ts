/// <reference path="../_shared/deno.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.21.0";
import { handleCorsPreflight } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { validateMethod, parseJsonBody, validateRequiredFields } from '../_shared/validation.ts';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2024-04-10",
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return handleCorsPreflight();
  }

  const methodError = validateMethod(req, ['POST']);
  if (methodError) {
    return methodError;
  }

  try {
    const bodyResult = await parseJsonBody<{
      plan: string;
      userId: string;
      userEmail: string;
      promoCode?: string;
      successUrl?: string;
      cancelUrl?: string;
      zegoHours?: number;
      chatBlocks?: number;
      billingMonths?: number;
    }>(req);
    
    if (bodyResult.error) {
      return bodyResult.error;
    }

    const { plan, userId, userEmail, promoCode, successUrl, cancelUrl, zegoHours = 0, chatBlocks = 0, billingMonths: rawBm } = bodyResult.data;

    const missingFields = validateRequiredFields(
      { plan, userId, userEmail },
      ['plan', 'userId', 'userEmail']
    );
    
    if (missingFields) {
      return errorResponse(missingFields, 400);
    }

    // Standard only: 1 / 3 / 6 month base (cents) — base already includes 10 hr Zego + 500k AI chat
    const STANDARD_BASE_CENTS_BY_MONTHS: Record<number, number> = { 1: 349, 3: 999, 6: 1899 };
    const ZEGO_CENTS_PER_EXTRA_HOUR = 10;
    const CHAT_CENTS_PER_EXTRA_BLOCK = 10;
    // Credits included in base price — stored in Stripe metadata so webhook can set correct totals
    const INCLUDED_ZEGO_HOURS = 10;
    const INCLUDED_CHAT_BLOCKS = 5; // 5 × 100k = 500k tokens

    if (plan !== "standard") {
      return errorResponse("Only the Standard plan is available. Please choose Standard from pricing.", 400);
    }

    const bmRaw = Number(rawBm);
    const billingMonths = bmRaw === 3 || bmRaw === 6 ? bmRaw : 1;
    const baseCents = STANDARD_BASE_CENTS_BY_MONTHS[billingMonths] ?? 349;

    // zegoHours / chatBlocks from request are EXTRA amounts on top of what's included
    const extraZego = Math.max(0, Math.min(100, Math.floor(zegoHours)));
    let extraChat = Math.max(0, Math.min(100, Math.floor(chatBlocks)));
    if (extraChat > 0 && extraChat < 5) extraChat = 5;
    const totalCents = baseCents + extraZego * ZEGO_CENTS_PER_EXTRA_HOUR + extraChat * CHAT_CENTS_PER_EXTRA_BLOCK;

    // Total hours/blocks stored = included + extra (used by webhook to set subscription credits)
    const totalZegoHours = INCLUDED_ZEGO_HOURS + extraZego;
    const totalChatBlocks = INCLUDED_CHAT_BLOCKS + extraChat;

    const parts: string[] = [`Standard · every ${billingMonths} mo · incl. ${INCLUDED_ZEGO_HOURS}hr study room · incl. 500k AI chat`];
    if (extraZego > 0) parts.push(`+${extraZego} hr extra study room`);
    if (extraChat > 0) parts.push(`+${extraChat}×100k extra AI chat`);

    const planDetails = {
      amount: totalCents,
      interval: "month" as const,
      trialDays: 0,
      name: billingMonths === 1 ? "Standard Plan" : `Standard Plan (${billingMonths} months)`,
      description: parts.join(" · "),
      billingMonths,
    };

    // Create or retrieve Stripe customer
    let customer: Stripe.Customer;
    const existingCustomers = await stripe.customers.list({
      email: userEmail,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          supabase_user_id: userId,
        },
      });
    }

    // Create checkout session parameters
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customer.id,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${planDetails.name} Subscription`,
              description: planDetails.description,
            },
            unit_amount: planDetails.amount,
            recurring: {
              interval: planDetails.interval as Stripe.Price.Recurring.Interval,
              interval_count: planDetails.billingMonths,
            },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        ...(planDetails.trialDays > 0 ? { trial_period_days: planDetails.trialDays } : {}),
        metadata: {
          supabase_user_id: userId,
          plan_type: plan,
          billing_months: String(planDetails.billingMonths),
          // Total amounts (included + any extra add-ons) — used by webhook to set credit limits
          zego_hours: String(totalZegoHours),
          chat_blocks: String(totalChatBlocks),
        },
      },
      success_url: successUrl || `${req.headers.get("origin")}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.headers.get("origin")}/payment/cancel`,
      metadata: {
        supabase_user_id: userId,
        plan_type: plan,
        billing_months: String(planDetails.billingMonths),
      },
    };

    // Apply promo code if provided
    if (promoCode) {
      try {
        const promotionCodes = await stripe.promotionCodes.list({
          code: promoCode,
          active: true,
          limit: 1,
        });

        if (promotionCodes.data.length > 0) {
          sessionParams.discounts = [{ promotion_code: promotionCodes.data[0].id }];
        }
      } catch (error) {
        console.error("Error applying promo code:", error);
        // Continue without promo code if it fails
      }
    }

    // Create the checkout session
    const session = await stripe.checkout.sessions.create(sessionParams);

    return successResponse({
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
});
