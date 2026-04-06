import React, { useState, useEffect, ReactNode } from 'react';
import { I18nContext } from './I18nContextDef';
import { getLanguageInfo } from '../utils/translation';
import { ErrorLogger } from '../utils/errorLogger';

// Import all translation files
import enTranslations from '../locales/en.json';
import arTranslations from '../locales/ar.json';
import frTranslations from '../locales/fr.json';
import trTranslations from '../locales/tr.json';

const translations: Record<string, any> = {
  en: enTranslations,
  ar: arTranslations,
  fr: frTranslations,
  tr: trTranslations,
};

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<string>(() => {
    return localStorage.getItem('meshfahem_language') || 'en';
  });
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('meshfahem_theme');
    return (savedTheme === 'dark' || savedTheme === 'light') ? savedTheme : 'light';
  });
  const [showRefreshPrompt, setShowRefreshPrompt] = useState(false);

  const setLanguage = (lang: string, options?: { skipRefreshPrompt?: boolean }) => {
    ErrorLogger.debug('Setting language', { component: 'I18nContext', action: 'setLanguage', language: lang });
    setLanguageState(lang);
    localStorage.setItem('meshfahem_language', lang);

    const languageInfo = getLanguageInfo(lang);
    document.documentElement.dir = languageInfo.dir;
    document.documentElement.lang = lang;

    ErrorLogger.debug('Updated HTML dir', { component: 'I18nContext', action: 'setLanguage', dir: languageInfo.dir });

    if (!options?.skipRefreshPrompt) {
      setShowRefreshPrompt(true);
    }
  };

  const dismissRefreshPrompt = () => {
    setShowRefreshPrompt(false);
  };

  const setTheme = (newTheme: 'light' | 'dark') => {
    ErrorLogger.debug('Setting theme', { component: 'I18nContext', action: 'setTheme', theme: newTheme });
    setThemeState(newTheme);
    localStorage.setItem('meshfahem_theme', newTheme);

    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    window.dispatchEvent(new CustomEvent('themeChanged'));

    ErrorLogger.debug('Updated HTML classList for theme', { component: 'I18nContext', action: 'setTheme', theme: newTheme });
  };

  useEffect(() => {
    const languageInfo = getLanguageInfo(language);
    document.documentElement.dir = languageInfo.dir;
    document.documentElement.lang = language;
    if (theme === 'dark') document.documentElement.classList.add('dark');
    ErrorLogger.debug('Initial setup', { component: 'I18nContext', action: 'useEffect', language, dir: languageInfo.dir, theme });
  }, []);

  const t = (key: string, params?: Record<string, string | number>): string => {
    const currentTranslations = translations[language] || translations.en;

    const keys = key.split('.');
    let value = currentTranslations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        const fallbackTranslations = translations.en;
        let fallbackValue = fallbackTranslations;
        for (const fk of keys) {
          if (fallbackValue && typeof fallbackValue === 'object' && fk in fallbackValue) {
            fallbackValue = fallbackValue[fk];
          } else {
            ErrorLogger.warn('Translation key not found', { component: 'I18nContext', action: 'translate', key });
            return key;
          }
        }
        value = fallbackValue;
        break;
      }
    }

    if (typeof value !== 'string') {
      ErrorLogger.warn('Translation value is not a string', { component: 'I18nContext', action: 'translate', key, valueType: typeof value });
      return key;
    }

    if (params) {
      let result = value;

      const pluralRegex = /\{(\w+),\s*plural,\s*one\s*\{([^}]*)\}\s*other\s*\{([^}]*)\}\}/g;
      result = result.replace(pluralRegex, (match, countKey, oneForm, otherForm) => {
        const count = params[countKey];
        if (typeof count === 'number') {
          return count === 1 ? oneForm : otherForm;
        }
        return match;
      });

      Object.entries(params).forEach(([paramKey, paramValue]) => {
        result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
      });
      return result;
    }

    return value;
  };

  const languageInfo = getLanguageInfo(language);

  const getTutorialConfig = (pageName: string) => {
    const tr = translations[language] || translations.en;
    const enTr = translations.en;
    const data = (tr?.tutorial?.[pageName] ?? enTr?.tutorial?.[pageName]) as { title: string; steps: Array<{ title: string; content: string }> } | undefined;
    if (!data?.title || !Array.isArray(data.steps)) return null;
    return { pageName, title: data.title, steps: data.steps };
  };

  return (
    <I18nContext.Provider
      value={{
        language,
        setLanguage,
        t,
        dir: languageInfo.dir,
        theme,
        setTheme,
        getTutorialConfig,
        showRefreshPrompt,
        dismissRefreshPrompt,
      }}
    >
      {children}
      {showRefreshPrompt && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <p className="text-gray-700 dark:text-gray-200">
              {t('language_refresh_prompt')}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  dismissRefreshPrompt();
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                {t('language_refresh_ok')}
              </button>
              <button
                type="button"
                onClick={() => {
                  dismissRefreshPrompt();
                  window.location.reload();
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                {t('language_refresh_now')}
              </button>
            </div>
          </div>
        </div>
      )}
    </I18nContext.Provider>
  );
};

export { I18nContext, useI18n } from './I18nContextDef';
export type { TutorialConfigFromLocale, I18nContextType } from './I18nContextDef';
