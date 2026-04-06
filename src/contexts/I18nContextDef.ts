import { createContext, useContext } from 'react';

export interface TutorialConfigFromLocale {
  pageName: string;
  title: string;
  steps: Array<{ title: string; content: string }>;
}

export interface I18nContextType {
  language: string;
  setLanguage: (lang: string, options?: { skipRefreshPrompt?: boolean }) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dir: 'ltr' | 'rtl';
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  getTutorialConfig: (pageName: string) => TutorialConfigFromLocale | null;
  showRefreshPrompt?: boolean;
  dismissRefreshPrompt?: () => void;
}

export const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const useI18n = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
