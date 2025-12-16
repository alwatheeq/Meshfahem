import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.21.0";
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse, successResponse } from '../_shared/response.ts';
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
    }>(req);
    
    if (bodyResult.error) {
      return bodyResult.error;
    }

    const { plan, userId, userEmail, promoCode, successUrl, cancelUrl } = bodyResult.data;

    const missingFields = validateRequiredFields(
      { plan, userId, userEmail },
      ['plan', 'userId', 'userEmail']
    );
    
    if (missingFields) {
      return errorResponse(missingFields, 400);
    }

    // Define pricing based on plan
    const pricing: Record<string, { amount: number; interval: string; trialDays: number }> = {
      monthly: { amount: 2999, interval: "month", trialDays: 7 },
      quarterly: { amount: 7999, interval: "month", trialDays: 7 },
      biannual: { amount: 14999, interval: "month", trialDays: 7 },
    };

    if (!pricing[plan]) {
      return errorResponse("Invalid plan selected", 400);
    }

    const planDetails = pricing[plan];

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
              name: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Subscription`,
              description: plan === "monthly"
                ? "Unlimited access to all features - billed monthly"
                : plan === "quarterly"
                ? "Unlimited access to all features - billed every 3 months (Save 10%)"
                : "Unlimited access to all features - billed every 6 months (Save 16%)",
            },
            unit_amount: planDetails.amount,
            recurring: {
              interval: planDetails.interval as Stripe.Price.Recurring.Interval,
              interval_count: plan === "quarterly" ? 3 : plan === "biannual" ? 6 : 1,
            },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: planDetails.trialDays,
        metadata: {
          supabase_user_id: userId,
          plan_type: plan,
        },
      },
      success_url: successUrl || `${req.headers.get("origin")}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.headers.get("origin")}/payment/cancel`,
      metadata: {
        supabase_user_id: userId,
        plan_type: plan,
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
