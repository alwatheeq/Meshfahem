import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useI18n } from '../contexts/I18nContext';
import { handleSupabaseError, isOffline } from '../utils/errorHandler';
import { ErrorLogger } from '../utils/errorLogger';

export interface Subscription {
  id: string;
  user_id: string;
  subscription_tier: 'trial_1day' | 'trial_7day' | 'monthly' | 'quarterly' | 'biannual' | 'standard' | 'none';
  status: 'active' | 'canceled' | 'expired' | 'payment_failed';
  start_date: string;
  end_date: string;
  next_billing_date: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  payment_method_saved: boolean;
  auto_renew: boolean;
  canceled_at: string | null;
  trial_end_date: string | null;
  billing_cycle_start: string | null;
  billing_cycle_end: string | null;
  tokens_used_current_cycle: number;
  token_limit: number;
  /** Zego add-on hours per billing cycle (standard tier); 100 credits per hour */
  zego_hours_per_cycle?: number;
  /** AI chat add-on blocks per cycle (1 block = 100k tokens); 100 credits per block */
  chat_blocks_per_cycle?: number;
  created_at: string;
  updated_at: string;
}

const STORAGE_KEY = 'subscription_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const POLLING_INTERVAL = 60 * 1000; // 60 seconds

interface CachedSubscription {
  data: Subscription | null;
  timestamp: number;
  userId: string;
}

