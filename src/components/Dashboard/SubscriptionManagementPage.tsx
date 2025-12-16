import React, { useState } from 'react';
import { useSubscription } from '../../hooks/useSubscription';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import {
  Crown, Calendar, CreditCard, AlertCircle, CheckCircle,
  XCircle, ExternalLink, Clock, Shield, X, BarChart3
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getTierDisplayInfo, getStatusDisplayInfo, formatCurrency, PRICING, formatTokenUsage } from '../../utils/subscriptionHelpers';
import { useToast } from '../Toast/Toast';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';

export const SubscriptionManagementPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { error: showErrorToast, success: showSuccessToast } = useToast();
  const { getThemeGradient } = useTheme();
  const {
    subscription,
    loading,
    hasActiveSubscription,
    isTrialUser,
    isPaidUser,
    getDaysRemaining,
    getTrialDaysRemaining,
    getTierDisplayName,
    getTokensUsed,
    getTokenLimit,
    getTokensRemaining,
    getTokenUsagePercentage,
    getDaysRemainingInCycle,
    refresh
  } = useSubscription();

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleCancelSubscription = async () => {
    if (!subscription || canceling) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    setCanceling(true);
    setCancelError(null);

    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          auto_renew: false,
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', subscription.id);

      if (error) {
        const message = handleSupabaseError(error, { component: 'SubscriptionManagementPage', action: 'handleCancelSubscription', subscriptionId: subscription.id });
        setCancelError(message);
        showErrorToast(message);
        ErrorLogger.error(error, { component: 'SubscriptionManagementPage', action: 'handleCancelSubscription', subscriptionId: subscription.id });
        return;
      }

      const { error: notificationError } = await supabase.from('notifications').insert({
        user_id: user!.id,
        notification_type: 'subscription_canceled',
        message: `Your subscription has been canceled. You'll continue to have access until ${new Date(subscription.end_date).toLocaleDateString()}.`,
        action_url: '/pricing'
      });

      if (notificationError) {
        ErrorLogger.error(notificationError, { component: 'SubscriptionManagementPage', action: 'handleCancelSubscription', step: 'insertNotification' });
      }

      await refresh();
      setShowCancelModal(false);
      showSuccessToast('Subscription canceled successfully');
    } catch (err) {
      const message = handleApiError(err, { component: 'SubscriptionManagementPage', action: 'handleCancelSubscription', subscriptionId: subscription.id });
      setCancelError(message);
      showErrorToast(message);
      ErrorLogger.error(err, { component: 'SubscriptionManagementPage', action: 'handleCancelSubscription', subscriptionId: subscription.id });
    } finally {
      setCanceling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading subscription...</p>
        </div>
      </div>
    );
  }

  if (!subscription || !hasActiveSubscription()) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
          <div className="text-center">
            <div className="bg-gray-100 dark:bg-gray-700 p-6 rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center">
              <Crown className="h-12 w-12 text-gray-400" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              No Active Subscription
            </h2>

            <p className="text-gray-600 dark:text-gray-400 mb-8">
              You don't have an active subscription. Upgrade now to unlock all premium features!
            </p>

            <button
              onClick={() => navigate('/pricing')}
              className={`${getThemeGradient('ui')} hover:opacity-90 text-white font-bold py-3 px-8 rounded-lg transition duration-200`}
            >
              View Plans & Pricing
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tierInfo = getTierDisplayInfo(subscription.subscription_tier);
  const statusInfo = getStatusDisplayInfo(subscription.status);
  const daysRemaining = getDaysRemaining();
  const trialDaysRemaining = subscription.trial_end_date ? getTrialDaysRemaining() : null;
  const tokensUsed = getTokensUsed();
  const tokenLimit = getTokenLimit();
  const tokensRemaining = getTokensRemaining();
  const tokenUsagePercentage = getTokenUsagePercentage();
  const daysRemainingInCycle = getDaysRemainingInCycle();

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Current Subscription Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
        <div className={`${tierInfo.bgColor} p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <Crown className="h-8 w-8 text-white" />
                <h1 className="text-3xl font-bold text-white">{tierInfo.name}</h1>
              </div>
              <p className="text-white opacity-90">{tierInfo.description}</p>
            </div>
            <div className={`${statusInfo.bgColor} px-4 py-2 rounded-lg`}>
              <span className={`${statusInfo.color} font-semibold`}>{statusInfo.name}</span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Trial Status */}
          {trialDaysRemaining !== null && trialDaysRemaining > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 flex items-start space-x-3">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-900 dark:text-blue-100">
                  Trial Period Active
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} remaining in your free trial.
                  You won't be charged until {new Date(subscription.trial_end_date!).toLocaleDateString()}.
                </p>
              </div>
            </div>
          )}

          {/* Payment Failed Warning */}
          {subscription.status === 'payment_failed' && (
            <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900 dark:text-red-100">
                  Payment Failed
                </p>
                <p className="text-sm text-red-700 dark:text-red-300 mb-2">
                  We couldn't process your last payment. Please update your payment method to continue your subscription.
                </p>
                <button className="text-sm font-semibold text-red-600 dark:text-red-400 hover:underline">
                  Update Payment Method →
                </button>
              </div>
            </div>
          )}

          {/* Canceled Subscription Notice */}
          {subscription.status === 'canceled' && (
            <div className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-orange-900 dark:text-orange-100">
                  Subscription Canceled
                </p>
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  Your subscription will remain active until {new Date(subscription.end_date).toLocaleDateString()}.
                  After that, you'll lose access to premium features.
                </p>
              </div>
            </div>
          )}

          {/* Token Usage Card */}
          <div className={`${getThemeGradient('bg')} rounded-lg p-6`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Token Usage</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Current billing cycle</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatTokenUsage(tokensUsed)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  of {formatTokenUsage(tokenLimit)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>{tokenUsagePercentage}% used</span>
                <span>{formatTokenUsage(tokensRemaining)} remaining</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    tokenUsagePercentage > 90
                      ? 'bg-gradient-to-r from-red-500 to-orange-500'
                      : tokenUsagePercentage > 75
                      ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                      : getThemeGradient('ui')
                  }`}
                  style={{ width: `${Math.min(tokenUsagePercentage, 100)}%` }}
                ></div>
              </div>
            </div>

            {subscription.billing_cycle_end && (
              <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Billing cycle resets in:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {daysRemainingInCycle} day{daysRemainingInCycle !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Resets on {new Date(subscription.billing_cycle_end).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>

          {/* Subscription Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">Start Date</span>
                </div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {new Date(subscription.start_date).toLocaleDateString()}
                </p>
              </div>

              <div>
                <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">
                    {subscription.auto_renew ? 'Next Billing Date' : 'Expires On'}
                  </span>
                </div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {subscription.next_billing_date
                    ? new Date(subscription.next_billing_date).toLocaleDateString()
                    : new Date(subscription.end_date).toLocaleDateString()}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  ({daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining)
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
                  <CreditCard className="h-4 w-4" />
                  <span className="text-sm">Payment Method</span>
                </div>
                <div className="flex items-center space-x-2">
                  {subscription.payment_method_saved ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <span className="text-gray-900 dark:text-white">Card on File</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                      <span className="text-gray-900 dark:text-white">No Card Saved</span>
                    </>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
                  <Shield className="h-4 w-4" />
                  <span className="text-sm">Auto-Renewal</span>
                </div>
                <div className="flex items-center space-x-2">
                  {subscription.auto_renew ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <span className="text-gray-900 dark:text-white">Enabled</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      <span className="text-gray-900 dark:text-white">Disabled</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-gray-200 dark:border-gray-700 space-y-3">
            {subscription.auto_renew && isPaidUser() && subscription.status === 'active' && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="w-full bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 font-semibold py-3 px-6 rounded-lg transition duration-200"
              >
                Cancel Subscription
              </button>
            )}

            {!subscription.auto_renew && (
              <button
                onClick={() => navigate('/pricing')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200"
              >
                Reactivate Subscription
              </button>
            )}

            <button
              onClick={() => navigate('/profile/billing')}
              className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold py-3 px-6 rounded-lg transition duration-200"
            >
              View Billing History
            </button>
          </div>
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Cancel Subscription</h3>
              <button
                onClick={() => setShowCancelModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <p className="text-gray-600 dark:text-gray-400">
                Are you sure you want to cancel your subscription? You'll lose access to premium features at the end of your billing period.
              </p>

              <div className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-4">
                <p className="text-sm text-orange-800 dark:text-orange-300 font-semibold mb-2">
                  What happens when you cancel:
                </p>
                <ul className="text-sm text-orange-700 dark:text-orange-400 space-y-1 list-disc list-inside">
                  <li>Access continues until {new Date(subscription.end_date).toLocaleDateString()}</li>
                  <li>No refunds for remaining time</li>
                  <li>Can resubscribe anytime</li>
                  <li>Your data remains saved</li>
                </ul>
              </div>

              {cancelError && (
                <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-3">
                  <p className="text-sm text-red-700 dark:text-red-300">{cancelError}</p>
                </div>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={canceling}
                className="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold py-3 px-6 rounded-lg transition duration-200 disabled:opacity-50"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={canceling}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 disabled:opacity-50 flex items-center justify-center"
              >
                {canceling ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Canceling...
                  </>
                ) : (
                  'Cancel Subscription'
                )}
              </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-500 text-center mt-4">
              Need help? Contact support instead of canceling
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
