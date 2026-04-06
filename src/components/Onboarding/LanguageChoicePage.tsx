import React, { useState } from 'react';
import { Globe, Check } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';
import enTranslations from '../../locales/en.json';
import arTranslations from '../../locales/ar.json';
import frTranslations from '../../locales/fr.json';
import trTranslations from '../../locales/tr.json';

const translations: Record<string, { language_choice?: { confirm?: string } }> = {
  en: enTranslations,
  ar: arTranslations,
  fr: frTranslations,
  tr: trTranslations,
};

const getConfirmLabel = (lang: string): string =>
  translations[lang]?.language_choice?.confirm ?? translations.en?.language_choice?.confirm ?? 'Confirm';

const LANGUAGES = [
  { code: 'en', name: 'English', initials: 'EN' },
  { code: 'ar', name: 'العربية', initials: 'AR' },
  { code: 'fr', name: 'Français', initials: 'FR' },
  { code: 'tr', name: 'Türkçe', initials: 'TR' },
];

interface LanguageChoicePageProps {
  onComplete: () => void;
}

export const LanguageChoicePage: React.FC<LanguageChoicePageProps> = ({ onComplete }) => {
  const { language, setLanguage, t } = useI18n();
  const { getThemeGradient, getThemeCardBg, getThemeCardBorder, getThemeTextPrimary } = useTheme();
  const [selectedLang, setSelectedLang] = useState<string>(() => language || 'en');

  const handleContinue = () => {
    setLanguage(selectedLang, { skipRefreshPrompt: true });
    localStorage.setItem('meshfahem_language_chosen', 'true');
    onComplete();
    window.location.reload();
  };

  return (
    <div className={`min-h-screen w-full flex flex-col p-6 ${getThemeCardBg()}`}>
      <div className="w-full max-w-md mx-auto flex flex-col gap-6">
        <div className="text-center space-y-2 pt-8">
          <div className="flex justify-center">
            <div className={`p-3 rounded-full ${getThemeGradient('ui')}`}>
              <Globe className="h-10 w-10 text-white" />
            </div>
          </div>
          <h1 className={`text-2xl font-bold ${getThemeTextPrimary()}`}>
            {t('language_choice.title')}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('language_choice.subtitle')}
          </p>
        </div>

        <div className={`rounded-lg border ${getThemeCardBorder()} overflow-hidden divide-y divide-gray-200 dark:divide-gray-700`}>
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => setSelectedLang(lang.code)}
              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                selectedLang === lang.code
                  ? `${getThemeGradient('bg')} text-blue-700 dark:text-blue-300`
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="font-semibold text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                  {lang.initials}
                </span>
                <span className="text-sm font-medium">{lang.name}</span>
              </div>
              {selectedLang === lang.code && (
                <Check className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              )}
            </button>
          ))}
        </div>

        {/* Confirm button - inline under language selection, charcoal text, smaller */}
        <button
          type="button"
          onClick={handleContinue}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          {getConfirmLabel(selectedLang)}
        </button>
      </div>
    </div>
  );
};
