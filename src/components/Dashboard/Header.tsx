import React, { useState, useRef, useEffect } from 'react';
import { FileText, User, LogOut, Sun, Moon, HandCoins, Shield } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../contexts/I18nContext';
import { useCredits } from '../../contexts/CreditContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AVAILABLE_LANGUAGES } from '../../utils/translation';
import { NotificationCenter } from './NotificationCenter';
import { useSubscription } from '../../hooks/useSubscription';
import { ErrorLogger } from '../../utils/errorLogger';
import { getToolsCreditsPlanCap } from '../../utils/subscriptionHelpers';

export const Header: React.FC = () => {
  const { user, signOut } = useAuth();
  const { language, setLanguage, t, theme, setTheme } = useI18n();
  const { balance: creditBalance, loading: creditsLoading } = useCredits();
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
  const toolPlanCap = getToolsCreditsPlanCap(subscription);
  const zegoRemaining = creditBalance?.zego_credits_remaining ?? 0;
  const zegoTotal = creditBalance?.zego_credits_total ?? 0;

  const chatTokRemRpc = creditBalance?.chat_tokens_remaining;
  const chatTokLimRpc = creditBalance?.chat_token_limit;
  const useRpcChatTokens =
    typeof chatTokRemRpc === 'number' &&
    typeof chatTokLimRpc === 'number' &&
    chatTokLimRpc > 0;

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

  const chatCombinedUnits = hasAiAddon
    ? aiChatCreditsRemaining
    : useRpcChatTokens
      ? Math.round((chatTokRemRpc ?? 0) / 1000)
      : 0;

  const combinedRemaining =
    toolRemaining + (zegoTotal > 0 ? zegoRemaining : 0) + chatCombinedUnits;

  const toolProgress =
    toolPlanCap > 0 ? Math.min(100, (toolRemaining / toolPlanCap) * 100) : 0;
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
        <div className="flex items-center h-16 rtl:flex-row-reverse">
          {/* Logo + App name */}
          <div className="flex items-center space-x-3 rtl:space-x-reverse flex-shrink-0">
            <div className={`${getThemeSubtle('ui')} p-2 rounded-md ${getThemeCardBorder()}`}>
              <FileText className={`h-6 w-6 ${getThemeTextPrimary()}`} />
            </div>
            <h1 className={`text-xl font-bold ${getThemeTextPrimary()}`}>{t('app_name')}</h1>
          </div>

          {/* Middle: Tagline */}
          <div className="flex-1 flex justify-center px-2 sm:px-4 min-w-0">
            <p className={`text-xs sm:text-sm ${getThemeTextSecondary()} italic text-center whitespace-nowrap truncate`}>
              {t('header.tagline')}
            </p>
          </div>

          {/* Right: Credit bar + notifications + profile */}
          <div className="flex items-center space-x-2 sm:space-x-3 lg:space-x-6 rtl:space-x-reverse flex-shrink-0">
            {/* Credit Balance Display */}
            {user && !creditsLoading && creditBalance && (
              <div className="relative" ref={creditsDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowCreditsDropdown(!showCreditsDropdown)}
                  className={`flex items-center space-x-2 ${getThemeCardBg()} ${getThemeCardBorder()} border rounded-full px-3 py-1.5 shadow-sm hover:opacity-80 transition-opacity`}
                >
                  <div className={`${getThemeSubtle('ui')} rounded-full p-1 flex items-center justify-center`}>
                    <HandCoins className={`h-4 w-4 ${getThemeTextPrimary()}`} aria-hidden />
                  </div>
                  <div className="flex flex-col items-start translate-y-px">
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${getThemeTextSecondary()} leading-none`}>
                      {t('header.credits_label')}
                    </span>
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
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold tracking-wide uppercase ${getThemeTextPrimary()}`}>
                            {t('header.credits_tools_services')}
                          </span>
                          <span
                            className={`text-xs font-semibold shrink-0 ${getThemeTextSecondary()} text-right max-w-[58%]`}
                            title={
                              toolPlanCap > 0 && toolRemaining > toolPlanCap
                                ? t('header.credits_tools_bonus_title')
                                : undefined
                            }
                          >
                            {toolRemaining.toLocaleString()} / {toolPlanCap.toLocaleString()}
                            {toolPlanCap > 0 && toolRemaining > toolPlanCap ? (
                              <span className={`block text-[10px] font-normal mt-0.5 ${getThemeTextMuted()}`}>
                                {t('header.credits_tools_includes_bonus')}
                              </span>
                            ) : null}
                          </span>
                        </div>
                        <div className={`relative w-full h-2 ${getThemeSubtle('ui')} rounded-full overflow-hidden`}>
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 dark:bg-emerald-600 transition-all duration-200 ease-out"
                            style={{ width: `${toolProgress}%` }}
                          />
                        </div>
                      </div>

                      <div className="h-px w-full bg-gray-200 dark:bg-gray-700" />

                      {/* Study Room — always visible; no "/total" unless user purchased minutes */}
                      <div className="flex flex-col space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold tracking-wide uppercase ${getThemeTextPrimary()}`}>
                            {t('header.credits_study_room')}
                          </span>
                          <span className={`text-xs font-semibold shrink-0 ${getThemeTextSecondary()}`}>
                            {zegoTotal > 0
                              ? `${zegoRemaining.toLocaleString()} / ${zegoTotal.toLocaleString()}`
                              : '0'}
                          </span>
                        </div>
                        {zegoTotal > 0 && (
                          <div className={`relative w-full h-2 ${getThemeSubtle('ui')} rounded-full overflow-hidden`}>
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-sky-500 dark:bg-sky-600 transition-all duration-200 ease-out"
                              style={{ width: `${zegoProgress}%` }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="h-px w-full bg-gray-200 dark:bg-gray-700" />

                      {/* AI Chat Assistant — always visible */}
                      <div className="flex flex-col space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold tracking-wide uppercase ${getThemeTextPrimary()}`}>
                            {t('header.credits_ai_assistant')}
                          </span>
                          <span className={`text-xs font-semibold shrink-0 ${getThemeTextSecondary()}`}>
                            {hasAiAddon && aiChatCreditsTotal > 0
                              ? `${aiChatCreditsRemaining.toLocaleString()} / ${aiChatCreditsTotal.toLocaleString()}`
                              : useRpcChatTokens
                                ? `${Math.round((chatTokRemRpc ?? 0) / 1000).toLocaleString()} / ${Math.round((chatTokLimRpc ?? 0) / 1000).toLocaleString()}`
                                : '0'}
                          </span>
                        </div>
                        {!hasAiAddon && (
                          <p className={`text-[11px] leading-snug ${getThemeTextMuted()}`}>
                            {t('header.credits_ai_addon_hint')}
                          </p>
                        )}
                        {useRpcChatTokens && (chatTokLimRpc ?? 0) > 0 && (
                          <div className={`relative w-full h-2 ${getThemeSubtle('ui')} rounded-full overflow-hidden`}>
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-violet-500 dark:bg-violet-600 transition-all duration-200 ease-out"
                              style={{
                                width: `${Math.min(100, ((chatTokRemRpc ?? 0) / (chatTokLimRpc ?? 1)) * 100)}%`
                              }}
                            />
                          </div>
                        )}
                        {!useRpcChatTokens && hasAiAddon && aiChatCreditsTotal > 0 && (
                          <div className={`relative w-full h-2 ${getThemeSubtle('ui')} rounded-full overflow-hidden`}>
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-violet-500 dark:bg-violet-600 transition-all duration-200 ease-out"
                              style={{
                                width: `${Math.min(100, (aiChatCreditsRemaining / aiChatCreditsTotal) * 100)}%`
                              }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="h-px w-full bg-gray-200 dark:bg-gray-700" />

                      {/* Cycle Reset Info */}
                      <div className="flex justify-between items-center text-xs gap-2">
                        <span className={getThemeTextSecondary()}>{t('header.credits_cycle_resets')}</span>
                        <div className={`flex items-center space-x-1 px-2 py-0.5 ${getThemeSubtle('ui')} rounded-full shrink-0`}>
                          <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                          <span className={`font-semibold ${getThemeTextPrimary()}`}>
                            {t('header.credits_days_remaining', { count: daysInCycle })}
                          </span>
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
                    <span className={`text-xs font-semibold ${tierClasses.text} ${tierClasses.darkText}`}>
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
                    {user?.role === 'admin' && (
                      <a
                        href="/admin/dashboard"
                        onClick={() => setShowProfileDropdown(false)}
                        className="w-full flex items-center space-x-3 px-3 py-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md transition-colors duration-150"
                      >
                        <Shield className="h-4 w-4" />
                        <span className="text-sm font-medium">{t('header.admin_portal')}</span>
                      </a>
                    )}
                    <button
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('navigateToProfile'));
                        setShowProfileDropdown(false);
                      }}
                      className={`w-full flex items-center space-x-3 px-3 py-2 ${getThemeTextSecondary()} hover:opacity-60 rounded-md transition-colors duration-150`}
                    >
                      <User className="h-4 w-4" />
                      <span className="text-sm font-medium">{t('header.profile')}</span>
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