import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { handleSupabaseError, isOffline } from '../utils/errorHandler';
import { ErrorLogger } from '../utils/errorLogger';
import { PageName } from '../components/Onboarding/tutorialConfigs';

interface OnboardingContextType {
  // Dashboard overview
  isDashboardTutorialCompleted: boolean;
  completeDashboardTutorial: () => Promise<void>;
  
  // Page-specific tutorials
  isPageTutorialCompleted: (pageName: PageName) => Promise<boolean>;
  completePageTutorial: (pageName: PageName) => Promise<void>;
  
  // Loading states
  loading: boolean;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export const OnboardingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isDashboardCompleted, setIsDashboardCompleted] = useState(false);
  const [pageTutorialCache, setPageTutorialCache] = useState<Record<PageName, boolean>>({
    dashboard: false,
    library: false,
    quiz: false,
    eduplay: false,
    'study-rooms': false,
    history: false,
    informational: false,
    feedback: false,
    profile: false,
  });
  // Use ref to store latest cache value for stable callback
  const pageTutorialCacheRef = useRef(pageTutorialCache);
  const [loading, setLoading] = useState(true);

  // Keep ref in sync with state
  useEffect(() => {
    pageTutorialCacheRef.current = pageTutorialCache;
  }, [pageTutorialCache]);

  // Load dashboard tutorial status
  useEffect(() => {
    if (user) {
      loadDashboardTutorialStatus();
      loadPageTutorialStatus();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadDashboardTutorialStatus = async () => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', {
        component: 'OnboardingContext',
        action: 'loadDashboardTutorialStatus',
        userId: user.id,
      });
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        handleSupabaseError(error, {
          component: 'OnboardingContext',
          action: 'loadDashboardTutorialStatus',
          userId: user.id,
        });
        ErrorLogger.error(error, {
          component: 'OnboardingContext',
          action: 'loadDashboardTutorialStatus',
          userId: user.id,
        });
        setIsDashboardCompleted(false);
      } else {
        setIsDashboardCompleted(data?.onboarding_completed || false);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, {
        component: 'OnboardingContext',
        action: 'loadDashboardTutorialStatus',
        userId: user.id,
      });
      ErrorLogger.error(err, {
        component: 'OnboardingContext',
        action: 'loadDashboardTutorialStatus',
        userId: user.id,
      });
      setIsDashboardCompleted(false);
    } finally {
      setLoading(false);
    }
  };

  const loadPageTutorialStatus = async () => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', {
        component: 'OnboardingContext',
        action: 'loadPageTutorialStatus',
        userId: user.id,
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_page_tutorials')
        .select('page_name')
        .eq('user_id', user.id);

      if (error) {
        handleSupabaseError(error, {
          component: 'OnboardingContext',
          action: 'loadPageTutorialStatus',
          userId: user.id,
        });
        ErrorLogger.error(error, {
          component: 'OnboardingContext',
          action: 'loadPageTutorialStatus',
          userId: user.id,
        });
      } else if (data) {
        const completedPages: Record<PageName, boolean> = {
          dashboard: false,
          library: false,
          quiz: false,
          eduplay: false,
          'study-rooms': false,
          history: false,
          informational: false,
          feedback: false,
          profile: false,
        };

        data.forEach((item) => {
          if (item.page_name in completedPages) {
            completedPages[item.page_name as PageName] = true;
          }
        });

        setPageTutorialCache(completedPages);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'OnboardingContext',
        action: 'loadPageTutorialStatus',
        userId: user.id,
      });
    }
  };

  const completeDashboardTutorial = async () => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', {
        component: 'OnboardingContext',
        action: 'completeDashboardTutorial',
        userId: user.id,
      });
      setIsDashboardCompleted(true);
      return;
    }

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            onboarding_completed: true,
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) {
        handleSupabaseError(error, {
          component: 'OnboardingContext',
          action: 'completeDashboardTutorial',
          userId: user.id,
        });
        ErrorLogger.error(error, {
          component: 'OnboardingContext',
          action: 'completeDashboardTutorial',
          userId: user.id,
        });
        throw error;
      }

      setIsDashboardCompleted(true);
      ErrorLogger.info('Dashboard tutorial completed', {
        component: 'OnboardingContext',
        action: 'completeDashboardTutorial',
        userId: user.id,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'OnboardingContext',
        action: 'completeDashboardTutorial',
        userId: user.id,
      });
      throw err;
    }
  };

  const isPageTutorialCompleted = useCallback(async (pageName: PageName): Promise<boolean> => {
    if (!user) return false;

    // Check cache first - read from ref for stable callback
    if (pageTutorialCacheRef.current[pageName]) {
      return true;
    }

    // If not in cache, check database
    if (isOffline()) {
      ErrorLogger.warn('Offline detected', {
        component: 'OnboardingContext',
        action: 'isPageTutorialCompleted',
        userId: user.id,
        pageName,
      });
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('user_page_tutorials')
        .select('id')
        .eq('user_id', user.id)
        .eq('page_name', pageName)
        .maybeSingle();

      if (error) {
        handleSupabaseError(error, {
          component: 'OnboardingContext',
          action: 'isPageTutorialCompleted',
          userId: user.id,
          pageName,
        });
        ErrorLogger.error(error, {
          component: 'OnboardingContext',
          action: 'isPageTutorialCompleted',
          userId: user.id,
          pageName,
        });
        return false;
      }

      const isCompleted = !!data;
      
      // Update cache
      setPageTutorialCache((prev) => ({
        ...prev,
        [pageName]: isCompleted,
      }));

      return isCompleted;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'OnboardingContext',
        action: 'isPageTutorialCompleted',
        userId: user.id,
        pageName,
      });
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const completePageTutorial = async (pageName: PageName) => {
    if (!user) return;

    // Update cache synchronously BEFORE async database call to prevent race conditions
    setPageTutorialCache((prev) => ({
      ...prev,
      [pageName]: true,
    }));

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', {
        component: 'OnboardingContext',
        action: 'completePageTutorial',
        userId: user.id,
        pageName,
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('user_page_tutorials')
        .upsert(
          {
            user_id: user.id,
            page_name: pageName,
            completed_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,page_name',
          }
        );

      if (error) {
        handleSupabaseError(error, {
          component: 'OnboardingContext',
          action: 'completePageTutorial',
          userId: user.id,
          pageName,
        });
        ErrorLogger.error(error, {
          component: 'OnboardingContext',
          action: 'completePageTutorial',
          userId: user.id,
          pageName,
        });
        // Don't revert cache on error - tutorial should stay marked as completed
        throw error;
      }

      ErrorLogger.info('Page tutorial completed', {
        component: 'OnboardingContext',
        action: 'completePageTutorial',
        userId: user.id,
        pageName,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'OnboardingContext',
        action: 'completePageTutorial',
        userId: user.id,
        pageName,
      });
      // Don't revert cache on error - tutorial should stay marked as completed
      throw err;
    }
  };

  return (
    <OnboardingContext.Provider
      value={{
        isDashboardTutorialCompleted: isDashboardCompleted,
        completeDashboardTutorial,
        isPageTutorialCompleted,
        completePageTutorial,
        loading,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = (): OnboardingContextType => {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};


