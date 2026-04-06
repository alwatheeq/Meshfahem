import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { supabase } from '../lib/supabase';
import { handleSupabaseError, isOffline } from '../utils/errorHandler';
import { ErrorLogger } from '../utils/errorLogger';
import { useSubscriptionUpsellGate } from './SubscriptionUpsellGateContext';

export type FeatureType =
  | 'library'
  | 'dashboard_processing'
  | 'quiz'
  | 'goals_achievements'
  | 'academics';

/** Session flag: after closing the processing paywall, use inline errors until refresh/subscribe. */
export const SUBSCRIPTION_PROCESSING_PAYWALL_SESSION_KEY =
  'meshfahem_subscription_paywall_processing_snoozed';

const SOFT_PROMPT_COOLDOWN_MS = 30 * 60 * 1000;

interface FeatureConfig {
  title: string;
  benefits: string[];
}

const FEATURE_CONFIGS: Record<FeatureType, FeatureConfig> = {
  library: {
    title: 'My Library',
    benefits: [
      'Save and organize unlimited study materials',
      'Access your library from any device',
      'Share content with study partners',
      'Advanced search and filtering',
      'Export to multiple formats',
    ],
  },
  dashboard_processing: {
    title: 'Content Processing',
    benefits: [
      'Process unlimited documents and files',
      'Generate comprehensive summaries',
      'Create custom flashcards',
      'Support for PDFs, Word, PowerPoint and more',
      'Medical mode for specialized content',
    ],
  },
  quiz: {
    title: 'Quiz Generator',
    benefits: [
      'Generate unlimited quizzes from any content',
      'Multiple difficulty levels',
      'Track your quiz performance',
      'Organize quizzes in folders',
      'Multi-language support',
    ],
  },
  goals_achievements: {
    title: 'Goals & Achievements',
    benefits: [
      'Set and track study goals',
      'Earn achievements and badges',
      'View detailed progress analytics',
      'Stay motivated with milestones',
      'Compete on leaderboards',
    ],
  },
  academics: {
    title: 'Academics',
    benefits: [
      'Create courses and organize study material',
      'Generate summaries, flashcards, and quizzes',
      'Track topic-based performance across courses',
      'View focused analytics per course',
    ],
  },
};

export interface ShowModalOptions {
  /** Bypass 30-minute soft-prompt cooldown (e.g. paywall when starting processing). */
  force?: boolean;
}

interface PersistentModalContextType {
  showModal: (feature: FeatureType, options?: ShowModalOptions) => Promise<void>;
  dismissModal: () => Promise<void>;
  isModalOpen: boolean;
  currentFeature: FeatureType | null;
  /** @deprecated No longer used for gating; kept for any legacy callers. */
  isDismissed: (feature: FeatureType) => Promise<boolean>;
  resetDismissals: () => Promise<void>;
}

const PersistentModalContext = createContext<PersistentModalContextType | undefined>(undefined);

