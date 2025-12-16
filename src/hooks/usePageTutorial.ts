import { useState, useEffect } from 'react';
import { useOnboarding } from '../contexts/OnboardingContext';
import { PageName, tutorialConfigs } from '../components/Onboarding/tutorialConfigs';
import { ErrorLogger } from '../utils/errorLogger';

interface UsePageTutorialReturn {
  shouldShowTutorial: boolean;
  showTutorial: () => void;
  hideTutorial: () => void;
  isTutorialOpen: boolean;
  completeTutorial: () => Promise<void>;
  skipTutorial: () => Promise<void>;
  config: typeof tutorialConfigs[PageName] | null;
}

/**
 * Hook for managing page-specific tutorials
 * 
 * Usage:
 * ```tsx
 * const { shouldShowTutorial, showTutorial, isTutorialOpen, completeTutorial, skipTutorial, config } = usePageTutorial('library');
 * 
 * useEffect(() => {
 *   if (shouldShowTutorial) {
 *     showTutorial();
 *   }
 * }, [shouldShowTutorial, showTutorial]);
 * ```
 */
export const usePageTutorial = (pageName: PageName): UsePageTutorialReturn => {
  const { isPageTutorialCompleted, completePageTutorial } = useOnboarding();
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const config = tutorialConfigs[pageName] || null;

  // Check if tutorial should be shown on mount
  useEffect(() => {
    const checkTutorialStatus = async () => {
      setIsChecking(true);
      try {
        const isCompleted = await isPageTutorialCompleted(pageName);
        if (!isCompleted) {
          setShouldShow(true);
        }
      } catch (error) {
        // If error, don't show tutorial to avoid blocking user
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), {
          component: 'usePageTutorial',
          action: 'checkTutorialStatus',
          pageName,
        });
        setShouldShow(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkTutorialStatus();
  }, [pageName, isPageTutorialCompleted]);

  const showTutorial = () => {
    setIsTutorialOpen(true);
  };

  const hideTutorial = () => {
    setIsTutorialOpen(false);
  };

  const completeTutorial = async () => {
    try {
      await completePageTutorial(pageName);
      setShouldShow(false);
      hideTutorial();
    } catch (error) {
      ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), {
        component: 'usePageTutorial',
        action: 'completeTutorial',
        pageName,
      });
      // Still hide tutorial even if save fails
      hideTutorial();
    }
  };

  const skipTutorial = async () => {
    try {
      // Mark as completed when skipped
      await completePageTutorial(pageName);
      setShouldShow(false);
      hideTutorial();
    } catch (error) {
      ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), {
        component: 'usePageTutorial',
        action: 'skipTutorial',
        pageName,
      });
      // Still hide tutorial even if save fails
      hideTutorial();
    }
  };

  return {
    shouldShowTutorial: shouldShow && !isChecking,
    showTutorial,
    hideTutorial,
    isTutorialOpen,
    completeTutorial,
    skipTutorial,
    config,
  };
};

