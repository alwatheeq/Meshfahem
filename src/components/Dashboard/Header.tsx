import React, { useState, useRef, useEffect } from 'react';
import { FileText, User, LogOut, Sun, Moon, Coins } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../contexts/I18nContext';
import { useCredits } from '../../contexts/CreditContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AVAILABLE_LANGUAGES } from '../../utils/translation';
import { NotificationCenter } from './NotificationCenter';
import { useSubscription } from '../../hooks/useSubscription';
import { ErrorLogger } from '../../utils/errorLogger';

export const Header: React.FC = () => {
  const { user, signOut } = useAuth();
  const { language, setLanguage, t, theme, setTheme } = useI18n();
  const { balance: creditBalance } = useCredits();
  const { getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const {
    subscription,
    getTierDisplayName,
    getTierColor,
    getDaysRemainingInCycle
  } = useSubscription();
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const [showCreditsDropdown, setShowCreditsDropdown] = useState(false);
  const creditsDropdownRef = useRef<HTMLDivElement>(null);

  const daysInCycle = getDaysRemainingInCycle();

  const toolRemaining = creditBalance?.credits_remaining ?? 0;
  const toolTotal = creditBalance?.credits_total ?? 1500;
  const zegoRemaining = creditBalance?.zego_credits_remaining ?? 0;
  const zegoTotal = creditBalance?.zego_credits_total ?? 0;

  const hasAiAddon = !!subscription && (
    subscription.subscription_tier === 'standard' && ((subscription.chat_blocks_per_cycle ?? 0) > 0) ||
    (subscription.token_limit ?? 0) > 520000
  );
  const aiChatCreditsTotal = hasAiAddon && subscription
    ? (subscription.token_limit && subscription.token_limit > 520000
        ? Math.round((subscription.token_limit - 520000) / 1000)
        : (subscription.chat_blocks_per_cycle ?? 0) * 100)
    : 0;
  const aiChatCreditsUsed = hasAiAddon && subscription ? Math.round((subscription.tokens_used_current_cycle ?? 0) / 1000) : 0;
  const aiChatCreditsRemaining = Math.max(0, aiChatCreditsTotal - aiChatCreditsUsed);

  const combinedRemaining = toolRemaining + (zegoTotal > 0 ? zegoRemaining : 0) + (hasAiAddon ? aiChatCreditsRemaining : 0);

  const toolProgress = toolTotal > 0 ? Math.min((toolRemaining / toolTotal) * 100, 100) : 0;
  const zegoProgress = zegoTotal > 0 ? Math.min((zegoRemaining / zegoTotal) * 100, 100) : 0;

  // Map tier colors to complete Tailwind classes (required for JIT compiler)
  const tierColorClasses: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
    gray: {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      darkBg: 'dark:bg-gray-900',
      darkText: 'dark:text-gray-300'
    },
    blue: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      darkBg: 'dark:bg-blue-900',
      darkText: 'dark:text-blue-300'
    },
    green: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      darkBg: 'dark:bg-green-900',
      darkText: 'dark:text-green-300'
    },
    cyan: {
      bg: 'bg-cyan-100',
      text: 'text-cyan-800',
      darkBg: 'dark:bg-cyan-900',
      darkText: 'dark:text-cyan-300'
    },
    yellow: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      darkBg: 'dark:bg-yellow-900',
      darkText: 'dark:text-yellow-300'
    }
  };

  const tierColor = getTierColor();
  const tierClasses = tierColorClasses[tierColor] || tierColorClasses.gray;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
      if (creditsDropdownRef.current && !creditsDropdownRef.current.contains(event.target as Node)) {
        setShowCreditsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLanguageChange = (newLanguage: string) => {
    ErrorLogger.debug('Language change requested', { 
      component: 'Header', 
      action: 'handleLanguageChange', 
      metadata: { newLanguage } 
    });
    setLanguage(newLanguage);
    setShowProfileDropdown(false);
  };
  return (
    <header className={`${getThemeCardBg()} shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm border-b ${getThemeCardBorder()} dark:shadow-none sticky top-0 z-50`}>
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16">
          {/* Left: Logo + Meshfahem */}
          <div className="flex items-center space-x-3 flex-shrink-0">
            <div className={`${getThemeSubtle('ui')} p-2 rounded-md ${getThemeCardBorder()}`}>
              <FileText className={`h-6 w-6 ${getThemeTextPrimary()}`} />
            </div>
            <h1 className={`text-xl font-bold ${getThemeTextPrimary()}`}>{t('app_name')}</h1>
          </div>

          {/* Middle: Tagline */}
          <div className="flex-1 flex justify-center px-2 sm:px-4 min-w-0">
            <p className={`text-xs sm:text-sm ${getThemeTextSecondary()} italic text-center whitespace-nowrap truncate`}>
              This is just the beginning, there is better to come
            </p>
          </div>

          {/* Right: Credit bar + notifications + profile */}
          <div className="flex items-center space-x-2 sm:space-x-3 lg:space-x-6 flex-shrink-0">
            {/* Credit Balance Display */}
            {creditBalance && (creditBalance.credits_total > 0 || zegoTotal > 0 || hasAiAddon) && (
              <div className="relative" ref={creditsDropdownRef}>
                <button
                  onClick={() => setShowCreditsDropdown(!showCreditsDropdown)}
                  className={`flex items-center space-x-2 ${getThemeCardBg()} ${getThemeCardBorder()} border rounded-full px-3 py-1.5 shadow-sm hover:opacity-80 transition-opacity`}
                >
                  <div className={`${getThemeSubtle('ui')} rounded-full p-1 flex items-center justify-center`}>
                    <Coins className={`h-4 w-4 ${getThemeTextPrimary()}`} />
                  </div>
                  <div className="flex flex-col items-start translate-y-px">
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${getThemeTextSecondary()} leading-none`}>Credits</span>
                    <span className={`text-[13px] font-bold ${getThemeTextPrimary()} leading-none`}>
                      {combinedRemaining.toLocaleString()}
                    </span>
                  </div>
                </button>

                {/* Credits Dropdown */}
                {showCreditsDropdown && (
                  <div className={`absolute right-0 mt-2 w-72 ${getThemeCardBg()} ${getThemeCardBorder()} border rounded-xl shadow-lg z-50 p-4`}>
                    <div className="flex flex-col space-y-4">
                      {/* Tools & Services */}
                      <div className="flex flex-col space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold tracking-wide text-green-700 uppercase">
                            Tools &amp; Services
                          </span>
                          <span className="text-xs font-semibold text-green-700">
                            {toolRemaining.toLocaleString()} / {toolTotal.toLocaleString()}
                          </span>
                        </div>
                        <div className={`relative w-full h-2 ${getThemeSubtle('ui')} rounded-full overflow-hidden`}>
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-green-500 transition-all duration-200 ease-out"
                            style={{ width: `${toolProgress}%` }}
                          />
                        </div>
                      </div>

                      {zegoTotal > 0 && (
                        <>
                          <div className="h-px w-full bg-gray-200 dark:bg-gray-700" />
                          {/* Study Room Credits */}
                          <div className="flex flex-col space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold tracking-wide text-blue-700 dark:text-blue-400 uppercase">
                                Study Room
                              </span>
                              <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                                {zegoRemaining.toLocaleString()} / {zegoTotal.toLocaleString()}
                              </span>
                            </div>
                            <div className={`relative w-full h-2 ${getThemeSubtle('ui')} rounded-full overflow-hidden`}>
                              <div
                                className="absolute inset-y-0 left-0 rounded-full bg-blue-500 transition-all duration-200 ease-out"
                                style={{ width: `${zegoProgress}%` }}
                              />
                            </div>
                          </div>
                        </>
                      )}

                      {hasAiAddon && (
                        <>
                          <div className="h-px w-full bg-gray-200 dark:bg-gray-700" />
                          {/* AI Chat Assistant Credits */}
                          <div className="flex flex-col space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold tracking-wide text-purple-700 dark:text-purple-400 uppercase">
                                AI Chat Assistant
                              </span>
                              <span className="text-xs font-semibold text-purple-700 dark:text-purple-400">
                                {aiChatCreditsRemaining.toLocaleString()} / {aiChatCreditsTotal.toLocaleString()}
                              </span>
                            </div>
                            <div className={`relative w-full h-2 ${getThemeSubtle('ui')} rounded-full overflow-hidden`}>
                              <div
                                className="absolute inset-y-0 left-0 rounded-full bg-purple-500 transition-all duration-200 ease-out"
                                style={{ width: `${aiChatCreditsTotal > 0 ? (aiChatCreditsRemaining / aiChatCreditsTotal) * 100 : 0}%` }}
                              />
                            </div>
                          </div>
                        </>
                      )}

                      <div className="h-px w-full bg-gray-200 dark:bg-gray-700" />

                      {/* Cycle Reset Info */}
                      <div className="flex justify-between items-center text-xs">
                        <span className={getThemeTextSecondary()}>Cycle Resets In:</span>
                        <div className={`flex items-center space-x-1 px-2 py-0.5 ${getThemeSubtle('ui')} rounded-full`}>
                          <div className={`w-1.5 h-1.5 bg-gray-400 rounded-full`}></div>
                          <span className={`font-semibold ${getThemeTextPrimary()}`}>{daysInCycle} days</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}


            <NotificationCenter />

            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className={`flex items-center space-x-2 group hover:opacity-60 rounded-lg p-2 transition duration-150`}
              >
                {user?.avatar_url ? (
                  <img 
                    src={user.avatar_url} 
                    alt={user.name || user.email} 
                    className="h-8 w-8 rounded-full"
                  />
                ) : (
                  <div className={`h-8 w-8 ${getThemeSubtle('ui')} rounded-full flex items-center justify-center ${getThemeCardBorder()}`}>
                    <User className={`h-4 w-4 ${getThemeTextPrimary()}`} />
                  </div>
                )}
                <div className="hidden sm:block">
                  <div className="flex items-center space-x-2">
                    <p className={`text-sm font-medium ${getThemeTextPrimary()}`}>
                      {user?.name || user?.email?.split('@')[0]}
                    </p>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${tierClasses.bg} ${tierClasses.text} ${tierClasses.darkBg} ${tierClasses.darkText}`}>
                      {getTierDisplayName()}
                    </span>
                  </div>
                  <p className={`text-xs ${getThemeTextMuted()}`}>{user?.email}</p>
                </div>
              </button>

              {/* Profile Dropdown */}
              {showProfileDropdown && (
                <div className={`absolute right-0 mt-2 w-64 ${getThemeCardBg()} ${getThemeCardBorder()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow z-50`}>
                  {/* Theme Section */}
                  <div className={`p-4 border-b ${getThemeCardBorder()}`}>
                    <h4 className={`text-sm font-medium ${getThemeTextSecondary()} mb-3`}>{t('header.theme')}</h4>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setTheme('light')}
                        className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-md transition-colors duration-150 ${
                          theme === 'light'
                            ? `${getThemeSubtle('ui')} ${getThemeTextPrimary()}`
                            : `hover:opacity-60 ${getThemeTextSecondary()}`
                        }`}
                      >
                        <Sun className="h-4 w-4" />
                        <span className="text-sm font-medium">{t('header.light_mode')}</span>
                      </button>
                      <button
                        onClick={() => setTheme('dark')}
                        className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-md transition-colors duration-150 ${
                          theme === 'dark'
                            ? `${getThemeSubtle('ui')} ${getThemeTextPrimary()}`
                            : `hover:opacity-60 ${getThemeTextSecondary()}`
                        }`}
                      >
                        <Moon className="h-4 w-4" />
                        <span className="text-sm font-medium">{t('header.dark_mode')}</span>
                      </button>
                    </div>
                  </div>
                  {/* Language Section */}
                  <div className={`p-4 border-b ${getThemeCardBorder()}`}>
                    <h4 className={`text-sm font-medium ${getThemeTextSecondary()} mb-3`}>{t('header.language')}</h4>
                    <div className="space-y-2">
                      {AVAILABLE_LANGUAGES.map((lang: { code: string; name: string; flag: string; dir: string }) => (
                        <button
                          key={lang.code}
                          onClick={() => handleLanguageChange(lang.code)}
                          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-left transition-colors duration-150 ${
                            language === lang.code
                              ? `${getThemeSubtle('ui')} ${getThemeTextPrimary()}`
                              : `hover:opacity-60 ${getThemeTextSecondary()}`
                          }`}
                        >
                          <span className="text-lg">{lang.flag}</span>
                          <span className="text-sm font-medium">{lang.name}</span>
                          {language === lang.code && (
                            <div className={`ml-auto w-2 h-2 ${getThemeTextPrimary()} rounded-full`}></div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Profile Actions */}
                  <div className="p-2">
                    <button
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('navigateToProfile'));
                        setShowProfileDropdown(false);
                      }}
                      className={`w-full flex items-center space-x-3 px-3 py-2 ${getThemeTextSecondary()} hover:opacity-60 rounded-md transition-colors duration-150`}
                    >
                      <User className="h-4 w-4" />
                      <span className="text-sm font-medium">Profile</span>
                    </button>
                    <button
                      onClick={() => {
                        signOut();
                        setShowProfileDropdown(false);
                      }}
                      className="w-full flex items-center space-x-3 px-3 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors duration-150 dark:hover:bg-red-900/20"
                    >
                      <LogOut className="h-4 w-4" />
                      <span className="text-sm font-medium">{t('header.sign_out')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};