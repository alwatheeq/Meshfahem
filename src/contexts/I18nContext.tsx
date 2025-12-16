import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getLanguageInfo } from '../utils/translation';
import { ErrorLogger } from '../utils/errorLogger';

// Import all translation files
import enTranslations from '../locales/en.json';
import arTranslations from '../locales/ar.json';
import frTranslations from '../locales/fr.json';
import trTranslations from '../locales/tr.json';

interface I18nContextType {
  language: string;
  setLanguage: (lang: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dir: 'ltr' | 'rtl';
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const translations: Record<string, any> = {
  en: enTranslations,
  ar: arTranslations,
  fr: frTranslations,
  tr: trTranslations,
};

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<string>(() => {
    // Get language from localStorage or default to English
    return localStorage.getItem('meshfahem_language') || 'en';
  });
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    // Get theme from localStorage or default to 'light'
    const savedTheme = localStorage.getItem('meshfahem_theme');
    return (savedTheme === 'dark' || savedTheme === 'light') ? savedTheme : 'light';
  });

  const setLanguage = (lang: string) => {
    ErrorLogger.debug('Setting language', { component: 'I18nContext', action: 'setLanguage', language: lang });
    setLanguageState(lang);
    localStorage.setItem('meshfahem_language', lang);
    
    // Update HTML dir attribute
    const languageInfo = getLanguageInfo(lang);
    document.documentElement.dir = languageInfo.dir;
    document.documentElement.lang = lang;
    
    ErrorLogger.debug('Updated HTML dir', { component: 'I18nContext', action: 'setLanguage', dir: languageInfo.dir });
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
    
    // Dispatch custom event for ThemeProvider to listen to
    window.dispatchEvent(new CustomEvent('themeChanged'));
    
    ErrorLogger.debug('Updated HTML classList for theme', { component: 'I18nContext', action: 'setTheme', theme: newTheme });
  };

  // Set initial direction on mount
  useEffect(() => {
    const languageInfo = getLanguageInfo(language);
    document.documentElement.dir = languageInfo.dir;
    document.documentElement.lang = language;
    // Apply initial theme class
    if (theme === 'dark') document.documentElement.classList.add('dark');
    ErrorLogger.debug('Initial setup', { component: 'I18nContext', action: 'useEffect', language, dir: languageInfo.dir, theme });
  }, []);

  // Translation function with nested key support and parameter interpolation
  const t = (key: string, params?: Record<string, string | number>): string => {
    const currentTranslations = translations[language] || translations.en;
    
    // Support nested keys like "auth.title"
    const keys = key.split('.');
    let value = currentTranslations;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Fallback to English if key not found
        const fallbackTranslations = translations.en;
        let fallbackValue = fallbackTranslations;
        for (const fk of keys) {
          if (fallbackValue && typeof fallbackValue === 'object' && fk in fallbackValue) {
            fallbackValue = fallbackValue[fk];
          } else {
            ErrorLogger.warn('Translation key not found', { component: 'I18nContext', action: 'translate', key });
            return key; // Return the key itself as fallback
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
    
    // Handle parameter interpolation
    if (params) {
      let result = value;
      
      // Handle basic pluralization patterns like {count, plural, one {} other {s}}
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

  return (
    <I18nContext.Provider value={{ 
      language, 
      setLanguage, 
      t, 
      dir: languageInfo.dir,
      theme,
      setTheme
    }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};