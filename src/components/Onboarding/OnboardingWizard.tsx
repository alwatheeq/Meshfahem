import React, { useState } from 'react';
import { Globe, Palette, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useUserPreferences } from '../../contexts/UserPreferencesContext';
import { useAuth } from '../../hooks/useAuth';
import type { ColorTheme } from '../../contexts/ThemeContext';

const LANGUAGES = [
  { code: 'en', name: 'English', initials: 'EN', flag: '🇺🇸' },
  { code: 'ar', name: 'العربية', initials: 'AR', flag: '🇸🇦' },
  { code: 'fr', name: 'Français', initials: 'FR', flag: '🇫🇷' },
  { code: 'tr', name: 'Türkçe', initials: 'TR', flag: '🇹🇷' },
] as const;

interface ThemeOption {
  id: ColorTheme;
  name: string;
  swatch: string;
  desc: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'sky-blue',
    name: 'Sky Blue',
    swatch: 'linear-gradient(135deg, #38bdf8, #2563eb)',
    desc: 'Calm & focused',
  },
  {
    id: 'rose-pink',
    name: 'Rose Pink',
    swatch: 'linear-gradient(135deg, #fb7185, #db2777)',
    desc: 'Warm & inviting',
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    swatch: 'linear-gradient(135deg, #9ca3af, #374151)',
    desc: 'Clean & minimal',
  },
  {
    id: 'warm-neutrals',
    name: 'Warm Neutrals',
    swatch: 'linear-gradient(135deg, #fbbf24, #92400e)',
    desc: 'Earthy & cozy',
  },
  {
    id: 'slate-mist',
    name: 'Slate Mist',
    swatch: 'linear-gradient(135deg, #64748b, #14b8a6 45%, #0891b2)',
    desc: 'Cool & professional',
  },
  {
    id: 'plum-sand',
    name: 'Plum Sand',
    swatch: 'linear-gradient(135deg, #c084fc, #7e22ce)',
    desc: 'Bold & creative',
  },
];

export const OnboardingWizard: React.FC = () => {
  const { user } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const {
    currentTheme,
    setTheme,
    getThemeGradient,
    getThemeCardBg,
    getThemeCardBorder,
    getThemeTextPrimary,
    getThemeTextSecondary,
  } = useTheme();
  const { updateColorTheme } = useUserPreferences();

  const [step, setStep] = useState(1);
  const [selectedLang, setSelectedLang] = useState<string>(language || 'en');
  const [selectedTheme, setSelectedTheme] = useState<ColorTheme>(currentTheme || 'sky-blue');
  const [completing, setCompleting] = useState(false);

  const handleLangSelect = (code: string) => {
    setSelectedLang(code);
    setLanguage(code, { skipRefreshPrompt: true });
  };

  const handleThemeSelect = (themeId: ColorTheme) => {
    setSelectedTheme(themeId);
    void setTheme(themeId);
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      // Per-user key — the primary gate checked by App.tsx on every load
      if (user?.id) {
        localStorage.setItem(`meshfahem_onboarding_completed_${user.id}`, 'true');
      }
      // Keep global key for backwards compat with LanguageChoicePage
      localStorage.setItem('meshfahem_language_chosen', 'true');
      await updateColorTheme(selectedTheme);
    } catch {
      // non-critical: preferences are already set in localStorage; DB sync will retry later
    }
    window.location.reload();
  };

  const stepLabel = t('onboarding.step_of')
    .replace('{current}', String(step))
    .replace('{total}', '2');

  return (
    <div
      className={`min-h-screen w-full flex flex-col items-center justify-center p-6 ${getThemeCardBg()}`}
    >
      {/* Progress indicator */}
      <div className="w-full max-w-md mb-8 flex items-center justify-center gap-2">
        {[1, 2].map((s) => (
          <div
            key={s}
            className={`h-2 rounded-full transition-all duration-300 ${
              s === step
                ? 'w-8 bg-blue-500'
                : s < step
                  ? 'w-8 bg-blue-300'
                  : 'w-4 bg-gray-300 dark:bg-gray-600'
            }`}
          />
        ))}
        <span className={`ml-2 text-xs ${getThemeTextSecondary()}`}>{stepLabel}</span>
      </div>

      <div className="w-full max-w-md">
        {step === 1 ? (
          /* ── STEP 1: Language ────────────────────────────────────────── */
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className={`p-3 rounded-full ${getThemeGradient('ui')}`}>
                  <Globe className="h-10 w-10 text-white" />
                </div>
              </div>
              <h1 className={`text-2xl font-bold ${getThemeTextPrimary()}`}>
                {t('onboarding.step_language')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('onboarding.step_language_sub')}
              </p>
            </div>

            <div
              className={`rounded-lg border ${getThemeCardBorder()} overflow-hidden divide-y divide-gray-200 dark:divide-gray-700`}
            >
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLangSelect(lang.code)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                    selectedLang === lang.code
                      ? `${getThemeGradient('bg')} text-blue-700 dark:text-blue-300`
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl leading-none" aria-hidden>
                      {lang.flag}
                    </span>
                    <span className="font-semibold text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                      {lang.initials}
                    </span>
                    <span className="text-sm font-medium">{lang.name}</span>
                  </div>
                  {selectedLang === lang.code && (
                    <Check className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold text-white ${getThemeGradient('ui')} hover:opacity-90 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
            >
              {t('onboarding.next')}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          /* ── STEP 2: Color Theme ─────────────────────────────────────── */
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className={`p-3 rounded-full ${getThemeGradient('ui')}`}>
                  <Palette className="h-10 w-10 text-white" />
                </div>
              </div>
              <h1 className={`text-2xl font-bold ${getThemeTextPrimary()}`}>
                {t('onboarding.step_theme')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('onboarding.step_theme_sub')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {THEME_OPTIONS.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => handleThemeSelect(theme.id)}
                  className={`relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    selectedTheme === theme.id
                      ? 'border-blue-500 shadow-md'
                      : `${getThemeCardBorder()} hover:border-gray-400 dark:hover:border-gray-500`
                  }`}
                >
                  {/* Color swatch */}
                  <div
                    className="w-full h-10 rounded-md"
                    style={{ background: theme.swatch }}
                  />
                  <span className={`text-xs font-semibold ${getThemeTextPrimary()}`}>
                    {theme.name}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{theme.desc}</span>
                  {selectedTheme === theme.id && (
                    <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-0.5">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`flex items-center justify-center gap-1 px-4 py-3 rounded-lg text-sm font-medium border ${getThemeCardBorder()} bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 ${getThemeTextSecondary()} transition`}
              >
                <ChevronLeft className="h-4 w-4" />
                {t('onboarding.back')}
              </button>
              <button
                type="button"
                onClick={handleComplete}
                disabled={completing}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold text-white ${getThemeGradient('ui')} hover:opacity-90 transition disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
              >
                {completing ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  t('onboarding.get_started')
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
