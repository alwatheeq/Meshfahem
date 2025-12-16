import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import { Loader2, AlertCircle } from 'lucide-react';
import { PRICING, formatCurrency, isStripeEnabled, getCheckoutMode } from '../../utils/subscriptionHelpers';
import { ErrorLogger } from '../../utils/errorLogger';

export const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const plan = searchParams.get('plan');
  const promoCode = searchParams.get('promo');

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    if (!plan || !['monthly', 'quarterly', 'biannual', 'trial'].includes(plan)) {
      navigate('/pricing');
      return;
    }

    const timeout = setTimeout(() => {
      if (loading) {
        setError('Request timed out. Please try again or check your connection.');
        setLoading(false);
      }
    }, 30000);

    if (plan === 'trial') {
      activateFreeTrial();
    } else {
      initiateCheckout();
    }

    return () => clearTimeout(timeout);
  }, [user, plan]);

  const activateFreeTrial = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      ErrorLogger.debug('Starting trial activation', { component: 'CheckoutPage', action: 'handleTrialActivation', userId: user.id, userEmail: user.email });
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 1);
      ErrorLogger.debug('Trial end date calculated', { component: 'CheckoutPage', action: 'handleTrialActivation', trialEndDate: endDate.toISOString() });

      // First, check if user already has an active subscription
      const { data: existingSubscriptions, error: checkError } = await supabase
        .from('subscriptions')
        .select('id, subscription_tier, status, end_date')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (checkError) {
        ErrorLogger.warn('Error checking existing subscriptions', { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'checkExisting', checkError });
      } else if (existingSubscriptions && existingSubscriptions.length > 0) {
        ErrorLogger.debug('User already has active subscription(s)', { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'checkExisting', subscriptionCount: existingSubscriptions.length });

        // Cancel existing subscriptions
        const { error: cancelError } = await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('status', 'active');

        if (cancelError) {
          const error = cancelError instanceof Error ? cancelError : new Error(String(cancelError));
          ErrorLogger.error(error, { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'cancelExistingSubscriptions' });
        } else {
          ErrorLogger.info('Successfully canceled existing subscriptions', { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'cancelExisting' });
        }
      }

      // Try using the safe database function first
      ErrorLogger.debug('Attempting to use safe_create_subscription function', { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'createSubscription' });

      const { data: functionData, error: functionError } = await supabase.rpc(
        'safe_create_subscription',
        {
          p_user_id: user.id,
          p_subscription_tier: 'trial_1day',
          p_end_date: endDate.toISOString(),
          p_trial_end_date: endDate.toISOString()
        }
      );

      if (functionError) {
        ErrorLogger.warn('Function method failed, falling back to direct insert', { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'createSubscription', functionError });

        // Fallback to direct insert
        const subscriptionData = {
          user_id: user.id,
          subscription_tier: 'trial_1day',
          status: 'active',
          start_date: new Date().toISOString(),
          end_date: endDate.toISOString(),
          trial_end_date: endDate.toISOString(),
          auto_renew: false,
          payment_method_saved: false
        };

        ErrorLogger.debug('Inserting subscription directly', { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'directInsert', subscriptionTier: subscriptionData.subscription_tier });

        const { data: insertedData, error: insertError } = await supabase
          .from('subscriptions')
          .insert(subscriptionData)
          .select()
          .single();

        if (insertError) {
          const error = insertError instanceof Error ? insertError : new Error(String(insertError));
          ErrorLogger.error(error, { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'directInsert', errorDetails: insertError });

          // Provide more specific error message
          let userFriendlyError = 'Failed to activate trial. ';
          if (insertError.message.includes('policy')) {
            userFriendlyError += 'Permission denied. Please contact support.';
          } else if (insertError.message.includes('unique')) {
            userFriendlyError += 'You may already have a trial subscription.';
          } else {
            userFriendlyError += insertError.message;
          }

          throw new Error(userFriendlyError);
        }

        ErrorLogger.info('Successfully created subscription', { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'directInsert', subscriptionId: insertedData?.id });
      } else {
        ErrorLogger.info('Successfully created subscription via function', { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'createSubscription', subscriptionId: functionData?.id });
      }

      // Wait for credit initialization and verify
      ErrorLogger.debug('Waiting for credit initialization', { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'verifyCredits' });
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify credits were initialized
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('credits_remaining')
        .eq('id', user.id)
        .single();

      if (profileError) {
        const error = profileError instanceof Error ? profileError : new Error(String(profileError));
        ErrorLogger.error(error, { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'verifyCredits' });
      } else if (profile && profile.credits_remaining > 0) {
        ErrorLogger.info('Credits verified', { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'verifyCredits', creditsRemaining: profile.credits_remaining });
      } else {
        ErrorLogger.warn('Credits not initialized, attempting manual initialization', { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'verifyCredits' });

        // Manual fallback - call credit initialization directly
        const { data: initResult, error: initError } = await supabase.rpc(
          'initialize_subscription_credits',
          {
            p_user_id: user.id,
            p_subscription_tier: 'trial_1day'
          }
        );

        if (initError) {
          const error = initError instanceof Error ? initError : new Error(String(initError));
          ErrorLogger.error(error, { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'manualCreditInit' });
        } else {
          ErrorLogger.info('Manual credit init result', { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'manualCreditInit', initResult });
        }
      }

      navigate('/payment/success?trial=true');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'CheckoutPage', action: 'handleTrialActivation', plan });
      const errorMessage = err instanceof Error ? err.message : 'Failed to activate trial. Please contact support.';
      setError(errorMessage);
      setLoading(false);
    }
  };

  const initiateCheckout = async () => {
    if (!user || !plan) return;

    setLoading(true);
    setError(null);

    try {
      const mode = getCheckoutMode();
      ErrorLogger.debug('Starting checkout', { component: 'CheckoutPage', action: 'initiateCheckout', mode, plan });

      if (mode === 'free') {
        // FREE TIER MODE - Directly create subscription without payment processing
        const tierMap: Record<string, 'trial_1day' | 'trial_7day' | 'monthly' | 'quarterly' | 'biannual'> = {
          trial: 'trial_1day',
          monthly: 'monthly',
          quarterly: 'quarterly',
          biannual: 'biannual'
        };

        // Set subscription end date to 1 year from now for all paid tiers
        const endDate = new Date();
        if (plan === 'trial') {
          endDate.setDate(endDate.getDate() + 1);
        } else {
          endDate.setFullYear(endDate.getFullYear() + 1);
        }

        ErrorLogger.debug('Free mode - Using safe subscription creation', { component: 'CheckoutPage', action: 'initiateCheckout', step: 'freeMode', plan });

        // Try using the safe database function first
        const { data: functionData, error: functionError } = await supabase.rpc(
          'safe_create_subscription',
          {
            p_user_id: user.id,
            p_subscription_tier: tierMap[plan],
            p_end_date: endDate.toISOString(),
            p_trial_end_date: plan === 'trial' ? endDate.toISOString() : null
          }
        );

        if (functionError) {
          ErrorLogger.warn('Function method failed, falling back to direct insert', { component: 'CheckoutPage', action: 'initiateCheckout', step: 'createSubscription', functionError });

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
            ErrorLogger.warn('Error canceling existing subscriptions', { component: 'CheckoutPage', action: 'handleTrialActivation', step: 'cancelExisting', updateError });
          }

          const subscriptionData = {
            user_id: user.id,
            subscription_tier: tierMap[plan],
            status: 'active',
            start_date: new Date().toISOString(),
            end_date: endDate.toISOString(),
            trial_end_date: plan === 'trial' ? endDate.toISOString() : null,
            auto_renew: false,
            payment_method_saved: false
          };

          ErrorLogger.debug('Creating subscription', { component: 'CheckoutPage', action: 'initiateCheckout', step: 'directInsert', subscriptionTier: subscriptionData.subscription_tier });

          // Create new subscription
          const { data: insertedData, error: insertError } = await supabase
            .from('subscriptions')
            .insert(subscriptionData)
            .select()
            .single();

          if (insertError) {
            const error = insertError instanceof Error ? insertError : new Error(String(insertError));
            ErrorLogger.error(error, { component: 'CheckoutPage', action: 'handleCheckout', step: 'insertSubscription', errorDetails: insertError });

            // Provide more specific error message
            let userFriendlyError = 'Failed to activate subscription. ';
            if (insertError.message.includes('policy')) {
              userFriendlyError += 'Permission denied. Please contact support.';
            } else {
              userFriendlyError += insertError.message;
            }

          throw new Error(userFriendlyError);
        }

          ErrorLogger.info('Successfully created subscription', { component: 'CheckoutPage', action: 'initiateCheckout', step: 'directInsert', subscriptionId: insertedData?.id });
        } else {
          ErrorLogger.info('Successfully created subscription via function', { component: 'CheckoutPage', action: 'initiateCheckout', step: 'createSubscription', subscriptionId: functionData?.id });
        }

        // NEW: Wait for credit initialization and verify
        ErrorLogger.debug('Waiting for credit initialization', { component: 'CheckoutPage', action: 'initiateCheckout', step: 'verifyCredits' });
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify credits were initialized
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('credits_remaining')
          .eq('id', user.id)
          .single();

        if (profileError) {
          const error = profileError instanceof Error ? profileError : new Error(String(profileError));
          ErrorLogger.error(error, { component: 'CheckoutPage', action: 'handleCheckout', step: 'verifyCredits' });
        } else if (profile && profile.credits_remaining > 0) {
          ErrorLogger.info('Credits verified', { component: 'CheckoutPage', action: 'handleCheckout', step: 'verifyCredits', creditsRemaining: profile.credits_remaining });
        } else {
          ErrorLogger.warn('Credits not initialized, attempting manual initialization', { component: 'CheckoutPage', action: 'handleCheckout', step: 'verifyCredits' });

          // Manual fallback - call credit initialization directly
          const { data: initResult, error: initError } = await supabase.rpc(
            'initialize_subscription_credits',
            {
              p_user_id: user.id,
              p_subscription_tier: tierMap[plan]
            }
          );

          if (initError) {
            const error = initError instanceof Error ? initError : new Error(String(initError));
            ErrorLogger.error(error, { component: 'CheckoutPage', action: 'handleCheckout', step: 'manualCreditInit' });
          } else {
            ErrorLogger.info('Manual credit init result', { component: 'CheckoutPage', action: 'handleCheckout', step: 'manualCreditInit', initResult });
          }
        }

        navigate('/payment/success?free=true');
      } else {
        // STRIPE MODE - Redirect to Stripe checkout
        ErrorLogger.debug('Stripe mode - Creating checkout session', { component: 'CheckoutPage', action: 'handleCheckout', step: 'stripeMode', plan });

        const { data, error: functionError } = await supabase.functions.invoke(
          'create-checkout-session',
          {
            body: {
              plan,
              userId: user.id,
              userEmail: user.email,
              promoCode: promoCode || undefined,
              successUrl: `${window.location.origin}/payment/success`,
              cancelUrl: `${window.location.origin}/payment/cancel`,
            },
          }
        );

        if (functionError) {
          const error = functionError instanceof Error ? functionError : new Error(String(functionError));
          ErrorLogger.error(error, { component: 'CheckoutPage', action: 'handleCheckout', step: 'createCheckoutSession', plan });
          throw functionError;
        }

        if (data?.url) {
          ErrorLogger.info('Redirecting to Stripe checkout', { component: 'CheckoutPage', action: 'initiateCheckout', step: 'stripeRedirect', plan });
          window.location.href = data.url;
        } else {
          const error = new Error('No checkout URL returned');
          ErrorLogger.error(error, { component: 'CheckoutPage', action: 'handleCheckout', step: 'getCheckoutUrl', plan });
          throw error;
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'CheckoutPage', action: 'handleCheckout', plan, mode: getCheckoutMode() });
      const mode = getCheckoutMode();
      const errorMessage = err instanceof Error ? err.message : (mode === 'free' ? 'Failed to activate subscription' : 'Failed to initiate checkout');
      setError(errorMessage);
      setLoading(false);
    }
  };

  const getPlanDetails = () => {
    const planNames: Record<string, string> = {
      trial: '1-Day Free Trial',
      monthly: 'Monthly Plan',
      quarterly: 'Quarterly Plan',
      biannual: 'Biannual Plan',
    };

    const planPrices: Record<string, number> = {
      trial: 0,
      monthly: PRICING.monthly,
      quarterly: PRICING.quarterly,
      biannual: PRICING.biannual,
    };

    return {
      name: planNames[plan || ''] || 'Unknown Plan',
      price: planPrices[plan || ''] || 0,
    };
  };

  const planDetails = getPlanDetails();

  if (error) {
    const mode = getCheckoutMode();
    return (
      <div className={`min-h-screen ${getThemeGradient('bg')} flex items-center justify-center p-6`}>
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
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
                if (plan === 'trial') {
                  activateFreeTrial();
                } else {
                  initiateCheckout();
                }
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
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        <div className="flex items-center justify-center mb-6">
          <Loader2 className="h-12 w-12 text-blue-600 dark:text-blue-400 animate-spin" />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-4">
          {getCheckoutMode() === 'free' ? 'Activating Subscription' : 'Processing Checkout'}
        </h2>

        <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
          {getCheckoutMode() === 'free'
            ? (plan === 'trial'
              ? 'Activating your free trial...'
              : `Activating your ${planDetails.name}...`)
            : 'Redirecting to secure checkout...'
          }
        </p>

        <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-700 dark:text-gray-300">Plan:</span>
            <span className="font-semibold text-gray-900 dark:text-white">{planDetails.name}</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-700 dark:text-gray-300">Price:</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {planDetails.price === 0 ? 'Free' : formatCurrency(planDetails.price)}
            </span>
          </div>
          {plan !== 'trial' && (
            <div className="flex justify-between items-center">
              <span className="text-gray-700 dark:text-gray-300">Trial:</span>
              <span className="font-semibold text-green-600 dark:text-green-400">7 Days Free</span>
            </div>
          )}
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
