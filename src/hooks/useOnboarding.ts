import { useContext } from 'react';
import { OnboardingContext, OnboardingContextType } from '../contexts/OnboardingContext';

export const useOnboarding = (): OnboardingContextType => {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};

