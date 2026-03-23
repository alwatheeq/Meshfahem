import React, { createContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { handleSupabaseError, isOffline } from '../utils/errorHandler';
import { ErrorLogger } from '../utils/errorLogger';
import { PageName } from '../components/Onboarding/tutorialConfigs';

export interface OnboardingContextType {
  // Dashboard overview
  isDashboardTutorialCompleted: boolean;
  completeDashboardTutorial: () => Promise<void>;
  
  // Page-specific tutorials
  isPageTutorialCompleted: (pageName: PageName) => Promise<boolean>;
  completePageTutorial: (pageName: PageName) => Promise<void>;
  
  // Loading states
  loading: boolean;
  // Cache for synchronous tutorial status checks
  pageTutorialCache: Record<PageName, boolean>;
}

export const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

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
    academics: false,
  });
  // Use ref to store latest cache value for stable callback
  const pageTutorialCacheRef = useRef(pageTutorialCache);
  const [loading, setLoading] = useState(true);
  // Use ref for loading to avoid stale closures in callbacks
  const loadingRef = useRef(loading);
  // Track if initial load has completed at least once
  const initialLoadCompletedRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    pageTutorialCacheRef.current = pageTutorialCache;
  }, [pageTutorialCache]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const loadDashboardTutorialStatus = useCallback(async () => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', {
        component: 'OnboardingContext',
        action: 'loadDashboardTutorialStatus',
        userId: user.id,
      });
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
    }
  }, [user]);

  const loadPageTutorialStatus = useCallback(async () => {
    if (!user) return;

    // Initialize empty cache - this ensures cache is always in a known state
    const emptyCache: Record<PageName, boolean> = {
      dashboard: false,
      library: false,
      quiz: false,
      eduplay: false,
      'study-rooms': false,
      history: false,
      informational: false,
      feedback: false,
      profile: false,
      academics: false,
    };

    if (isOffline()) {
      ErrorLogger.warn('Offline detected, initializing cache to empty state', {
        component: 'OnboardingContext',
        action: 'loadPageTutorialStatus',
        userId: user.id,
      });
      // Initialize cache to empty state when offline (fail-safe: don't show tutorials)
      pageTutorialCacheRef.current = emptyCache;
      setPageTutorialCache(emptyCache);
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
        // Even on error, initialize cache to empty state (fail-safe)
        // This prevents tutorials from showing incorrectly when database query fails
        pageTutorialCacheRef.current = emptyCache;
        setPageTutorialCache(emptyCache);
        ErrorLogger.debug('Cache initialized to empty state due to error', {
          component: 'OnboardingContext',
          action: 'loadPageTutorialStatus',
          userId: user.id,
        });
      } else {
        // Always update cache, even if data is empty (no completed tutorials)
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
          academics: false,
        };

        // If we have data, mark completed pages as true
        if (data && data.length > 0) {
          data.forEach((item) => {
            if (item.page_name in completedPages) {
              completedPages[item.page_name as PageName] = true;
            }
          });
        }

        // Update ref FIRST, then state, to ensure ref is ready when isPageTutorialCompleted is called
        // This prevents race conditions where the ref isn't updated when checked
        pageTutorialCacheRef.current = completedPages;
        setPageTutorialCache(completedPages);
        
        ErrorLogger.debug('Page tutorial cache loaded', {
          component: 'OnboardingContext',
          action: 'loadPageTutorialStatus',
          userId: user.id,
          metadata: {
            completedPages: Object.entries(completedPages).filter(([_, completed]) => completed).map(([page]) => page),
            totalCompleted: Object.values(completedPages).filter(Boolean).length,
          },
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'OnboardingContext',
        action: 'loadPageTutorialStatus',
        userId: user.id,
      });
      // Even on exception, initialize cache to empty state (fail-safe)
      pageTutorialCacheRef.current = emptyCache;
      setPageTutorialCache(emptyCache);
      ErrorLogger.debug('Cache initialized to empty state due to exception', {
        component: 'OnboardingContext',
        action: 'loadPageTutorialStatus',
        userId: user.id,
      });
    }
  }, [user]);

  // Load dashboard + page tutorial status when user changes
  useEffect(() => {
    initialLoadCompletedRef.current = false;

    if (user) {
      Promise.all([loadDashboardTutorialStatus(), loadPageTutorialStatus()]).finally(() => {
        if (pageTutorialCacheRef.current) {
          setLoading(false);
          initialLoadCompletedRef.current = true;
          ErrorLogger.debug('Onboarding context loading completed', {
            component: 'OnboardingContext',
            action: 'initializeOnboarding',
            userId: user.id,
            cacheInitialized: true,
          });
        } else {
          ErrorLogger.warn('Cache not initialized after load, retrying...', {
            component: 'OnboardingContext',
            action: 'initializeOnboarding',
            userId: user.id,
          });
          setTimeout(() => {
            loadPageTutorialStatus().finally(() => {
              if (pageTutorialCacheRef.current) {
                setLoading(false);
                initialLoadCompletedRef.current = true;
              }
            });
          }, 500);
        }
      });
    } else {
      setLoading(false);
    }
  }, [user, loadDashboardTutorialStatus, loadPageTutorialStatus]);

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

    // Check cache first - synchronous check
    // If cache shows completed, return immediately
    if (pageTutorialCacheRef.current[pageName]) {
      ErrorLogger.debug('Tutorial found in cache as completed', {
        component: 'OnboardingContext',
        action: 'isPageTutorialCompleted',
        metadata: { pageName },
      });
      return true;
    }

    // If loading is still in progress, wait for it to complete
    // This is a fallback for any code that might call this function directly
    if (loadingRef.current) {
      ErrorLogger.debug('Context still loading, waiting before checking database', {
        component: 'OnboardingContext',
        action: 'isPageTutorialCompleted',
        metadata: { pageName },
      });
      // Wait for loading to complete - check every 50ms up to 1 second
      let attempts = 0;
      const maxAttempts = 20; // 20 * 50ms = 1 second max wait
      while (loadingRef.current && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 50));
        attempts++;
        // Check cache again after each wait
        if (pageTutorialCacheRef.current[pageName]) {
          ErrorLogger.debug('Tutorial found in cache after wait', {
            component: 'OnboardingContext',
            action: 'isPageTutorialCompleted',
            metadata: { pageName },
          });
          return true;
        }
      }
    }

    // If not in cache and loading is complete, check database as fallback
    if (isOffline()) {
      ErrorLogger.warn('Offline detected', {
        component: 'OnboardingContext',
        action: 'isPageTutorialCompleted',
        userId: user.id,
        metadata: { pageName },
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
          metadata: { pageName },
        });
        ErrorLogger.error(error, {
          component: 'OnboardingContext',
          action: 'isPageTutorialCompleted',
          userId: user.id,
          metadata: { pageName },
        });
        return false;
      }

      const isCompleted = !!data;
      
      ErrorLogger.debug('Tutorial completion status from database', {
        component: 'OnboardingContext',
        action: 'isPageTutorialCompleted',
        metadata: { pageName, isCompleted },
      });
      
      // Update cache and ref synchronously to prevent race conditions
      setPageTutorialCache((prev) => {
        const updated = {
          ...prev,
          [pageName]: isCompleted,
        };
        // Update ref immediately, don't wait for useEffect
        pageTutorialCacheRef.current = updated;
        return updated;
      });

      return isCompleted;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'OnboardingContext',
        action: 'isPageTutorialCompleted',
        userId: user.id,
        metadata: { pageName },
      });
      return false;
    }
    // Note: loading is checked inside the function but not in deps to keep callback stable
     
  }, [user]);

  const completePageTutorial = async (pageName: PageName) => {
    if (!user) return;

    // Update cache and ref synchronously BEFORE async database call to prevent race conditions
    setPageTutorialCache((prev) => {
      const updated = {
        ...prev,
        [pageName]: true,
      };
      // Update ref immediately, don't wait for useEffect
      pageTutorialCacheRef.current = updated;
      return updated;
    });

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', {
        component: 'OnboardingContext',
        action: 'completePageTutorial',
        userId: user.id,
        metadata: { pageName },
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
          metadata: { pageName },
        });
        ErrorLogger.error(error, {
          component: 'OnboardingContext',
          action: 'completePageTutorial',
          userId: user.id,
          metadata: { pageName },
        });
        // Don't revert cache on error - tutorial should stay marked as completed (optimistic update)
        throw error;
      }

      // Verify that the record was actually saved to the database
      const { data: verifyData, error: verifyError } = await supabase
        .from('user_page_tutorials')
        .select('id')
        .eq('user_id', user.id)
        .eq('page_name', pageName)
        .maybeSingle();

      if (verifyError) {
        ErrorLogger.warn('Failed to verify tutorial completion in database', {
          component: 'OnboardingContext',
          action: 'completePageTutorial',
          userId: user.id,
          metadata: { pageName, verifyError: verifyError.message },
        });
      } else if (!verifyData) {
        ErrorLogger.warn('Tutorial completion not found in database after upsert', {
          component: 'OnboardingContext',
          action: 'completePageTutorial',
          userId: user.id,
          metadata: { pageName },
        });
      } else {
        ErrorLogger.debug('Tutorial completion verified in database', {
          component: 'OnboardingContext',
          action: 'completePageTutorial',
          userId: user.id,
          metadata: { pageName, recordId: verifyData.id },
        });
      }

      ErrorLogger.info('Page tutorial completed', {
        component: 'OnboardingContext',
        action: 'completePageTutorial',
        userId: user.id,
        metadata: { 
          pageName,
          cacheUpdated: pageTutorialCacheRef.current[pageName],
          verified: !!verifyData,
        },
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'OnboardingContext',
        action: 'completePageTutorial',
        userId: user.id,
        metadata: { pageName },
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
        pageTutorialCache,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};

