import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useUserPreferences } from './UserPreferencesContext';
import { ErrorLogger } from '../utils/errorLogger';

export type ColorTheme = 'pink-white' | 'blue-purple' | 'green-teal' | 'orange-amber' | 'indigo-violet';

interface BackgroundColors {
  light: {
    gradient: string;
    from: string;
    to: string;
  };
  dark: {
    gradient: string;
    from: string;
    to: string;
  };
}

interface UIColors {
  light: {
    gradient: string;
    from: string;
    to: string;
    accent: string;
    accentHover: string;
  };
  dark: {
    gradient: string;
    from: string;
    to: string;
    accent: string;
    accentHover: string;
  };
}

interface ThemeColors {
  background: BackgroundColors;
  ui: UIColors;
}

const themeDefinitions: Record<ColorTheme, ThemeColors> = {
  'pink-white': {
    background: {
      light: {
        gradient: 'from-pink-50 to-white',
        from: 'pink-50',
        to: 'white',
      },
      dark: {
        gradient: 'from-pink-900 to-gray-900',
        from: 'pink-900',
        to: 'gray-900',
      },
    },
    ui: {
      light: {
        gradient: 'from-blue-500 to-purple-600',
        from: 'blue-500',
        to: 'purple-600',
        accent: 'blue-600',
        accentHover: 'blue-700',
      },
      dark: {
        gradient: 'from-blue-400 to-purple-500',
        from: 'blue-400',
        to: 'purple-500',
        accent: 'blue-400',
        accentHover: 'blue-500',
      },
    },
  },
  'blue-purple': {
    background: {
      light: {
        gradient: 'from-blue-50 to-purple-50',
        from: 'blue-50',
        to: 'purple-50',
      },
      dark: {
        gradient: 'from-blue-900 to-purple-900',
        from: 'blue-900',
        to: 'purple-900',
      },
    },
    ui: {
      light: {
        gradient: 'from-indigo-500 to-violet-600',
        from: 'indigo-500',
        to: 'violet-600',
        accent: 'indigo-600',
        accentHover: 'indigo-700',
      },
      dark: {
        gradient: 'from-indigo-400 to-violet-500',
        from: 'indigo-400',
        to: 'violet-500',
        accent: 'indigo-400',
        accentHover: 'indigo-500',
      },
    },
  },
  'green-teal': {
    background: {
      light: {
        gradient: 'from-green-50 to-teal-50',
        from: 'green-50',
        to: 'teal-50',
      },
      dark: {
        gradient: 'from-green-900 to-teal-900',
        from: 'green-900',
        to: 'teal-900',
      },
    },
    ui: {
      light: {
        gradient: 'from-emerald-500 to-cyan-600',
        from: 'emerald-500',
        to: 'cyan-600',
        accent: 'emerald-600',
        accentHover: 'emerald-700',
      },
      dark: {
        gradient: 'from-emerald-400 to-cyan-500',
        from: 'emerald-400',
        to: 'cyan-500',
        accent: 'emerald-400',
        accentHover: 'emerald-500',
      },
    },
  },
  'orange-amber': {
    background: {
      light: {
        gradient: 'from-orange-50 to-amber-50',
        from: 'orange-50',
        to: 'amber-50',
      },
      dark: {
        gradient: 'from-orange-900 to-amber-900',
        from: 'orange-900',
        to: 'amber-900',
      },
    },
    ui: {
      light: {
        gradient: 'from-red-500 to-pink-600',
        from: 'red-500',
        to: 'pink-600',
        accent: 'red-600',
        accentHover: 'red-700',
      },
      dark: {
        gradient: 'from-red-400 to-pink-500',
        from: 'red-400',
        to: 'pink-500',
        accent: 'red-400',
        accentHover: 'red-500',
      },
    },
  },
  'indigo-violet': {
    background: {
      light: {
        gradient: 'from-indigo-50 to-violet-50',
        from: 'indigo-50',
        to: 'violet-50',
      },
      dark: {
        gradient: 'from-indigo-900 to-violet-900',
        from: 'indigo-900',
        to: 'violet-900',
      },
    },
    ui: {
      light: {
        gradient: 'from-blue-500 to-cyan-600',
        from: 'blue-500',
        to: 'cyan-600',
        accent: 'blue-600',
        accentHover: 'blue-700',
      },
      dark: {
        gradient: 'from-blue-400 to-cyan-500',
        from: 'blue-400',
        to: 'cyan-500',
        accent: 'blue-400',
        accentHover: 'blue-500',
      },
    },
  },
};

