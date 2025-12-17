import { useState, useEffect, useRef } from 'react';
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
  // Track if tutorial was completed locally to prevent re-checking
  const hasCompletedRef = useRef(false);
  // Track if we've already checked for this pageName
  const hasCheckedRef = useRef(false);
  const currentPageNameRef = useRef<PageName>(pageName);

  const config = tutorialConfigs[pageName] || null;

  // Reset refs when pageName changes
  if (currentPageNameRef.current !== pageName) {
    currentPageNameRef.current = pageName;
    hasCompletedRef.current = false;
    hasCheckedRef.current = false;
  }

  // Check if tutorial should be shown on mount (only once per pageName)
  useEffect(() => {
    // Don't check if already completed locally or already checked
    if (hasCompletedRef.current || hasCheckedRef.current) {
      setIsChecking(false);
      return;
    }

    const checkTutorialStatus = async () => {
      hasCheckedRef.current = true;
      setIsChecking(true);
      try {
        const isCompleted = await isPageTutorialCompleted(pageName);
        if (!isCompleted) {
          setShouldShow(true);
        } else {
          // If already completed in database, mark as completed locally too
          hasCompletedRef.current = true;
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
    // Only depend on pageName - isPageTutorialCompleted is stable (wrapped in useCallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageName]);

  const showTutorial = () => {
    setIsTutorialOpen(true);
  };

  const hideTutorial = () => {
    setIsTutorialOpen(false);
  };

  const completeTutorial = async () => {
    // Immediately mark as completed locally to prevent re-checking
    hasCompletedRef.current = true;
    setShouldShow(false);
    hideTutorial();
    
    try {
      await completePageTutorial(pageName);
    } catch (error) {
      ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), {
        component: 'usePageTutorial',
        action: 'completeTutorial',
        pageName,
      });
      // Don't reset hasCompletedRef - tutorial should stay hidden even if save fails
    }
  };

  const skipTutorial = async () => {
    // Immediately mark as completed locally to prevent re-checking
    hasCompletedRef.current = true;
    setShouldShow(false);
    hideTutorial();
    
    try {
      // Mark as completed when skipped
      await completePageTutorial(pageName);
    } catch (error) {
      ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), {
        component: 'usePageTutorial',
        action: 'skipTutorial',
        pageName,
      });
      // Don't reset hasCompletedRef - tutorial should stay hidden even if save fails
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