export const PersistentModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { hasActiveSubscription } = useSubscription();
  const { isBusy } = useSubscriptionUpsellGate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentFeature, setCurrentFeature] = useState<FeatureType | null>(null);
  const [promptLastShownAt, setPromptLastShownAt] = useState<string | null>(null);
  const promptLastShownAtRef = useRef<string | null>(null);
  const [upsellEnabled, setUpsellEnabled] = useState(false);

  useEffect(() => {
    promptLastShownAtRef.current = promptLastShownAt;
  }, [promptLastShownAt]);

  useEffect(() => {
    const loadUpsellSetting = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'upsell_modal_enabled')
          .maybeSingle();

        if (!error && data) {
          setUpsellEnabled(data.value === true || data.value === 'true');
        }
      } catch {
        // silently default to disabled
      }
    };

    void loadUpsellSetting();
  }, []);

  const loadPromptTimestamp = useCallback(async () => {
    if (!user || isOffline()) return;

    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('subscription_prompt_last_shown_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        handleSupabaseError(error, {
          component: 'PersistentModalContext',
          action: 'loadPromptTimestamp',
          userId: user.id,
        });
        ErrorLogger.error(error, {
          component: 'PersistentModalContext',
          action: 'loadPromptTimestamp',
          userId: user.id,
        });
        return;
      }

      const ts = data?.subscription_prompt_last_shown_at ?? null;
      setPromptLastShownAt(ts);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, {
        component: 'PersistentModalContext',
        action: 'loadPromptTimestamp',
        userId: user.id,
      });
      ErrorLogger.error(err, {
        component: 'PersistentModalContext',
        action: 'loadPromptTimestamp',
        userId: user.id,
      });
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadPromptTimestamp();
    } else {
      setPromptLastShownAt(null);
    }
  }, [user, loadPromptTimestamp]);

  const withinSoftCooldown = useCallback(() => {
    const ts = promptLastShownAtRef.current;
    if (!ts) return false;
    return Date.now() - new Date(ts).getTime() < SOFT_PROMPT_COOLDOWN_MS;
  }, []);

  const persistPromptTimestamp = useCallback(
    async (iso: string) => {
      if (!user || isOffline()) return;

      const { error } = await supabase.from('user_preferences').upsert(
        {
          user_id: user.id,
          subscription_prompt_last_shown_at: iso,
        },
        { onConflict: 'user_id' }
      );

      if (error) {
        handleSupabaseError(error, {
          component: 'PersistentModalContext',
          action: 'persistPromptTimestamp',
          userId: user.id,
        });
        ErrorLogger.error(error, {
          component: 'PersistentModalContext',
          action: 'persistPromptTimestamp',
          userId: user.id,
        });
      }
    },
    [user]
  );

  const showModal = useCallback(
    async (feature: FeatureType, options?: ShowModalOptions) => {
      if (!upsellEnabled) {
        return;
      }

      if (!user || hasActiveSubscription()) {
        return;
      }

      if (isBusy()) {
        return;
      }

      const force = options?.force === true;
      if (!force && withinSoftCooldown()) {
        return;
      }

      setCurrentFeature(feature);
      setIsModalOpen(true);

      const now = new Date().toISOString();
      setPromptLastShownAt(now);
      promptLastShownAtRef.current = now;
      await persistPromptTimestamp(now);
    },
    [upsellEnabled, user, hasActiveSubscription, isBusy, withinSoftCooldown, persistPromptTimestamp]
  );

  const dismissModal = useCallback(async () => {
    if (typeof sessionStorage !== 'undefined' && currentFeature === 'dashboard_processing') {
      sessionStorage.setItem(SUBSCRIPTION_PROCESSING_PAYWALL_SESSION_KEY, '1');
    }

    setIsModalOpen(false);
    setCurrentFeature(null);
  }, [currentFeature]);

  const isDismissed = useCallback(async (_feature: FeatureType): Promise<boolean> => {
    return false;
  }, []);

  const resetDismissals = useCallback(async () => {
    if (!user) return;

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SUBSCRIPTION_PROCESSING_PAYWALL_SESSION_KEY);
    }

    if (isOffline()) {
      setPromptLastShownAt(null);
      promptLastShownAtRef.current = null;
      return;
    }

    try {
      await supabase.from('subscription_modal_dismissals').delete().eq('user_id', user.id);

      const { error } = await supabase
        .from('user_preferences')
        .update({ subscription_prompt_last_shown_at: null })
        .eq('user_id', user.id);

      if (error) {
        handleSupabaseError(error, {
          component: 'PersistentModalContext',
          action: 'resetDismissals',
          userId: user.id,
        });
        ErrorLogger.error(error, {
          component: 'PersistentModalContext',
          action: 'resetDismissals',
          userId: user.id,
        });
      }

      setPromptLastShownAt(null);
      promptLastShownAtRef.current = null;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, {
        component: 'PersistentModalContext',
        action: 'resetDismissals',
        userId: user.id,
      });
      ErrorLogger.error(err, {
        component: 'PersistentModalContext',
        action: 'resetDismissals',
        userId: user.id,
      });
    }
  }, [user]);

  const value: PersistentModalContextType = {
    showModal,
    dismissModal,
    isModalOpen,
    currentFeature,
    isDismissed,
    resetDismissals,
  };

  return (
    <PersistentModalContext.Provider value={value}>{children}</PersistentModalContext.Provider>
  );
};

export const usePersistentModal = () => {
  const context = useContext(PersistentModalContext);
  if (context === undefined) {
    throw new Error('usePersistentModal must be used within a PersistentModalProvider');
  }
  return context;
};

export const getFeatureConfig = (feature: FeatureType | null): FeatureConfig => {
  if (!feature) {
    return {
      title: 'Premium Feature',
      benefits: ['Upgrade to access this feature'],
    };
  }
  return FEATURE_CONFIGS[feature];
};
