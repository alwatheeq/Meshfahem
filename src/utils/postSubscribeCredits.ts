import { supabase } from '../lib/supabase';

export type PostSubscribeCreditVerification = {
  ok: boolean;
  userMessage?: string;
};

/**
 * After checkout (free or Stripe success page): idempotent repair + balance check.
 * Surfaces an error when an active subscription exists but tool credits still read as zero.
 */
export async function verifySubscriptionCreditsAfterCheckout(
  userId: string
): Promise<PostSubscribeCreditVerification> {
  await new Promise((r) => setTimeout(r, 250));

  const { data: ensureData, error: ensureErr } = await supabase.rpc('ensure_subscription_credits', {
    p_user_id: userId,
  });

  if (ensureErr) {
    return { ok: false, userMessage: ensureErr.message };
  }

  const ensure = ensureData as {
    success?: boolean;
    error?: string;
    code?: string;
  } | null;

  if (ensure && ensure.success === false && ensure.code === 'forbidden') {
    return { ok: false, userMessage: ensure.error ?? 'Not allowed' };
  }

  const { data: bal, error: balErr } = await supabase.rpc('get_user_credit_balance', {
    p_user_id: userId,
  });

  if (balErr) {
    return { ok: false, userMessage: balErr.message };
  }

  const b = bal as {
    success?: boolean;
    subscription_expired?: boolean;
    credits_remaining?: number;
  };

  if (b?.success && b.subscription_expired === false && (Number(b.credits_remaining) || 0) <= 0) {
    return {
      ok: false,
      userMessage:
        'Your subscription is active, but we could not confirm your tool credits. Try refreshing the page or contact support if this continues.',
    };
  }

  return { ok: true };
}
