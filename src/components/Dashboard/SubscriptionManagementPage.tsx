import React, { useState } from 'react';
import { useSubscription } from '../../hooks/useSubscription';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import {
  Crown, Calendar, CreditCard, AlertCircle, CheckCircle,
  XCircle, Clock, Shield, X, BarChart3, ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getTierDisplayInfo, getStatusDisplayInfo, getToolsCreditsPlanCap } from '../../utils/subscriptionHelpers';
import { useToast } from '../Toast/Toast';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { useTheme } from '../../contexts/ThemeContext';
import { useCredits } from '../../contexts/CreditContext';
import { useI18n } from '../../contexts/I18nContext';

export const SubscriptionManagementPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { error: showErrorToast, success: showSuccessToast } = useToast();
  const {
    getThemeGradient,
    getBackgroundGradient,
    getThemeCardBg,
    getThemeTextPrimary,
    getThemeTextSecondary,
    getThemeCardBorder,
    getThemeSubtle
  } = useTheme();
  const { balance: creditBalance } = useCredits();
  const {
    subscription,
    loading,
    hasActiveSubscription,
    isPaidUser,
    getDaysRemaining,
    getTrialDaysRemaining,
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
        const message = handleSupabaseError(error, {
          component: 'SubscriptionManagementPage',
          action: 'handleCancelSubscription',
          userId: user?.id,
          metadata: { subscriptionId: subscription.id }
        });
        setCancelError(message);
        showErrorToast(message);
        ErrorLogger.error(error, {
          component: 'SubscriptionManagementPage',
          action: 'handleCancelSubscription',
          userId: user?.id,
          metadata: { subscriptionId: subscription.id }
        });
        return;
      }

      const endDateStr = new Date(subscription.end_date).toLocaleDateString();
      const { error: notificationError } = await supabase.from('notifications').insert({
        user_id: user!.id,
        notification_type: 'subscription_canceled',
        message: t('subscription_management.notification_canceled', { date: endDateStr }),
        action_url: '/pricing'
      });

      if (notificationError) {
        ErrorLogger.error(notificationError, {
          component: 'SubscriptionManagementPage',
          action: 'handleCancelSubscription',
          userId: user?.id,
          metadata: { step: 'insertNotification', subscriptionId: subscription.id }
        });
      }

      await refresh();
      setShowCancelModal(false);
      showSuccessToast(t('subscription_management.toast_cancel_success'));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const message = handleApiError(err, {
        component: 'SubscriptionManagementPage',
        action: 'handleCancelSubscription',
        userId: user?.id,
        metadata: { subscriptionId: subscription.id }
      });
      setCancelError(message);
      showErrorToast(message);
      ErrorLogger.error(error, {
        component: 'SubscriptionManagementPage',
        action: 'handleCancelSubscription',
        userId: user?.id,
        metadata: { subscriptionId: subscription.id }
      });
    } finally {
      setCanceling(false);
    }
  };

  const shell = `min-h-screen w-full ${getBackgroundGradient()}`;
  const inner = 'max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8';

  if (loading) {
    return (
      <div className={shell}>
        <div className={`${inner} flex items-center justify-center min-h-[60vh]`}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto dark:border-sky-400" />
            <p className={`mt-4 ${getThemeTextSecondary()}`}>{t('subscription_management.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!subscription || !hasActiveSubscription()) {
    return (
      <div className={shell}>
        <div className={inner}>
          <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} p-8`}>
            <div className="text-center">
              <div className={`${getThemeSubtle('ui')} p-6 rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center`}>
                <Crown className={`h-12 w-12 ${getThemeTextSecondary()}`} />
              </div>

              <h2 className={`text-2xl font-bold ${getThemeTextPrimary()} mb-4`}>
                {t('subscription_management.no_active_title')}
              </h2>

              <p className={`${getThemeTextSecondary()} mb-8`}>
                {t('subscription_management.no_active_desc')}
              </p>

              <button
                type="button"
                onClick={() => navigate('/pricing')}
                className={`${getThemeGradient('ui')} hover:opacity-90 text-white font-bold py-3 px-8 rounded-lg transition duration-200`}
              >
                {t('subscription_management.view_plans')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tierInfo = getTierDisplayInfo(subscription.subscription_tier);
  const statusInfo = getStatusDisplayInfo(subscription.status);
  const daysRemaining = getDaysRemaining();
  const trialDaysRemaining = subscription.trial_end_date ? getTrialDaysRemaining() : null;
  const daysRemainingInCycle = getDaysRemainingInCycle();
  const hasZego = (subscription.zego_hours_per_cycle ?? 0) > 0 || (creditBalance?.zego_credits_total ?? 0) > 0;
  const hasAiAddon = (subscription.chat_blocks_per_cycle ?? 0) > 0 || (subscription.token_limit ?? 0) > 520000;
  const toolCreditsRemaining = creditBalance?.credits_remaining ?? 0;
  const toolPlanCap = getToolsCreditsPlanCap(subscription);
  const toolProgressPct =
    toolPlanCap > 0 ? Math.min(100, (toolCreditsRemaining / toolPlanCap) * 100) : 0;
  const zegoCreditsRemaining = creditBalance?.zego_credits_remaining ?? 0;
  const zegoCreditsTotal = creditBalance?.zego_credits_total ?? 0;
  const aiChatCreditsTotal = hasAiAddon
    ? (subscription.token_limit && subscription.token_limit > 520000
        ? Math.round((subscription.token_limit - 520000) / 1000)
        : (subscription.chat_blocks_per_cycle ?? 0) * 100)
    : 0;
  const aiChatCreditsUsed = hasAiAddon ? Math.round((subscription.tokens_used_current_cycle ?? 0) / 1000) : 0;

  return (
    <div className={shell}>
      <div className={`${inner} space-y-6`}>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className={`flex items-center gap-2 ${getThemeTextSecondary()} hover:opacity-80 transition mb-4`}
      >
        <ArrowLeft className="h-5 w-5" />
        <span>{t('subscription_management.go_back')}</span>
      </button>
      {/* Current Subscription Card */}
      <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} overflow-hidden`}>
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
                  {t('subscription_management.trial_title')}
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {t('subscription_management.trial_desc', {
                    count: trialDaysRemaining,
                    date: new Date(subscription.trial_end_date!).toLocaleDateString()
                  })}
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
                  {t('subscription_management.payment_failed_title')}
                </p>
                <p className="text-sm text-red-700 dark:text-red-300 mb-2">
                  {t('subscription_management.payment_failed_desc')}
                </p>
                <button type="button" className="text-sm font-semibold text-red-600 dark:text-red-400 hover:underline">
                  {t('subscription_management.update_payment')} →
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
                  {t('subscription_management.canceled_banner_title')}
                </p>
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  {t('subscription_management.canceled_banner_desc', {
                    date: new Date(subscription.end_date).toLocaleDateString()
                  })}
                </p>
              </div>
            </div>
          )}

          {/* Credits (tools / study room / AI) */}
          <>
              {/* Tools & Services */}
              <div className={`${getThemeGradient('bg')} rounded-lg p-6`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    <div>
                      <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>{t('subscription_management.tools_services')}</h3>
                      <p className={`text-sm ${getThemeTextSecondary()}`}>{t('subscription_management.current_billing_cycle')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${getThemeTextPrimary()}`}>{toolCreditsRemaining.toLocaleString()}</p>
                    <p className={`text-sm ${getThemeTextSecondary()}`}>
                      / {toolPlanCap.toLocaleString()} {t('subscription_management.credits_plan_cap_suffix')}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className={`text-sm ${getThemeTextSecondary()}`}>
                    {t('subscription_management.credits_remaining', { n: toolCreditsRemaining })}
                  </p>
                  <div className={`w-full ${getThemeSubtle('ui')} rounded-full h-3`}>
                    <div
                      className={`h-3 rounded-full transition-colors duration-150 ${getThemeGradient('ui')}`}
                      style={{ width: `${toolProgressPct}%` }}
                    />
                  </div>
                </div>
              </div>
              {hasZego && (
                <div className={`${getThemeGradient('bg')} rounded-lg p-6`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      <div>
                        <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>{t('subscription_management.study_room')}</h3>
                        <p className={`text-sm ${getThemeTextSecondary()}`}>{t('subscription_management.zego_subtitle')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${getThemeTextPrimary()}`}>{zegoCreditsRemaining}</p>
                      <p className={`text-sm ${getThemeTextSecondary()}`}>{t('subscription_management.of_credits', { total: zegoCreditsTotal })}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className={`flex justify-between text-sm ${getThemeTextSecondary()}`}>
                      <span>{t('subscription_management.percent_used', { pct: zegoCreditsTotal > 0 ? Math.round(((zegoCreditsTotal - zegoCreditsRemaining) / zegoCreditsTotal) * 100) : 0 })}</span>
                      <span>{t('subscription_management.credits_remaining', { n: zegoCreditsRemaining })}</span>
                    </div>
                    <div className={`w-full ${getThemeSubtle('ui')} rounded-full h-3`}>
                      <div
                        className={`h-3 rounded-full ${getThemeGradient('ui')}`}
                        style={{ width: `${zegoCreditsTotal > 0 ? Math.min(100, ((zegoCreditsTotal - zegoCreditsRemaining) / zegoCreditsTotal) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
              {hasAiAddon && (
                <div className={`${getThemeGradient('bg')} rounded-lg p-6`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      <div>
                        <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>{t('subscription_management.ai_chat')}</h3>
                        <p className={`text-sm ${getThemeTextSecondary()}`}>{t('subscription_management.ai_chat_subtitle')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${getThemeTextPrimary()}`}>{aiChatCreditsUsed}</p>
                      <p className={`text-sm ${getThemeTextSecondary()}`}>{t('subscription_management.of_credits', { total: aiChatCreditsTotal })}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className={`flex justify-between text-sm ${getThemeTextSecondary()}`}>
                      <span>{t('subscription_management.percent_used', { pct: aiChatCreditsTotal > 0 ? Math.round((aiChatCreditsUsed / aiChatCreditsTotal) * 100) : 0 })}</span>
                      <span>{t('subscription_management.credits_remaining', { n: Math.max(0, aiChatCreditsTotal - aiChatCreditsUsed) })}</span>
                    </div>
                    <div className={`w-full ${getThemeSubtle('ui')} rounded-full h-3`}>
                      <div
                        className={`h-3 rounded-full ${getThemeGradient('ui')}`}
                        style={{ width: `${aiChatCreditsTotal > 0 ? Math.min(100, (aiChatCreditsUsed / aiChatCreditsTotal) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>

          {subscription.billing_cycle_end && (
            <div className={`${getThemeGradient('bg')} rounded-lg p-4 border-t ${getThemeCardBorder()}`}>
              <div className="flex items-center justify-between text-sm">
                <span className={getThemeTextSecondary()}>{t('subscription_management.billing_resets_in')}</span>
                <span className={`font-semibold ${getThemeTextPrimary()}`}>
                  {t('subscription_management.days_left', { count: daysRemainingInCycle })}
                </span>
              </div>
              <p className={`text-xs ${getThemeTextSecondary()} mt-1`}>
                {t('subscription_management.resets_on', { date: new Date(subscription.billing_cycle_end).toLocaleDateString() })}
              </p>
            </div>
          )}

          {/* Subscription Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <div className={`flex items-center space-x-2 ${getThemeTextSecondary()} mb-1`}>
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">{t('subscription_management.start_date')}</span>
                </div>
                <p className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
                  {new Date(subscription.start_date).toLocaleDateString()}
                </p>
              </div>

              <div>
                <div className={`flex items-center space-x-2 ${getThemeTextSecondary()} mb-1`}>
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">
                    {subscription.auto_renew ? t('subscription_management.next_billing') : t('subscription_management.expires_on')}
                  </span>
                </div>
                <p className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
                  {subscription.next_billing_date
                    ? new Date(subscription.next_billing_date).toLocaleDateString()
                    : new Date(subscription.end_date).toLocaleDateString()}
                </p>
                <p className={`text-sm ${getThemeTextSecondary()}`}>
                  {t('subscription_management.paren_days_left', { count: daysRemaining })}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className={`flex items-center space-x-2 ${getThemeTextSecondary()} mb-1`}>
                  <CreditCard className="h-4 w-4" />
                  <span className="text-sm">{t('subscription_management.payment_method')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  {subscription.payment_method_saved ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <span className={getThemeTextPrimary()}>{t('subscription_management.card_on_file')}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                      <span className={getThemeTextPrimary()}>{t('subscription_management.no_card_saved')}</span>
                    </>
                  )}
                </div>
              </div>

              <div>
                <div className={`flex items-center space-x-2 ${getThemeTextSecondary()} mb-1`}>
                  <Shield className="h-4 w-4" />
                  <span className="text-sm">{t('subscription_management.auto_renewal')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  {subscription.auto_renew ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <span className={getThemeTextPrimary()}>{t('subscription_management.enabled')}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      <span className={getThemeTextPrimary()}>{t('subscription_management.disabled')}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className={`pt-6 border-t ${getThemeCardBorder()} space-y-3`}>
            {subscription.auto_renew && isPaidUser() && subscription.status === 'active' && (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="w-full bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 font-semibold py-3 px-6 rounded-lg transition duration-200"
              >
                {t('subscription_management.cancel_subscription')}
              </button>
            )}

            {!subscription.auto_renew && (
              <button
                type="button"
                onClick={() => navigate('/pricing')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200"
              >
                {t('subscription_management.reactivate')}
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate('/profile/billing')}
              className={`w-full ${getThemeSubtle('ui')} hover:opacity-90 ${getThemeTextPrimary()} font-semibold py-3 px-6 rounded-lg transition duration-200`}
            >
              {t('subscription_management.view_billing_history')}
            </button>
          </div>
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${getThemeCardBg()} rounded-lg shadow-lg ${getThemeCardBorder()} max-w-md w-full p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${getThemeTextPrimary()}`}>{t('subscription_management.cancel_modal_title')}</h3>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className={`p-2 ${getThemeSubtle('ui')} hover:opacity-80 rounded-lg transition`}
              >
                <X className={`h-5 w-5 ${getThemeTextSecondary()}`} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <p className={getThemeTextSecondary()}>
                {t('subscription_management.cancel_modal_body')}
              </p>

              <div className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-4">
                <p className="text-sm text-orange-800 dark:text-orange-300 font-semibold mb-2">
                  {t('subscription_management.cancel_what_happens')}
                </p>
                <ul className="text-sm text-orange-700 dark:text-orange-400 space-y-1 list-disc list-inside">
                  <li>{t('subscription_management.cancel_bullet_access', { date: new Date(subscription.end_date).toLocaleDateString() })}</li>
                  <li>{t('subscription_management.cancel_bullet_no_refund')}</li>
                  <li>{t('subscription_management.cancel_bullet_resubscribe')}</li>
                  <li>{t('subscription_management.cancel_bullet_data')}</li>
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
                type="button"
                onClick={() => setShowCancelModal(false)}
                disabled={canceling}
                className={`flex-1 ${getThemeSubtle('ui')} hover:opacity-90 ${getThemeTextPrimary()} font-semibold py-3 px-6 rounded-lg transition duration-200 disabled:opacity-50`}
              >
                {t('subscription_management.keep_subscription')}
              </button>
              <button
                type="button"
                onClick={handleCancelSubscription}
                disabled={canceling}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 disabled:opacity-50 flex items-center justify-center"
              >
                {canceling ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {t('subscription_management.canceling')}
                  </>
                ) : (
                  t('subscription_management.cancel_subscription')
                )}
              </button>
            </div>

            <p className={`text-xs ${getThemeTextSecondary()} text-center mt-4`}>
              {t('subscription_management.cancel_footer')}
            </p>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