interface ThemeContextType {
  currentTheme: ColorTheme;
  themeColors: ThemeColors;
  setTheme: (theme: ColorTheme) => Promise<void>;
  getThemeGradient: (type?: 'bg' | 'ui' | 'card') => string;
  getUIGradient: () => string;
  getBackgroundGradient: () => string;
  getThemeAccent: () => string;
  getThemeAccentHover: () => string;
  getThemeBorder: () => string;
  getThemeText: () => string;
  getThemeFocusRing: () => string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { preferences, updateColorTheme } = useUserPreferences();
  const [currentTheme, setCurrentTheme] = useState<ColorTheme>('blue-purple');
  const [isDark, setIsDark] = useState<boolean>(() => {
    // Check localStorage first
    const savedTheme = localStorage.getItem('meshfahem_theme');
    if (savedTheme === 'dark') {
      return true;
    }
    if (savedTheme === 'light') {
      return false;
    }
    // Check if document has dark class (from I18nContext)
    const hasDarkClass = document.documentElement.classList.contains('dark');
    if (hasDarkClass) {
      return true;
    }
    // Default to light mode if nothing is set
    return false;
  });

  // Initialize theme from preferences
  useEffect(() => {
    if (preferences?.color_theme) {
      setCurrentTheme(preferences.color_theme as ColorTheme);
      ErrorLogger.debug('Theme initialized from preferences', { 
        component: 'ThemeContext', 
        action: 'init',
        theme: preferences.color_theme 
      });
    }
  }, [preferences]);

  // Listen for theme changes from I18nContext if available
  useEffect(() => {
    const checkTheme = () => {
      const savedTheme = localStorage.getItem('meshfahem_theme');
      if (savedTheme === 'dark') {
        setIsDark(true);
      } else if (savedTheme === 'light') {
        setIsDark(false);
      }
      // If no saved theme, keep current state (defaults to light)
    };

    // Check on mount
    checkTheme();

    // Listen for storage changes (when I18nContext updates theme)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'meshfahem_theme') {
        checkTheme();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for custom events (in case I18nContext updates theme in same window)
    const handleThemeChange = () => {
      checkTheme();
    };
    window.addEventListener('themeChanged', handleThemeChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('themeChanged', handleThemeChange);
    };
  }, []);

  const themeColors = themeDefinitions[currentTheme];
  const activeBackground = isDark ? themeColors.background.dark : themeColors.background.light;
  const activeUI = isDark ? themeColors.ui.dark : themeColors.ui.light;

  // Inject CSS variables for dynamic theming
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--theme-bg-from', activeBackground.from);
    root.style.setProperty('--theme-bg-to', activeBackground.to);
    root.style.setProperty('--theme-ui-from', activeUI.from);
    root.style.setProperty('--theme-ui-to', activeUI.to);
    root.style.setProperty('--theme-accent', activeUI.accent);
    
