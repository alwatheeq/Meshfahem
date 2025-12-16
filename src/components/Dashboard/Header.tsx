import React, { useState, useRef, useEffect } from 'react';
import { FileText, User, LogOut, BarChart3, Sun, Moon, Crown } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../contexts/I18nContext';
import { useCredits } from '../../contexts/CreditContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AVAILABLE_LANGUAGES } from '../../utils/translation';
import { NotificationCenter } from './NotificationCenter';
import { useSubscription } from '../../hooks/useSubscription';

export const Header: React.FC = () => {
  const { user, signOut } = useAuth();
  const { language, setLanguage, t, theme, setTheme } = useI18n();
  const { balance: creditBalance } = useCredits();
  const { getThemeGradient } = useTheme();
  const {
    getTierDisplayName,
    getTierColor,
    getDaysRemaining,
    getTokensUsed,
    getTokenLimit,
    getTokenUsagePercentage,
    getDaysRemainingInCycle
  } = useSubscription();
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const daysInCycle = getDaysRemainingInCycle();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLanguageChange = (newLanguage: string) => {
    ErrorLogger.debug('Language change requested', { component: 'Header', action: 'handleLanguageChange', newLanguage });
    setLanguage(newLanguage);
    setShowProfileDropdown(false);
  };
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:shadow-none sticky top-0 z-50">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <div className={`${getThemeGradient('ui')} p-2 rounded-lg`}>
              <FileText className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('app_name')}</h1>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3 lg:space-x-6">
            {/* Credit Balance Display - Always Visible */}
            {creditBalance && creditBalance.credits_total > 0 && (
              <>
                {/* Desktop - Full Display */}
                <div className="hidden lg:flex items-center bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-750 rounded-xl p-4 shadow-sm border border-gray-200/50 dark:border-gray-700/50 hover:shadow-md transition-all duration-300 group">
                  <div className="flex flex-col space-y-1.5">
                    <div className="flex items-baseline space-x-2">
                      <span className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                        {creditBalance.credits_remaining.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                        / {creditBalance.credits_total.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="relative w-36 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out shadow-lg ${
                            creditBalance.credits_remaining > 1000
                              ? 'bg-gradient-to-r from-green-400 via-green-500 to-emerald-500'
                              : creditBalance.credits_remaining > 500
                              ? 'bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500'
                              : 'bg-gradient-to-r from-red-400 via-red-500 to-rose-500'
                          }`}
                          style={{ width: `${Math.min((creditBalance.credits_remaining / creditBalance.credits_total) * 100, 100)}%` }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 rounded-full">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          {daysInCycle}d
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tablet/Mobile - Compact Display */}
                <div className="flex lg:hidden items-center bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-750 rounded-xl px-3 py-2 shadow-sm border border-gray-200/50 dark:border-gray-700/50 transition-all duration-300">
                  <div className="flex flex-col space-y-1">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {creditBalance.credits_remaining.toLocaleString()}
                    </span>
                    <div className="relative w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${
                          creditBalance.credits_remaining > 1000
                            ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                            : creditBalance.credits_remaining > 500
                            ? 'bg-gradient-to-r from-yellow-400 to-orange-500'
                            : 'bg-gradient-to-r from-red-400 to-rose-500'
                        }`}
                        style={{ width: `${Math.min((creditBalance.credits_remaining / creditBalance.credits_total) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </>
            )}

            <NotificationCenter />

            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="flex items-center space-x-2 group hover:bg-gray-50 rounded-lg p-2 transition duration-150"
              >
                {user?.avatar_url ? (
                  <img 
                    src={user.avatar_url} 
                    alt={user.name || user.email} 
                    className="h-8 w-8 rounded-full"
                  />
                ) : (
                  <div className={`h-8 w-8 ${getThemeGradient('ui')} rounded-full flex items-center justify-center`}>
                    <User className="h-4 w-4 text-white" />
                  </div>
                )}
                <div className="hidden sm:block">
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {user?.name || user?.email?.split('@')[0]}
                    </p>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold bg-${getTierColor()}-100 text-${getTierColor()}-800 dark:bg-${getTierColor()}-900 dark:text-${getTierColor()}-300`}>
                      {getTierDisplayName()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
                </div>
              </button>

              {/* Profile Dropdown */}
              {showProfileDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 dark:bg-gray-800 dark:border-gray-700 dark:shadow-none">
                  {/* Theme Section */}
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h4 className="text-sm font-medium text-gray-700 mb-3 dark:text-gray-200">{t('header.theme')}</h4>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setTheme('light')}
                        className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-lg transition duration-150 ${
                          theme === 'light'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                            : 'hover:bg-gray-100 text-gray-700 dark:hover:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <Sun className="h-4 w-4" />
                        <span className="text-sm font-medium">{t('header.light_mode')}</span>
                      </button>
                      <button
                        onClick={() => setTheme('dark')}
                        className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-lg transition duration-150 ${
                          theme === 'dark'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                            : 'hover:bg-gray-100 text-gray-700 dark:hover:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <Moon className="h-4 w-4" />
                        <span className="text-sm font-medium">{t('header.dark_mode')}</span>
                      </button>
                    </div>
                  </div>
                  {/* Language Section */}
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h4 className="text-sm font-medium text-gray-700 mb-3 dark:text-gray-200">{t('header.language')}</h4>
                    <div className="space-y-2">
                      {AVAILABLE_LANGUAGES.map((lang) => (
                        <button
                          key={lang.code}
                          onClick={() => handleLanguageChange(lang.code)}
                          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition duration-150 ${
                            language === lang.code
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                              : 'hover:bg-gray-100 text-gray-700 dark:hover:bg-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <span className="text-lg">{lang.flag}</span>
                          <span className="text-sm font-medium">{lang.name}</span>
                          {language === lang.code && (
                            <div className="ml-auto w-2 h-2 bg-blue-600 rounded-full"></div>
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
                      className="w-full flex items-center space-x-3 px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition duration-150"
                    >
                      <User className="h-4 w-4" />
                      <span className="text-sm font-medium">Profile</span>
                    </button>
                    <button
                      onClick={() => {
                        signOut();
                        setShowProfileDropdown(false);
                      }}
                      className="w-full flex items-center space-x-3 px-3 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition duration-150 dark:hover:bg-red-900/20"
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