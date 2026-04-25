import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import { Loader2, AlertCircle } from 'lucide-react';
import {
  PRICING,
  formatCurrency,
  getCheckoutMode,
  normalizeStandardBillingMonths,
} from '../../utils/subscriptionHelpers';
import { ErrorLogger } from '../../utils/errorLogger';
import { verifySubscriptionCreditsAfterCheckout } from '../../utils/postSubscribeCredits';

export const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getThemeGradient } = useTheme();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const plan = searchParams.get('plan');
  const promoCode = searchParams.get('promo');
  const billingMonths = normalizeStandardBillingMonths(
    parseInt(searchParams.get('billing_months') ?? '1', 10) || 1
  );
  const zegoHours = Math.max(0, Math.min(100, parseInt(searchParams.get('zego_hours') ?? '0', 10) || 0));
  const chatBlocks = Math.max(0, Math.min(100, parseInt(searchParams.get('chat_blocks') ?? '0', 10) || 0));

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    if (plan !== 'standard') {
      navigate('/pricing');
      return;
    }

    const timeout = setTimeout(() => {
      if (loading) {
        setError('Request timed out. Please try again or check your connection.');
        setLoading(false);
      }
    }, 30000);

    initiateCheckout();

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run checkout once per URL params
  }, [user, plan, billingMonths, retryCount]);

  const initiateCheckout = async () => {
    if (!user || plan !== 'standard') return;

    setLoading(true);
    setError(null);

    try {
      const mode = getCheckoutMode();
      ErrorLogger.debug('Starting checkout', { 
        component: 'CheckoutPage', 
        action: 'initiateCheckout', 
        metadata: { mode, plan, billingMonths } 
      });

      // Base amounts included in every standard plan (mirroring create-checkout-session)
      const INCLUDED_ZEGO_HOURS = 10;
      const INCLUDED_CHAT_BLOCKS = 5; // 5 × 100k = 500k tokens
      // zegoHours / chatBlocks from URL params are *extra* add-ons on top of the included base
      const totalZegoHours = INCLUDED_ZEGO_HOURS + zegoHours;
      const totalChatBlocks = INCLUDED_CHAT_BLOCKS + chatBlocks;

      const { data: activePriorSubs } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .gt('end_date', new Date().toISOString());
      const hadActiveSubscription = (activePriorSubs?.length ?? 0) > 0;

      if (mode === 'free') {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + billingMonths);
        const billingCycleEnd = new Date(endDate);

        ErrorLogger.debug('Free mode - Using safe subscription creation', { 
          component: 'CheckoutPage', 
          action: 'initiateCheckout', 
          metadata: { step: 'freeMode', plan, totalZegoHours, totalChatBlocks } 
        });

        // Try using the safe database function first
        const rpcParams: Record<string, unknown> = {
          p_user_id: user.id,
          p_subscription_tier: 'standard',
          p_end_date: endDate.toISOString(),
          p_trial_end_date: null,
          p_zego_hours: totalZegoHours,
          p_chat_blocks: totalChatBlocks,
          p_additive: hadActiveSubscription,
        };
        const { data: functionData, error: functionError } = await supabase.rpc(
          'safe_create_subscription',
          rpcParams
        );

        if (functionError) {
          const error = functionError instanceof Error ? functionError : new Error(String(functionError));
          ErrorLogger.warn('Function method failed, falling back to direct insert', { 
            component: 'CheckoutPage', 
            action: 'initiateCheckout', 
            metadata: { step: 'createSubscription', error: error.message } 
          });

          // Fallback: cancel existing subscriptions first
          const { error: updateError } = await supabase
            .from('subscriptions')
            .update({
              status: 'canceled',
              canceled_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .eq('status', 'active');

          if (updateError) {
            const error = updateError instanceof Error ? updateError : new Error(String(updateError));
            ErrorLogger.warn('Error canceling existing subscriptions', { 
              component: 'CheckoutPage', 
              action: 'handleTrialActivation', 
              metadata: { step: 'cancelExisting', error: error.message } 
            });
          }

          const subscriptionData: Record<string, unknown> = {
            user_id: user.id,
            subscription_tier: 'standard',
            status: 'active',
            start_date: new Date().toISOString(),
            end_date: endDate.toISOString(),
            trial_end_date: null,
            auto_renew: false,
            payment_method_saved: false,
            billing_cycle_start: new Date().toISOString(),
            billing_cycle_end: billingCycleEnd.toISOString(),
            token_limit: 520000 + Math.max(0, totalChatBlocks) * 100000,
            tokens_used_current_cycle: 0,
            zego_hours_per_cycle: totalZegoHours,
            chat_blocks_per_cycle: totalChatBlocks,
          };

          ErrorLogger.debug('Creating subscription', { 
            component: 'CheckoutPage', 
            action: 'initiateCheckout', 
            metadata: { step: 'directInsert', subscriptionTier: subscriptionData.subscription_tier } 
          });

          // Create new subscription
          let insertPayload = subscriptionData;
          let { data: insertedData, error: insertError } = await supabase
            .from('subscriptions')
            .insert(insertPayload)
            .select()
            .single();

          if (insertError && (insertError.message.includes('chat_blocks_per_cycle') || insertError.message.includes('schema cache') || insertError.message.includes('zego_hours_per_cycle'))) {
            ErrorLogger.warn('Insert failed (add-on columns may be missing), retrying without add-on columns', {
              component: 'CheckoutPage',
              action: 'handleCheckout',
              metadata: { step: 'insertRetryWithoutAddons' },
            });
            const { zego_hours_per_cycle: _z, chat_blocks_per_cycle: _c, ...minimalData } = subscriptionData as Record<string, unknown>;
            insertPayload = {
              ...minimalData,
              token_limit: 520000,
            };
            const retry = await supabase.from('subscriptions').insert(insertPayload).select().single();
            insertedData = retry.data;
            insertError = retry.error;
          }

          if (insertError) {
            const error = insertError instanceof Error ? insertError : new Error(String(insertError));
            ErrorLogger.error(error, { 
              component: 'CheckoutPage', 
              action: 'handleCheckout', 
              metadata: { step: 'insertSubscription', errorDetails: insertError.message } 
            });

            let userFriendlyError = 'Failed to activate subscription. ';
            if (insertError.message.includes('policy')) {
              userFriendlyError += 'Permission denied. Please contact support.';
            } else {
              userFriendlyError += insertError.message;
            }

            throw new Error(userFriendlyError);
          }

          ErrorLogger.info('Successfully created subscription', { 
            component: 'CheckoutPage', 
            action: 'initiateCheckout', 
            metadata: { step: 'directInsert', subscriptionId: insertedData?.id } 
          });
        } else {
          ErrorLogger.info('Successfully created subscription via function', { 
            component: 'CheckoutPage', 
            action: 'initiateCheckout', 
            metadata: { step: 'createSubscription', subscriptionId: functionData?.id } 
          });
        }

        // Direct insert fallback does not run safe_create_subscription (which force-inits credits)
        if (functionError) {
          ErrorLogger.debug('Applying Standard plan credits after direct insert', {
            component: 'CheckoutPage',
            action: 'initiateCheckout',
            metadata: { step: 'forceCredits' },
          });
          await new Promise((resolve) => setTimeout(resolve, 500));
          const { data: initResult, error: initError } = await supabase.rpc('initialize_subscription_credits', {
            p_user_id: user.id,
            p_subscription_tier: 'standard',
            p_force_refill: true,
            p_additive: hadActiveSubscription,
          });
          if (initError) {
            const err = initError instanceof Error ? initError : new Error(String(initError));
            ErrorLogger.error(err, {
              component: 'CheckoutPage',
              action: 'handleCheckout',
              metadata: { step: 'forceCreditsAfterDirectInsert', initResult },
            });
          } else {
            ErrorLogger.info('Standard plan credits applied', {
              component: 'CheckoutPage',
              action: 'handleCheckout',
              metadata: { step: 'forceCreditsAfterDirectInsert', initResult },
            });
          }
        }

        const creditVerify = await verifySubscriptionCreditsAfterCheckout(user.id);
        if (!creditVerify.ok) {
          throw new Error(creditVerify.userMessage ?? 'Could not confirm credits after subscription.');
        }
        window.dispatchEvent(new CustomEvent('creditUpdated'));
        navigate('/payment/success?free=true');
      } else {
        // STRIPE MODE - Redirect to Stripe checkout
        ErrorLogger.debug('Stripe mode - Creating checkout session', { 
          component: 'CheckoutPage', 
          action: 'handleCheckout', 
          metadata: { step: 'stripeMode', plan } 
        });

        const body: {
          plan: string;
          userId: string;
          userEmail: string;
          promoCode?: string;
          successUrl?: string;
          cancelUrl?: string;
          zegoHours?: number;
          chatBlocks?: number;
          billingMonths?: number;
        } = {
          plan: 'standard',
          userId: user.id,
          userEmail: user.email,
          promoCode: promoCode || undefined,
          successUrl: `${window.location.origin}/payment/success`,
          cancelUrl: `${window.location.origin}/payment/cancel`,
          zegoHours,
          chatBlocks,
          billingMonths,
        };
        const { data, error: functionError } = await supabase.functions.invoke(
          'create-checkout-session',
          { body },
        );

        const stripeFailed = !!functionError || !data?.url;
        if (stripeFailed) {
          ErrorLogger.warn('Stripe checkout unavailable, activating subscription without payment', {
            component: 'CheckoutPage',
            action: 'initiateCheckout',
            metadata: { step: 'stripeFallback', plan, error: functionError?.toString?.() || 'No URL' },
          });
        }

        if (!stripeFailed && data?.url) {
          ErrorLogger.info('Redirecting to Stripe checkout', { 
            component: 'CheckoutPage', 
            action: 'initiateCheckout', 
            metadata: { step: 'stripeRedirect', plan } 
          });
          window.location.href = data.url;
          return;
        }

        if (stripeFailed) {
          const endDateFb = new Date();
          endDateFb.setMonth(endDateFb.getMonth() + billingMonths);
          const rpcParams: Record<string, unknown> = {
            p_user_id: user.id,
            p_subscription_tier: 'standard',
            p_end_date: endDateFb.toISOString(),
            p_trial_end_date: null,
            p_zego_hours: totalZegoHours,
            p_chat_blocks: totalChatBlocks,
            p_additive: hadActiveSubscription,
          };
          const { error: rpcError } = await supabase.rpc('safe_create_subscription', rpcParams);
          if (rpcError) {
            await supabase.from('subscriptions').update({
              status: 'canceled',
              canceled_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('user_id', user.id).eq('status', 'active');
            const subscriptionDataStripe: Record<string, unknown> = {
              user_id: user.id,
              subscription_tier: 'standard',
              status: 'active',
              start_date: new Date().toISOString(),
              end_date: endDateFb.toISOString(),
              trial_end_date: null,
              auto_renew: false,
              payment_method_saved: false,
              billing_cycle_start: new Date().toISOString(),
              billing_cycle_end: endDateFb.toISOString(),
              token_limit: 520000 + Math.max(0, totalChatBlocks) * 100000,
              tokens_used_current_cycle: 0,
              zego_hours_per_cycle: totalZegoHours,
              chat_blocks_per_cycle: totalChatBlocks,
            };
            let { error: insertErrorStripe } = await supabase.from('subscriptions').insert(subscriptionDataStripe).select().single();
            if (insertErrorStripe && (insertErrorStripe.message.includes('chat_blocks_per_cycle') || insertErrorStripe.message.includes('schema cache') || insertErrorStripe.message.includes('zego_hours_per_cycle'))) {
              const { zego_hours_per_cycle: _z2, chat_blocks_per_cycle: _c2, ...minimalStripe } = subscriptionDataStripe;
              const minimalPayload = { ...minimalStripe, token_limit: 520000 };
              const retryStripe = await supabase.from('subscriptions').insert(minimalPayload).select().single();
              insertErrorStripe = retryStripe.error;
            }
            if (insertErrorStripe) throw new Error(insertErrorStripe.message);
          }
          await new Promise((r) => setTimeout(r, 1000));
          await supabase.rpc('initialize_subscription_credits', {
            p_user_id: user.id,
            p_subscription_tier: 'standard',
            p_force_refill: true,
            p_additive: hadActiveSubscription,
          });
          const stripeFbVerify = await verifySubscriptionCreditsAfterCheckout(user.id);
          if (!stripeFbVerify.ok) {
            throw new Error(stripeFbVerify.userMessage ?? 'Could not confirm credits after subscription.');
          }
          window.dispatchEvent(new CustomEvent('creditUpdated'));
          navigate('/payment/success?free=true');
          return;
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { 
        component: 'CheckoutPage', 
        action: 'handleCheckout', 
        metadata: { plan, mode: getCheckoutMode() } 
      });
      const mode = getCheckoutMode();
      const errorMessage = err instanceof Error ? err.message : (mode === 'free' ? 'Failed to activate subscription' : 'Failed to initiate checkout');
      setError(errorMessage);
      setLoading(false);
    }
  };

  const getPlanDetails = () => {
    const planNames: Record<string, string> = {
      monthly: 'Monthly Plan',
      quarterly: 'Quarterly Plan',
      biannual: 'Biannual Plan',
      standard: 'Standard Plan',
    };

    const basePrices: Record<string, number> = {
      monthly: PRICING.monthly,
      quarterly: PRICING.quarterly,
      biannual: PRICING.biannual,
      standard: PRICING.standard,
    };

    const base = basePrices[plan || ''] ?? 0;
    const addons = plan === 'standard'
      ? zegoHours * PRICING.zegoPerHour + chatBlocks * PRICING.chatPer100kTokens
      : 0;
    const price = base + addons;

    return {
      name: planNames[plan || ''] || 'Unknown Plan',
      price,
    };
  };

  const planDetails = getPlanDetails();

  if (error) {
    const mode = getCheckoutMode();
    return (
      <div className={`min-h-screen ${getThemeGradient('bg')} flex items-center justify-center p-6`}>
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-full">
              <AlertCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-4">
            {mode === 'free' ? 'Activation Error' : 'Checkout Error'}
          </h2>

          <p className="text-gray-600 dark:text-gray-400 text-center mb-2">
            {error}
          </p>

          {error.includes('policy') && (
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800 dark:text-blue-300 mb-2">
                <strong>Database Permission Issue Detected</strong>
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-400">
                This is a database configuration issue. The administrator needs to verify Row Level Security policies are correctly set up. You can try again, or contact support for assistance.
              </p>
            </div>
          )}

          {mode === 'stripe' && (
            <div className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-orange-800 dark:text-orange-300 mb-2">
                <strong>Common causes:</strong>
              </p>
              <ul className="text-xs text-orange-700 dark:text-orange-400 space-y-1 list-disc list-inside">
                <li>Stripe API keys not configured</li>
                <li>Network connection issues</li>
                <li>Payment service temporarily unavailable</li>
              </ul>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={() => navigate('/pricing')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200"
            >
              Back to Pricing
            </button>

            <button
              onClick={() => {
                setRetryCount(prev => prev + 1);
                initiateCheckout();
              }}
              className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold py-3 px-6 rounded-lg transition duration-200"
            >
              Try Again {retryCount > 0 && `(${retryCount})`}
            </button>

            <button
              onClick={() => navigate('/')}
              className="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold py-3 px-6 rounded-lg transition duration-200"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${getThemeGradient('bg')} flex items-center justify-center p-6`}>
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8">
        <div className="flex items-center justify-center mb-6">
          <Loader2 className="h-12 w-12 text-blue-600 dark:text-blue-400 animate-spin" />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-4">
          {getCheckoutMode() === 'free' ? 'Activating Subscription' : 'Processing Checkout'}
        </h2>

        <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
          {getCheckoutMode() === 'free'
            ? `Activating your ${planDetails.name}...`
            : 'Redirecting to secure checkout...'}
        </p>

        <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-700 dark:text-gray-300">Plan:</span>
            <span className="font-semibold text-gray-900 dark:text-white">{planDetails.name}</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-700 dark:text-gray-300">Price:</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {formatCurrency(planDetails.price)}
            </span>
          </div>
        </div>

        {getCheckoutMode() === 'free' && (
          <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
            No payment required - All tiers are currently free!
          </p>
        )}
      </div>
    </div>
  );
};