export const useSubscription = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const isMountedRef = useRef(true);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Load from cache on mount
  useEffect(() => {
    if (user) {
      ErrorLogger.debug('User detected, loading from cache first', { component: 'useSubscription', action: 'useEffect', userId: user.id });
      loadFromCache();
      retryCountRef.current = 0;
      fetchSubscription();

      // Start polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      pollingIntervalRef.current = setInterval(() => {
        ErrorLogger.debug('Polling subscription status', { component: 'useSubscription', action: 'polling' });
        fetchSubscription();
      }, POLLING_INTERVAL);
    } else {
      ErrorLogger.debug('No user, clearing subscription', { component: 'useSubscription', action: 'useEffect' });
      clearCache();
      setSubscription(null);
      setLoading(false);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [user]);

  const loadFromCache = () => {
    if (!user) return;

    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (!cached) return;

      const parsedCache: CachedSubscription = JSON.parse(cached);

      // Validate cache
      if (
        parsedCache.userId === user.id &&
        Date.now() - parsedCache.timestamp < CACHE_DURATION
      ) {
        ErrorLogger.debug('Loaded from cache', { component: 'useSubscription', action: 'loadFromCache', subscriptionId: parsedCache.data?.id });
        setSubscription(parsedCache.data);
        setLoading(false);
      } else {
        ErrorLogger.debug('Cache expired or invalid, clearing', { component: 'useSubscription', action: 'loadFromCache' });
        clearCache();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'useSubscription', action: 'loadFromCache', userId: user?.id });
      clearCache();
    }
  };

  const saveToCache = (sub: Subscription | null) => {
    if (!user) return;

    try {
      const cache: CachedSubscription = {
        data: sub,
        timestamp: Date.now(),
        userId: user.id
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
      ErrorLogger.debug('Saved to cache', { component: 'useSubscription', action: 'saveToCache', userId: user.id });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'useSubscription', action: 'saveToCache', userId: user.id });
    }
  };

  const clearCache = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      ErrorLogger.debug('Cache cleared', { component: 'useSubscription', action: 'clearCache' });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'useSubscription', action: 'clearCache' });
    }
  };

  const fetchSubscription = useCallback(async () => {
    if (!user) {
      ErrorLogger.debug('Cannot fetch: no user', { component: 'useSubscription', action: 'fetchSubscription' });
      return;
    }

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'useSubscription', action: 'fetchSubscription', userId: user.id });
      // Load from cache if available
      loadFromCache();
      return;
    }

    try {
      setError(null);

      ErrorLogger.debug('Fetching subscription', { component: 'useSubscription', action: 'fetchSubscription', userId: user.id, currentTime: new Date().toISOString() });

      // Fetch active subscription with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const { data, error: fetchError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .gt('end_date', new Date().toISOString())
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle()
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (fetchError) {
        handleSupabaseError(fetchError, { component: 'useSubscription', action: 'fetchSubscription', userId: user.id });
        ErrorLogger.error(fetchError, { component: 'useSubscription', action: 'fetchSubscription', userId: user.id });
        throw fetchError;
      }

      if (data) {
        ErrorLogger.debug('Found active subscription', {
          component: 'useSubscription',
          action: 'fetchSubscription',
          subscriptionId: data.id,
          tier: data.subscription_tier,
          status: data.status,
          endDate: data.end_date,
          daysRemaining: Math.ceil((new Date(data.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        });

        // Check if subscription has actually expired (immediate lockout)
        const endDate = new Date(data.end_date);
        const now = new Date();
        if (endDate.getTime() <= now.getTime()) {
          ErrorLogger.warn('Subscription has expired, treating as null', { component: 'useSubscription', action: 'fetchSubscription', subscriptionId: data.id, endDate: data.end_date });
          if (isMountedRef.current) {
            setSubscription(null);
            saveToCache(null);
          }
          return;
        }
      } else {
        ErrorLogger.debug('No active subscription found for user', { component: 'useSubscription', action: 'fetchSubscription', userId: user.id });

        // Try to fetch ANY subscription to see what exists
        const { data: anySubscription } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (anySubscription) {
          ErrorLogger.debug('Found non-active subscription', {
            component: 'useSubscription',
            action: 'fetchSubscription',
            subscriptionId: anySubscription.id,
            tier: anySubscription.subscription_tier,
            status: anySubscription.status,
            endDate: anySubscription.end_date,
            isExpired: new Date(anySubscription.end_date) <= new Date()
          });
        } else {
          ErrorLogger.debug('No subscriptions found at all for this user', { component: 'useSubscription', action: 'fetchSubscription', userId: user.id });
        }
      }

      if (!isMountedRef.current) return;

      setSubscription(data);
      saveToCache(data);
      setLoading(false);
      retryCountRef.current = 0; // Reset retry count on success
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      handleSupabaseError(error, { component: 'useSubscription', action: 'fetchSubscription', userId: user.id });
      ErrorLogger.error(error, { component: 'useSubscription', action: 'fetchSubscription', userId: user.id });
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch subscription';

      // Retry logic with exponential backoff
      if (retryCountRef.current < maxRetries && err.name !== 'AbortError') {
        retryCountRef.current++;
        const retryDelay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 5000);
        ErrorLogger.debug(`Retry ${retryCountRef.current}/${maxRetries} in ${retryDelay}ms`, { component: 'useSubscription', action: 'fetchSubscription', retryCount: retryCountRef.current, maxRetries, retryDelay });

        setTimeout(() => {
          if (isMountedRef.current && user) {
            fetchSubscription();
          }
        }, retryDelay);
      } else {
        const error = new Error('Max retries reached or aborted');
        ErrorLogger.error(error, { component: 'useSubscription', action: 'fetchSubscription', userId: user?.id, retryCount: retryCountRef.current, maxRetries });
        if (isMountedRef.current) {
          setError(errorMessage);
          setLoading(false);
        }
      }
    }
  }, [user]);

  const hasActiveSubscription = (): boolean => {
    if (user?.role === 'admin') return true;
    if (!subscription) return false;

    // Immediate expiration check with millisecond precision
    const endDate = new Date(subscription.end_date);
    const now = new Date();
    const isActive = subscription.status === 'active' && endDate.getTime() > now.getTime();

    ErrorLogger.debug('hasActiveSubscription check', {
      component: 'useSubscription',
      action: 'hasActiveSubscription',
      status: subscription.status,
      endDate: subscription.end_date,
      now: now.toISOString(),
      millisecondsRemaining: endDate.getTime() - now.getTime(),
      result: isActive
    });

    return isActive;
  };

  const isTrialUser = (): boolean => {
    if (user?.role === 'admin') return false;
    if (!subscription) return false;
    return subscription.subscription_tier === 'trial_7day';
  };

  const isPaidUser = (): boolean => {
    if (user?.role === 'admin') return true;
    if (!subscription) return false;
    return ['monthly', 'quarterly', 'biannual', 'standard'].includes(subscription.subscription_tier);
  };

  const getDaysRemaining = (): number => {
    if (!subscription) return 0;
    const endDate = new Date(subscription.end_date);
    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  const getTrialDaysRemaining = (): number => {
    if (!subscription || !subscription.trial_end_date) return 0;
    const trialEnd = new Date(subscription.trial_end_date);
    const today = new Date();
    const diffTime = trialEnd.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  const getTierDisplayName = (): string => {
    if (!subscription) return t('subscription_tiers.none');

    const tier = subscription.subscription_tier;
    const key = `subscription_tiers.${tier}`;
    const translated = t(key);
    // t() returns the key itself when not found — fall back to the tier string
    return translated === key ? tier : translated;
  };

  const getTierColor = (): string => {
    if (!subscription) return 'gray';

    const tierColors: Record<string, string> = {
      trial_1day: 'gray',
      trial_7day: 'blue',
      monthly: 'green',
      quarterly: 'cyan',
      biannual: 'yellow',
      standard: 'blue',
      none: 'gray'
    };

    return tierColors[subscription.subscription_tier] || 'gray';
  };

  const getTokensUsed = (): number => {
    if (!subscription) return 0;
    return subscription.tokens_used_current_cycle || 0;
  };

  const getTokenLimit = (): number => {
    if (!subscription) return 0;
    return subscription.token_limit || 0;
  };

  const getTokensRemaining = (): number => {
    if (!subscription) return 0;
    return Math.max(0, getTokenLimit() - getTokensUsed());
  };

  const getTokenUsagePercentage = (): number => {
    if (!subscription) return 0;
    const limit = getTokenLimit();
    if (limit === 0) return 0;
    return Math.min(100, Math.round((getTokensUsed() / limit) * 100));
  };

  const getBillingCycleEndDate = (): string | null => {
    if (!subscription) return null;
    return subscription.billing_cycle_end;
  };

  const getDaysRemainingInCycle = (): number => {
    if (!subscription || !subscription.billing_cycle_end) return 0;
    const endDate = new Date(subscription.billing_cycle_end);
    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  const hasExceededTokenLimit = (): boolean => {
    if (!subscription) return false;
    return getTokensUsed() >= getTokenLimit();
  };

  const refresh = useCallback(async () => {
    ErrorLogger.debug('Manual refresh requested', { component: 'useSubscription', action: 'refresh' });
    retryCountRef.current = 0;
    clearCache();
    await fetchSubscription();
  }, [fetchSubscription]);

  return {
    subscription,
    loading,
    error,
    hasActiveSubscription,
    isTrialUser,
    isPaidUser,
    getDaysRemaining,
    getTrialDaysRemaining,
    getTierDisplayName,
    getTierColor,
    getTokensUsed,
    getTokenLimit,
    getTokensRemaining,
    getTokenUsagePercentage,
    getBillingCycleEndDate,
    getDaysRemainingInCycle,
    hasExceededTokenLimit,
    refresh
  };
};
