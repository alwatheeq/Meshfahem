import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useSubscription } from './useSubscription';
import { handleSupabaseError, isOffline } from '../utils/errorHandler';
import { ErrorLogger } from '../utils/errorLogger';

export type FeatureName = 'summary_generation' | 'flashcard_generation' | 'video_processing' | 'quiz_generation';

export const useFeatureAccess = () => {
  const { user } = useAuth();
  const { subscription, hasActiveSubscription, isTrialUser: _isTrialUser, isPaidUser } = useSubscription();
  const [featureUsage, setFeatureUsage] = useState<Record<FeatureName, number>>({
    summary_generation: 0,
    flashcard_generation: 0,
    video_processing: 0,
    quiz_generation: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchFeatureUsage();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchFeatureUsage = async () => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'useFeatureAccess', action: 'fetchFeatureUsage', userId: user.id });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('feature_usage_tracking')
        .select('feature_name, usage_count')
        .eq('user_id', user.id);

      if (error) {
        handleSupabaseError(error, { component: 'useFeatureAccess', action: 'fetchFeatureUsage', userId: user.id });
        ErrorLogger.error(error, { component: 'useFeatureAccess', action: 'fetchFeatureUsage', userId: user.id });
        throw error;
      }

      const usageMap: Record<FeatureName, number> = {
        summary_generation: 0,
        flashcard_generation: 0,
        video_processing: 0,
        quiz_generation: 0
      };

      data?.forEach((item) => {
        if (item.feature_name in usageMap) {
          usageMap[item.feature_name as FeatureName] += item.usage_count;
        }
      });

      setFeatureUsage(usageMap);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      handleSupabaseError(error, { component: 'useFeatureAccess', action: 'fetchFeatureUsage', userId: user.id });
      ErrorLogger.error(error, { component: 'useFeatureAccess', action: 'fetchFeatureUsage', userId: user.id });
    } finally {
      setLoading(false);
    }
  };

  const canAccessFeature = (_featureName: FeatureName): boolean => {
    if (!user) return false;

    if (user.role === 'admin') return true;

    if (isPaidUser()) {
      return true;
    }

    if (subscription?.subscription_tier === 'trial_7day') {
      return true;
    }

    return false;
  };

  const trackFeatureUsage = async (featureName: FeatureName): Promise<void> => {
    if (!user || !subscription) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'useFeatureAccess', action: 'trackFeatureUsage', userId: user.id, featureName });
      return;
    }

    try {
      const { error } = await supabase
        .from('feature_usage_tracking')
        .insert({
          user_id: user.id,
          feature_name: featureName,
          usage_count: 1,
          subscription_tier_at_use: subscription.subscription_tier
        });

      if (error) {
        handleSupabaseError(error, { component: 'useFeatureAccess', action: 'trackFeatureUsage', userId: user.id, featureName });
        ErrorLogger.error(error, { component: 'useFeatureAccess', action: 'trackFeatureUsage', userId: user.id, featureName });
        throw error;
      }

      await fetchFeatureUsage();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      handleSupabaseError(error, { component: 'useFeatureAccess', action: 'trackFeatureUsage', userId: user.id, featureName });
      ErrorLogger.error(error, { component: 'useFeatureAccess', action: 'trackFeatureUsage', userId: user.id, featureName });
    }
  };

  const getFeatureUsageCount = (featureName: FeatureName): number => {
    return featureUsage[featureName] || 0;
  };

  const hasUsedFeature = (featureName: FeatureName): boolean => {
    return featureUsage[featureName] > 0;
  };

  const getAccessMessage = (featureName: FeatureName): string => {
    if (canAccessFeature(featureName)) {
      return 'You have access to this feature';
    }

    if (!hasActiveSubscription()) {
      return 'Subscribe to access this feature';
    }

    return 'Upgrade your subscription to access this feature';
  };

  return {
    canAccessFeature,
    trackFeatureUsage,
    getFeatureUsageCount,
    hasUsedFeature,
    getAccessMessage,
    featureUsage,
    loading,
    refresh: fetchFeatureUsage
  };
};
