import { useState, useEffect, useCallback } from 'react';
import { useOnboarding } from './useOnboarding';
import { useI18n } from '../contexts/I18nContext';
import {
  pageTutorialShouldShow,
} from '../contexts/OnboardingContext';
import { PageName, tutorialConfigs } from '../components/Onboarding/tutorialConfigs';
import { ErrorLogger } from '../utils/errorLogger';

interface UsePageTutorialReturn {
  shouldShowTutorial: boolean;
  showTutorial: () => void;
  hideTutorial: () => void;
  isTutorialOpen: boolean;
  completeTutorial: () => Promise<void>;
  skipTutorial: () => Promise<void>;
  config: (typeof tutorialConfigs)[PageName] | null;
}

export const usePageTutorial = (pageName: PageName): UsePageTutorialReturn => {
  const {
    completePageTutorial,
    recordPageTutorialSkip,
    loading: onboardingLoading,
    pageTutorialCache,
  } = useOnboarding();

  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  /** After first skip in this page visit, hide until user navigates away (remount). */
  const [suppressAfterFirstSkipSession, setSuppressAfterFirstSkipSession] = useState(false);

  const { getTutorialConfig } = useI18n();
  const localeConfig = getTutorialConfig(pageName);
  const fallbackConfig = tutorialConfigs[pageName] || null;
  const config = localeConfig
    ? { pageName: localeConfig.pageName as PageName, title: localeConfig.title, steps: localeConfig.steps }
    : fallbackConfig;

  const status = pageTutorialCache[pageName];
  const cacheOk =
    !!status && typeof status.completed === 'boolean' && typeof status.skipCount === 'number';

  useEffect(() => {
    if (onboardingLoading) {
      return;
    }
    if (!cacheOk) {
      ErrorLogger.warn('Cache state uncertain, not showing tutorial', {
        component: 'usePageTutorial',
        action: 'checkTutorialStatus',
        metadata: {
          pageName,
          cacheExists: !!pageTutorialCache,
          status,
        },
      });
    }
  }, [pageName, onboardingLoading, pageTutorialCache, cacheOk, status]);

  const shouldShowTutorial =
    !onboardingLoading &&
    cacheOk &&
    pageTutorialShouldShow(status) &&
    !suppressAfterFirstSkipSession;

  const showTutorial = useCallback(() => {
    setIsTutorialOpen(true);
  }, []);

  const hideTutorial = useCallback(() => {
    setIsTutorialOpen(false);
  }, []);

  const completeTutorial = useCallback(async () => {
    setSuppressAfterFirstSkipSession(false);
    hideTutorial();

    try {
      await completePageTutorial(pageName);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'usePageTutorial',
        action: 'completeTutorial',
        metadata: { pageName },
      });
      // Keep the tutorial hidden for this session even if the DB save failed
      setSuppressAfterFirstSkipSession(true);
    }
  }, [completePageTutorial, hideTutorial, pageName]);

  const skipTutorial = useCallback(async () => {
    hideTutorial();

    try {
      const newSkip = await recordPageTutorialSkip(pageName);
      if (newSkip >= 1) {
        setSuppressAfterFirstSkipSession(true);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'usePageTutorial',
        action: 'skipTutorial',
        metadata: { pageName },
      });
      // Keep the tutorial hidden for this session even if the DB save failed
      setSuppressAfterFirstSkipSession(true);
    }
  }, [hideTutorial, recordPageTutorialSkip, pageName]);

  return {
    shouldShowTutorial,
    showTutorial,
    hideTutorial,
    isTutorialOpen,
    completeTutorial,
    skipTutorial,
    config,
  };
};
