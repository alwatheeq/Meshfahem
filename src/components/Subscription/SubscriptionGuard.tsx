import React, { ReactNode } from 'react';
import { useSubscription } from '../../hooks/useSubscription';
import { useFeatureAccess, FeatureName } from '../../hooks/useFeatureAccess';
import { useAuth } from '../../hooks/useAuth';
import { Lock, Zap, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SubscriptionGuardProps {
  children: ReactNode;
  feature?: FeatureName;
  fallback?: ReactNode;
  showUpgradePrompt?: boolean;
}

export const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({
  children,
  feature,
  fallback,
  showUpgradePrompt = true
}) => {
  const navigate = useNavigate();
  const { hasActiveSubscription, subscription, getTierDisplayName, getDaysRemaining } = useSubscription();
  const { canAccessFeature, getAccessMessage, hasUsedFeature } = useFeatureAccess();
  const { user } = useAuth();
  const { getThemeGradient } = useTheme();

  if (user?.role === 'admin') {
    return <>{children}</>;
  }

  const hasAccess = feature ? canAccessFeature(feature) : hasActiveSubscription();

  if (hasAccess) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showUpgradePrompt) {
    return null;
  }

  const is1DayTrial = subscription?.subscription_tier === 'trial_1day';
  const hasExpired = subscription && new Date(subscription.end_date) <= new Date();

  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
        <div className="mb-6">
          {is1DayTrial && feature && hasUsedFeature(feature) ? (
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
              <Zap className="h-10 w-10 text-white" />
            </div>
          ) : (
            <div className={`${getThemeGradient('ui')} p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center`}>
              <Crown className="h-10 w-10 text-white" />
            </div>
          )}
        </div>

        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          {hasExpired ? 'Subscription Expired' : is1DayTrial && feature && hasUsedFeature(feature) ? 'Trial Limit Reached' : 'Upgrade Required'}
        </h2>

        <p className="text-gray-600 dark:text-gray-400 mb-2">
          {feature ? getAccessMessage(feature) : 'You need an active subscription to access this feature'}
        </p>

        {is1DayTrial && (
          <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <span className="font-semibold">1-Day Trial:</span> You can use each feature once. Upgrade to get unlimited access!
            </p>
          </div>
        )}

        {hasExpired && (
          <div className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-orange-800 dark:text-orange-300">
              Your {getTierDisplayName()} subscription expired. Renew now to continue using all features.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => navigate('/pricing')}
            className={`w-full ${getThemeGradient('ui')} hover:opacity-90 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 flex items-center justify-center space-x-2`}
          >
            <Crown className="h-5 w-5" />
            <span>{hasExpired ? 'Renew Subscription' : 'View Plans & Pricing'}</span>
          </button>

          {!hasExpired && (
            <button
              onClick={() => window.history.back()}
              className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold py-3 px-6 rounded-lg transition duration-200"
            >
              Go Back
            </button>
          )}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Choose from flexible plans starting with a free trial
          </p>
        </div>
      </div>
    </div>
  );
};
