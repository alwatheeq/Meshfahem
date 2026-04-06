import React, { createContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { handleSupabaseError, isOffline } from '../utils/errorHandler';
import { ErrorLogger } from '../utils/errorLogger';
import { PageName } from '../components/Onboarding/tutorialConfigs';

/** Thrown when marking a page tutorial complete while offline (caller should show offline message). */
export const TUTORIAL_COMPLETE_OFFLINE_CODE = 'TUTORIAL_COMPLETE_OFFLINE';

/** Thrown when recording a skip while offline. */
export const TUTORIAL_SKIP_OFFLINE_CODE = 'TUTORIAL_SKIP_OFFLINE';

export interface PageTutorialStatus {
  completed: boolean;
  skipCount: number;
}

export function pageTutorialShouldShow(status: PageTutorialStatus | undefined): boolean {
  if (!status) return false;
  return !status.completed && status.skipCount < 2;
}

const PAGE_NAMES: PageName[] = [
  'dashboard',
  'library',
  'quiz',
  'eduplay',
  'study-rooms',
  'history',
  'informational',
  'feedback',
  'profile',
  'academics',
];

function makeEmptyPageTutorialCache(): Record<PageName, PageTutorialStatus> {
  const init: Partial<Record<PageName, PageTutorialStatus>> = {};
  for (const p of PAGE_NAMES) {
    init[p] = { completed: false, skipCount: 0 };
  }
  return init as Record<PageName, PageTutorialStatus>;
}

export interface OnboardingContextType {
  isDashboardTutorialCompleted: boolean;
  completeDashboardTutorial: () => Promise<void>;

  isPageTutorialCompleted: (pageName: PageName) => Promise<boolean>;
  completePageTutorial: (pageName: PageName) => Promise<void>;
  recordPageTutorialSkip: (pageName: PageName) => Promise<number>;

  loading: boolean;
  pageTutorialCache: Record<PageName, PageTutorialStatus>;
}

export const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export const OnboardingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isDashboardCompleted, setIsDashboardCompleted] = useState(false);
  const [pageTutorialCache, setPageTutorialCache] = useState<Record<PageName, PageTutorialStatus>>(
    () => makeEmptyPageTutorialCache()
  );
  const pageTutorialCacheRef = useRef(pageTutorialCache);
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(loading);
  const initialLoadCompletedRef = useRef(false);

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

    const emptyCache = makeEmptyPageTutorialCache();

    if (isOffline()) {
      ErrorLogger.warn('Offline detected, initializing cache to empty state', {
        component: 'OnboardingContext',
        action: 'loadPageTutorialStatus',
        userId: user.id,
      });
      pageTutorialCacheRef.current = emptyCache;
      setPageTutorialCache(emptyCache);
      return;
    }

    // Helper to build the cache from rows that may or may not include skip_count
    const buildCache = (rows: Array<{ page_name: string; completed_at: string | null; skip_count?: number | null }>) => {
      const next = makeEmptyPageTutorialCache();
      rows.forEach((item) => {
        const name = item.page_name as PageName;
        if (name in next) {
          const skipCount =
            typeof item.skip_count === 'number' && !Number.isNaN(item.skip_count)
              ? item.skip_count
              : 0;
          next[name] = { completed: !!item.completed_at, skipCount };
        }
      });
      return next;
    };

    try {
      // Primary: include skip_count (requires migration 20260325120000 to be applied)
      const { data, error } = await supabase
        .from('user_page_tutorials')
        .select('page_name, completed_at, skip_count')
        .eq('user_id', user.id);

      if (error) {
        // If skip_count column doesn't exist yet, fall back to selecting without it
        const isMissingColumn =
          error.message?.includes('skip_count') ||
          error.message?.includes('column') ||
          error.message?.includes('schema cache');

        if (isMissingColumn) {
          ErrorLogger.warn('skip_count column missing, falling back to basic select', {
            component: 'OnboardingContext',
            action: 'loadPageTutorialStatus',
            userId: user.id,
            metadata: { errorMsg: error.message },
          });

          const { data: fallbackData, error: fallbackError } = await supabase
            .from('user_page_tutorials')
            .select('page_name, completed_at')
            .eq('user_id', user.id);

          if (fallbackError) {
            ErrorLogger.error(fallbackError, {
              component: 'OnboardingContext',
              action: 'loadPageTutorialStatus',
              userId: user.id,
            });
            pageTutorialCacheRef.current = emptyCache;
            setPageTutorialCache(emptyCache);
          } else {
            const next = buildCache(fallbackData ?? []);
            pageTutorialCacheRef.current = next;
            setPageTutorialCache(next);
            ErrorLogger.debug('Page tutorial cache loaded (fallback, no skip_count)', {
              component: 'OnboardingContext',
              action: 'loadPageTutorialStatus',
              userId: user.id,
              metadata: { rows: fallbackData?.length ?? 0 },
            });
          }
          return;
        }

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
        pageTutorialCacheRef.current = emptyCache;
        setPageTutorialCache(emptyCache);
      } else {
        const next = buildCache(data ?? []);
        pageTutorialCacheRef.current = next;
        setPageTutorialCache(next);
        ErrorLogger.debug('Page tutorial cache loaded', {
          component: 'OnboardingContext',
          action: 'loadPageTutorialStatus',
          userId: user.id,
          metadata: { rows: data?.length ?? 0 },
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'OnboardingContext',
        action: 'loadPageTutorialStatus',
        userId: user.id,
      });
      pageTutorialCacheRef.current = emptyCache;
      setPageTutorialCache(emptyCache);
    }
  }, [user]);

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

    if (pageTutorialCacheRef.current[pageName]?.completed) {
      ErrorLogger.debug('Tutorial found in cache as completed', {
        component: 'OnboardingContext',
        action: 'isPageTutorialCompleted',
        metadata: { pageName },
      });
      return true;
    }

    if (loadingRef.current) {
      ErrorLogger.debug('Context still loading, waiting before checking database', {
        component: 'OnboardingContext',
        action: 'isPageTutorialCompleted',
        metadata: { pageName },
      });
      let attempts = 0;
      const maxAttempts = 20;
      while (loadingRef.current && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        attempts++;
        if (pageTutorialCacheRef.current[pageName]?.completed) {
          ErrorLogger.debug('Tutorial found in cache after wait', {
            component: 'OnboardingContext',
            action: 'isPageTutorialCompleted',
            metadata: { pageName },
          });
          return true;
        }
      }
    }

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
        .select('completed_at, skip_count')
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

      const completed = !!data?.completed_at;
      const skipCount =
        typeof data?.skip_count === 'number' && !Number.isNaN(data.skip_count) ? data.skip_count : 0;

      ErrorLogger.debug('Tutorial completion status from database', {
        component: 'OnboardingContext',
        action: 'isPageTutorialCompleted',
        metadata: { pageName, completed, skipCount },
      });

      setPageTutorialCache((prev) => {
        const updated = {
          ...prev,
          [pageName]: { completed, skipCount },
        };
        pageTutorialCacheRef.current = updated;
        return updated;
      });

      return completed;
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
  }, [user]);

  const completePageTutorial = async (pageName: PageName) => {
    if (!user) return;

    const prior = pageTutorialCacheRef.current[pageName] ?? { completed: false, skipCount: 0 };

    setPageTutorialCache((prev) => {
      const updated = {
        ...prev,
        [pageName]: { completed: true, skipCount: 0 },
      };
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
      setPageTutorialCache((prev) => {
        const updated = { ...prev, [pageName]: prior };
        pageTutorialCacheRef.current = updated;
        return updated;
      });
      throw new Error(TUTORIAL_COMPLETE_OFFLINE_CODE);
    }

    try {
      const upsertPayload: Record<string, unknown> = {
        user_id: user.id,
        page_name: pageName,
        completed_at: new Date().toISOString(),
        skip_count: 0,
      };

      let { error } = await supabase
        .from('user_page_tutorials')
        .upsert(upsertPayload, { onConflict: 'user_id,page_name' });

      // If skip_count column doesn't exist yet, retry without it
      if (error && (error.message?.includes('skip_count') || error.message?.includes('column'))) {
        ErrorLogger.warn('skip_count column missing in completePageTutorial, retrying without it', {
          component: 'OnboardingContext',
          action: 'completePageTutorial',
          userId: user.id,
          metadata: { pageName },
        });
        const { error: fallbackError } = await supabase
          .from('user_page_tutorials')
          .upsert(
            { user_id: user.id, page_name: pageName, completed_at: new Date().toISOString() },
            { onConflict: 'user_id,page_name' }
          );
        error = fallbackError;
      }

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
        throw error;
      }

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
      }

      ErrorLogger.info('Page tutorial completed', {
        component: 'OnboardingContext',
        action: 'completePageTutorial',
        userId: user.id,
        metadata: {
          pageName,
          verified: !!verifyData,
        },
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await loadPageTutorialStatus();
      ErrorLogger.error(err, {
        component: 'OnboardingContext',
        action: 'completePageTutorial',
        userId: user.id,
        metadata: { pageName },
      });
      throw err;
    }
  };


  const recordPageTutorialSkip = async (pageName: PageName): Promise<number> => {
    if (!user) return 0;

    if (isOffline()) {
      throw new Error(TUTORIAL_SKIP_OFFLINE_CODE);
    }

    const { data, error } = await supabase.rpc('increment_user_page_tutorial_skip', {
      p_page_name: pageName,
    });

    let skipCount = 0;

    if (error) {
      // RPC doesn't exist yet (migration not applied) — fall back to a permanent dismiss upsert
      const isRpcMissing =
        error.message?.includes('function') ||
        error.message?.includes('increment_user_page_tutorial_skip') ||
        error.code === '42883' ||
        error.code === 'PGRST202';

      if (isRpcMissing) {
        ErrorLogger.warn('increment_user_page_tutorial_skip RPC missing, falling back to upsert dismiss', {
          component: 'OnboardingContext',
          action: 'recordPageTutorialSkip',
          userId: user.id,
          metadata: { pageName },
        });

        // Permanently dismiss the tutorial so it never shows again
        await supabase
          .from('user_page_tutorials')
          .upsert(
            { user_id: user.id, page_name: pageName, completed_at: new Date().toISOString() },
            { onConflict: 'user_id,page_name' }
          );

        // Return 2 so suppressAfterFirstSkipSession fires in usePageTutorial
        skipCount = 2;
      } else {
        handleSupabaseError(error, {
          component: 'OnboardingContext',
          action: 'recordPageTutorialSkip',
          userId: user.id,
          metadata: { pageName },
        });
        ErrorLogger.error(error, {
          component: 'OnboardingContext',
          action: 'recordPageTutorialSkip',
          userId: user.id,
          metadata: { pageName },
        });
        throw error;
      }
    } else {
      const newSkip = typeof data === 'number' ? data : Number(data);
      skipCount = Number.isFinite(newSkip) ? newSkip : 0;
    }

    setPageTutorialCache((prev) => {
      const prevRow = prev[pageName] ?? { completed: false, skipCount: 0 };
      const updated = {
        ...prev,
        [pageName]: { completed: prevRow.completed || skipCount >= 2, skipCount },
      };
      pageTutorialCacheRef.current = updated;
      return updated;
    });

    return skipCount;
  };

  return (
    <OnboardingContext.Provider
      value={{
        isDashboardTutorialCompleted: isDashboardCompleted,
        completeDashboardTutorial,
        isPageTutorialCompleted,
        completePageTutorial,
        recordPageTutorialSkip,
        loading,
        pageTutorialCache,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};