    ErrorLogger.debug('CSS variables updated', { 
      component: 'ThemeContext', 
      action: 'updateCSSVars',
      theme: currentTheme,
      darkMode: isDark
    });
  }, [currentTheme, isDark, activeBackground, activeUI]);

  const setTheme = async (theme: ColorTheme) => {
    const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
    const lastChangeKey = 'theme_last_change';
    const lastChange = localStorage.getItem(lastChangeKey);
    
    // Check cooldown
    if (lastChange) {
      const timeSinceLastChange = Date.now() - parseInt(lastChange, 10);
      if (timeSinceLastChange < COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((COOLDOWN_MS - timeSinceLastChange) / 1000);
        const remainingMinutes = Math.floor(remainingSeconds / 60);
        const remainingSecs = remainingSeconds % 60;
        const errorMessage = remainingMinutes > 0 
          ? `Please wait ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''} and ${remainingSecs} second${remainingSecs !== 1 ? 's' : ''} before changing themes again`
          : `Please wait ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''} before changing themes again`;
        const error = new Error(errorMessage);
        ErrorLogger.warn('Theme change cooldown active', { 
          component: 'ThemeContext', 
          action: 'setTheme',
          theme,
          remainingSeconds,
          remainingMinutes
        });
        throw error;
      }
    }
    
    try {
      ErrorLogger.debug('Setting theme', { component: 'ThemeContext', action: 'setTheme', theme });
      
      // Update timestamp before theme change
      localStorage.setItem(lastChangeKey, Date.now().toString());
      
      setCurrentTheme(theme);
      await updateColorTheme(theme);
      ErrorLogger.info('Theme updated successfully', { component: 'ThemeContext', action: 'setTheme', theme });
    } catch (error) {
      // If it's a cooldown error, re-throw it
      if (error instanceof Error && error.message.includes('Please wait')) {
        throw error;
      }
      
      ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { 
        component: 'ThemeContext', 
        action: 'setTheme',
        theme
      });
      // Revert on error (but not for cooldown errors)
      if (preferences?.color_theme) {
        setCurrentTheme(preferences.color_theme as ColorTheme);
      }
      throw error;
    }
  };

  const getThemeGradient = (type: 'bg' | 'ui' | 'card' = 'bg'): string => {
    if (type === 'bg') {
      return `bg-gradient-to-br ${activeBackground.gradient}`;
    } else if (type === 'ui') {
      return `bg-gradient-to-r ${activeUI.gradient}`;
    } else {
      return 'bg-white dark:bg-gray-800';
    }
  };

  const getUIGradient = (): string => {
    return `bg-gradient-to-r ${activeUI.gradient}`;
  };

  const getBackgroundGradient = (): string => {
    return `bg-gradient-to-br ${activeBackground.gradient}`;
  };

  const getThemeAccent = (): string => {
    return `bg-${activeUI.accent}`;
  };

  const getThemeAccentHover = (): string => {
    return `hover:bg-${activeUI.accentHover}`;
  };

  const getThemeBorder = (): string => {
    // Map theme accents to border colors
    const borderMap: Record<ColorTheme, { light: string; dark: string }> = {
      'blue-purple': { light: 'border-indigo-600', dark: 'border-indigo-400' },
      'pink-white': { light: 'border-rose-600', dark: 'border-rose-400' },
      'green-teal': { light: 'border-emerald-600', dark: 'border-emerald-400' },
      'orange-amber': { light: 'border-amber-600', dark: 'border-amber-400' },
      'indigo-violet': { light: 'border-violet-600', dark: 'border-violet-400' },
    };
    
    const borderColors = borderMap[currentTheme];
    return isDark ? borderColors.dark : borderColors.light;
  };

  const getThemeText = (): string => {
    // Map theme accents to text colors (same as border for consistency)
    const textMap: Record<ColorTheme, { light: string; dark: string }> = {
      'blue-purple': { light: 'text-indigo-600', dark: 'text-indigo-400' },
      'pink-white': { light: 'text-rose-600', dark: 'text-rose-400' },
      'green-teal': { light: 'text-emerald-600', dark: 'text-emerald-400' },
      'orange-amber': { light: 'text-amber-600', dark: 'text-amber-400' },
      'indigo-violet': { light: 'text-violet-600', dark: 'text-violet-400' },
    };
    
    const textColors = textMap[currentTheme];
    return isDark ? textColors.dark : textColors.light;
  };

  const getThemeFocusRing = (): string => {
    // Map theme accents to focus ring colors (slightly lighter than borders for visibility)
    const focusMap: Record<ColorTheme, { light: string; dark: string }> = {
      'blue-purple': { light: 'focus:ring-indigo-500', dark: 'focus:ring-indigo-400' },
      'pink-white': { light: 'focus:ring-rose-500', dark: 'focus:ring-rose-400' },
      'green-teal': { light: 'focus:ring-emerald-500', dark: 'focus:ring-emerald-400' },
      'orange-amber': { light: 'focus:ring-amber-500', dark: 'focus:ring-amber-400' },
      'indigo-violet': { light: 'focus:ring-violet-500', dark: 'focus:ring-violet-400' },
    };
    
    const focusColors = focusMap[currentTheme];
    return isDark ? focusColors.dark : focusColors.light;
  };

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        themeColors,
        setTheme,
        getThemeGradient,
        getUIGradient,
        getBackgroundGradient,
        getThemeAccent,
        getThemeAccentHover,
        getThemeBorder,
        getThemeText,
        getThemeFocusRing,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Export themeDefinitions for use in components
export { themeDefinitions };

// Helper function to get theme gradient classes (for use outside React components)
export const getThemeGradientClasses = (
  theme: ColorTheme,
  isDark: boolean,
  type: 'bg' | 'ui' = 'bg'
): string => {
  const colors = themeDefinitions[theme];
  const activeBackground = isDark ? colors.background.dark : colors.background.light;
  const activeUI = isDark ? colors.ui.dark : colors.ui.light;
  
  if (type === 'bg') {
    return `bg-gradient-to-br ${activeBackground.gradient}`;
  } else {
    return `bg-gradient-to-r ${activeUI.gradient}`;
  }
};

// Helper function to get theme name for display
export const getThemeDisplayName = (theme: ColorTheme): string => {
  const names: Record<ColorTheme, string> = {
    'pink-white': 'Pink & White',
    'blue-purple': 'Blue & Purple',
    'green-teal': 'Green & Teal',
    'orange-amber': 'Orange & Amber',
    'indigo-violet': 'Indigo & Violet',
  };
  return names[theme];
};
