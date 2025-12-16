import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { supabase } from '../lib/supabase';
import { handleSupabaseError, isOffline } from '../utils/errorHandler';
import { ErrorLogger } from '../utils/errorLogger';

export type FeatureType = 'library' | 'dashboard_processing' | 'quiz' | 'goals_achievements';

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
      'Export to multiple formats'
    ]
  },
  dashboard_processing: {
    title: 'Content Processing',
    benefits: [
      'Process unlimited documents and files',
      'Generate comprehensive summaries',
      'Create custom flashcards',
      'Support for PDFs, Word, PowerPoint and more',
      'Medical mode for specialized content'
    ]
  },
  quiz: {
    title: 'Quiz Generator',
    benefits: [
      'Generate unlimited quizzes from any content',
      'Multiple difficulty levels',
      'Track your quiz performance',
      'Organize quizzes in folders',
      'Multi-language support'
    ]
  },
  goals_achievements: {
    title: 'Goals & Achievements',
    benefits: [
      'Set and track study goals',
      'Earn achievements and badges',
      'View detailed progress analytics',
      'Stay motivated with milestones',
      'Compete on leaderboards'
    ]
  }
};

interface PersistentModalContextType {
  showModal: (feature: FeatureType) => Promise<void>;
  dismissModal: () => Promise<void>;
  isModalOpen: boolean;
  currentFeature: FeatureType | null;
  isDismissed: (feature: FeatureType) => Promise<boolean>;
  resetDismissals: () => Promise<void>;
}

const PersistentModalContext = createContext<PersistentModalContextType | undefined>(undefined);

export const PersistentModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { hasActiveSubscription } = useSubscription();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentFeature, setCurrentFeature] = useState<FeatureType | null>(null);
  const [dismissalCache, setDismissalCache] = useState<Record<FeatureType, boolean>>({
    library: false,
    dashboard_processing: false,
    quiz: false,
    goals_achievements: false
  });

  useEffect(() => {
    if (user) {
      loadDismissalCache();
    }
  }, [user]);

  const loadDismissalCache = async () => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'PersistentModalContext', action: 'loadDismissalCache', userId: user.id });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('subscription_modal_dismissals')
        .select('feature_name')
        .eq('user_id', user.id);

      if (error) {
        handleSupabaseError(error, { component: 'PersistentModalContext', action: 'loadDismissalCache', userId: user.id });
        ErrorLogger.error(error, { component: 'PersistentModalContext', action: 'loadDismissalCache', userId: user.id });
        return;
      }

      const cache: Record<FeatureType, boolean> = {
        library: false,
        dashboard_processing: false,
        quiz: false,
        goals_achievements: false
      };

      data?.forEach((item) => {
        if (item.feature_name in cache) {
          cache[item.feature_name as FeatureType] = true;
        }
      });

      setDismissalCache(cache);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'PersistentModalContext', action: 'loadDismissalCache', userId: user.id });
      ErrorLogger.error(err, { component: 'PersistentModalContext', action: 'loadDismissalCache', userId: user.id });
    }
  };

  const isDismissed = async (feature: FeatureType): Promise<boolean> => {
    if (!user) return false;

    if (dismissalCache[feature]) {
      return true;
    }

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'PersistentModalContext', action: 'isDismissed', userId: user.id, feature });
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('subscription_modal_dismissals')
        .select('id')
        .eq('user_id', user.id)
        .eq('feature_name', feature)
        .maybeSingle();

      if (error) {
        handleSupabaseError(error, { component: 'PersistentModalContext', action: 'isDismissed', userId: user.id, feature });
        ErrorLogger.error(error, { component: 'PersistentModalContext', action: 'isDismissed', userId: user.id, feature });
        return false;
      }

      const dismissed = !!data;

      setDismissalCache(prev => ({
        ...prev,
        [feature]: dismissed
      }));

      return dismissed;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'PersistentModalContext', action: 'isDismissed', userId: user.id, feature });
      ErrorLogger.error(err, { component: 'PersistentModalContext', action: 'isDismissed', userId: user.id, feature });
      return false;
    }
  };

  const showModal = async (feature: FeatureType) => {
    if (!user || hasActiveSubscription()) {
      return;
    }

    const alreadyDismissed = await isDismissed(feature);

    if (!alreadyDismissed) {
      setCurrentFeature(feature);
      setIsModalOpen(true);
    }
  };

  const dismissModal = async () => {
    if (!user || !currentFeature) {
      setIsModalOpen(false);
      setCurrentFeature(null);
      return;
    }

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'PersistentModalContext', action: 'dismissModal', userId: user.id, feature: currentFeature });
      // Update local cache even when offline
      setDismissalCache(prev => ({
        ...prev,
        [currentFeature]: true
      }));
      setIsModalOpen(false);
      setCurrentFeature(null);
      return;
    }

    try {
      const { error } = await supabase
        .from('subscription_modal_dismissals')
        .insert({
          user_id: user.id,
          feature_name: currentFeature
        });

      if (error && !error.message.includes('duplicate')) {
        handleSupabaseError(error, { component: 'PersistentModalContext', action: 'dismissModal', userId: user.id, feature: currentFeature });
        ErrorLogger.error(error, { component: 'PersistentModalContext', action: 'dismissModal', userId: user.id, feature: currentFeature });
        // Still update local state and close modal
      }

      setDismissalCache(prev => ({
        ...prev,
        [currentFeature]: true
      }));

      setIsModalOpen(false);
      setCurrentFeature(null);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'PersistentModalContext', action: 'dismissModal', userId: user.id, feature: currentFeature });
      ErrorLogger.error(err, { component: 'PersistentModalContext', action: 'dismissModal', userId: user.id, feature: currentFeature });
      setIsModalOpen(false);
      setCurrentFeature(null);
    }
  };

  const resetDismissals = async () => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'PersistentModalContext', action: 'resetDismissals', userId: user.id });
      // Reset local cache even when offline
      setDismissalCache({
        library: false,
        dashboard_processing: false,
        quiz: false,
        goals_achievements: false
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('subscription_modal_dismissals')
        .delete()
        .eq('user_id', user.id);

      if (error) {
        handleSupabaseError(error, { component: 'PersistentModalContext', action: 'resetDismissals', userId: user.id });
        ErrorLogger.error(error, { component: 'PersistentModalContext', action: 'resetDismissals', userId: user.id });
        return;
      }

      setDismissalCache({
        library: false,
        dashboard_processing: false,
        quiz: false,
        goals_achievements: false
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'PersistentModalContext', action: 'resetDismissals', userId: user.id });
      ErrorLogger.error(err, { component: 'PersistentModalContext', action: 'resetDismissals', userId: user.id });
    }
  };

  const value: PersistentModalContextType = {
    showModal,
    dismissModal,
    isModalOpen,
    currentFeature,
    isDismissed,
    resetDismissals
  };

  return (
    <PersistentModalContext.Provider value={value}>
      {children}
    </PersistentModalContext.Provider>
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
      benefits: ['Upgrade to access this feature']
    };
  }
  return FEATURE_CONFIGS[feature];
};
