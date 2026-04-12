import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ErrorLogger } from '../utils/errorLogger';

export type ColorTheme = 'monochrome' | 'warm-neutrals' | 'sky-blue' | 'rose-pink' | 'slate-mist' | 'plum-sand';

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
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    cardBg: string;
    cardBorder: string;
    subtleBg: string;
    tutorialBg: string;
  };
  dark: {
    gradient: string;
    from: string;
    to: string;
    accent: string;
    accentHover: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    cardBg: string;
    cardBorder: string;
    subtleBg: string;
    tutorialBg: string;
  };
}

interface ThemeColors {
  background: BackgroundColors;
  ui: UIColors;
}

const themeDefinitions: Record<ColorTheme, ThemeColors> = {
  'monochrome': {
    background: {
      light: {
        gradient: 'from-gray-50 to-white',
        from: 'gray-50',
        to: 'white',
      },
      dark: {
        gradient: 'from-gray-900 to-black',
        from: 'gray-900',
        to: 'black',
      },
    },
    ui: {
      light: {
        gradient: 'from-gray-600 to-gray-700',
        from: 'gray-600',
        to: 'gray-700',
        accent: 'gray-700',
        accentHover: 'gray-800',
        textPrimary: 'text-gray-900',
        textSecondary: 'text-gray-700',
        textMuted: 'text-gray-500',
        cardBg: 'bg-white',
        cardBorder: 'border-gray-200',
        subtleBg: 'bg-gray-50',
        tutorialBg: 'bg-gray-100',
      },
      dark: {
        gradient: 'from-gray-600 to-gray-700',
        from: 'gray-600',
        to: 'gray-700',
        accent: 'gray-600',
        accentHover: 'gray-500',
        textPrimary: 'text-gray-100',
        textSecondary: 'text-gray-300',
        textMuted: 'text-gray-500',
        cardBg: 'bg-gray-800',
        cardBorder: 'border-gray-700',
        subtleBg: 'bg-gray-900',
        tutorialBg: 'bg-gray-800',
      },
    },
  },
  'warm-neutrals': {
    background: {
      light: {
        gradient: 'from-stone-50 to-amber-50',
        from: 'stone-50',
        to: 'amber-50',
      },
      dark: {
        gradient: 'from-zinc-950 via-stone-900/80 to-zinc-950',
        from: 'zinc-950',
        to: 'zinc-950',
      },
    },
    ui: {
      light: {
        gradient: 'from-amber-500 to-orange-600',
        from: 'amber-500',
        to: 'orange-600',
        accent: 'amber-600',
        accentHover: 'amber-700',
        textPrimary: 'text-stone-900',
        textSecondary: 'text-amber-900',
        textMuted: 'text-amber-700',
        cardBg: 'bg-stone-50',
        cardBorder: 'border-amber-200',
        subtleBg: 'bg-amber-50',
        tutorialBg: 'bg-amber-100',
      },
      dark: {
        gradient: 'from-amber-600 to-orange-700',
        from: 'amber-600',
        to: 'orange-700',
        accent: 'amber-600',
        accentHover: 'amber-500',
        textPrimary: 'text-stone-100',
        textSecondary: 'text-amber-200',
        textMuted: 'text-amber-400',
        cardBg: 'bg-zinc-900',
        cardBorder: 'border-amber-800/50',
        subtleBg: 'bg-zinc-950',
        tutorialBg: 'bg-amber-950/40',
      },
    },
  },
  'sky-blue': {
    background: {
      light: {
        gradient: 'from-sky-50 to-blue-50',
        from: 'sky-50',
        to: 'blue-50',
      },
      dark: {
        gradient: 'from-zinc-950 via-sky-950/20 to-zinc-950',
        from: 'zinc-950',
        to: 'zinc-950',
      },
    },
    ui: {
      light: {
        gradient: 'from-sky-500 to-blue-600',
        from: 'sky-500',
        to: 'blue-600',
        accent: 'sky-600',
        accentHover: 'sky-700',
        textPrimary: 'text-sky-900',
        textSecondary: 'text-blue-800',
        textMuted: 'text-blue-600',
        cardBg: 'bg-sky-50',
        cardBorder: 'border-blue-200',
        subtleBg: 'bg-blue-50',
        tutorialBg: 'bg-cyan-100',
      },
      dark: {
        gradient: 'from-sky-600 to-blue-700',
        from: 'sky-600',
        to: 'blue-700',
        accent: 'sky-600',
        accentHover: 'sky-500',
        textPrimary: 'text-sky-100',
        textSecondary: 'text-blue-200',
        textMuted: 'text-blue-400',
        cardBg: 'bg-zinc-900',
        cardBorder: 'border-sky-800/45',
        subtleBg: 'bg-zinc-950',
        tutorialBg: 'bg-sky-950/35',
      },
    },
  },
  'rose-pink': {
    background: {
      light: {
        gradient: 'from-rose-50 to-pink-50',
        from: 'rose-50',
        to: 'pink-50',
      },
      dark: {
        gradient: 'from-zinc-950 via-rose-950/18 to-zinc-950',
        from: 'zinc-950',
        to: 'zinc-950',
      },
    },
    ui: {
      light: {
        gradient: 'from-rose-500 to-pink-600',
        from: 'rose-500',
        to: 'pink-600',
        accent: 'rose-600',
        accentHover: 'rose-700',
        textPrimary: 'text-rose-950',
        textSecondary: 'text-rose-800',
        textMuted: 'text-rose-600',
        cardBg: 'bg-white',
        cardBorder: 'border-rose-200',
        subtleBg: 'bg-rose-50',
        tutorialBg: 'bg-pink-100',
      },
      dark: {
        gradient: 'from-rose-600 to-pink-700',
        from: 'rose-600',
        to: 'pink-700',
        accent: 'rose-600',
        accentHover: 'rose-500',
        textPrimary: 'text-rose-50',
        textSecondary: 'text-rose-200',
        textMuted: 'text-rose-400',
        cardBg: 'bg-zinc-900',
        cardBorder: 'border-rose-800/45',
        subtleBg: 'bg-zinc-950',
        tutorialBg: 'bg-rose-950/35',
      },
    },
  },
  'slate-mist': {
    background: {
      light: {
        gradient: 'from-slate-100 to-teal-50',
        from: 'slate-100',
        to: 'teal-50',
      },
      dark: {
        gradient: 'from-slate-900 to-teal-950',
        from: 'slate-900',
        to: 'teal-950',
      },
    },
    ui: {
      light: {
        gradient: 'from-teal-500 to-cyan-600',
        from: 'teal-500',
        to: 'cyan-600',
        accent: 'teal-600',
        accentHover: 'teal-700',
        textPrimary: 'text-slate-900',
        textSecondary: 'text-teal-900',
        textMuted: 'text-teal-700',
        cardBg: 'bg-slate-50',
        cardBorder: 'border-teal-200',
        subtleBg: 'bg-teal-50',
        tutorialBg: 'bg-cyan-100',
      },
      dark: {
        gradient: 'from-teal-600 to-cyan-700',
        from: 'teal-600',
        to: 'cyan-700',
        accent: 'teal-600',
        accentHover: 'teal-500',
        textPrimary: 'text-slate-100',
        textSecondary: 'text-teal-200',
        textMuted: 'text-teal-400',
        cardBg: 'bg-slate-800',
        cardBorder: 'border-teal-700',
        subtleBg: 'bg-slate-900',
        tutorialBg: 'bg-teal-900',
      },
    },
  },
  'plum-sand': {
    background: {
      light: {
        gradient: 'from-stone-100 to-rose-100',
        from: 'stone-100',
        to: 'rose-100',
      },
      dark: {
        gradient: 'from-stone-900 to-rose-950',
        from: 'stone-900',
        to: 'rose-950',
      },
    },
    ui: {
      light: {
        gradient: 'from-violet-400 to-rose-400',
        from: 'violet-400',
        to: 'rose-400',
        accent: 'violet-500',
        accentHover: 'violet-600',
        textPrimary: 'text-stone-900',
        textSecondary: 'text-violet-900',
        textMuted: 'text-violet-700',
        cardBg: 'bg-stone-50',
        cardBorder: 'border-rose-200',
        subtleBg: 'bg-rose-50',
        tutorialBg: 'bg-violet-100',
      },
      dark: {
        gradient: 'from-violet-600 to-rose-600',
        from: 'violet-600',
        to: 'rose-600',
        accent: 'violet-500',
        accentHover: 'violet-400',
        textPrimary: 'text-stone-100',
        textSecondary: 'text-violet-200',
        textMuted: 'text-rose-400',
        cardBg: 'bg-stone-800',
        cardBorder: 'border-rose-800',
        subtleBg: 'bg-stone-900',
        tutorialBg: 'bg-violet-900',
      },
    },
  },
};

interface ThemeContextType {
  currentTheme: ColorTheme;
  themeColors: ThemeColors;
  setTheme: (theme: ColorTheme, updateDatabase?: () => Promise<void>) => Promise<void>;
  getThemeGradient: (type?: 'bg' | 'ui' | 'card') => string;
  getUIGradient: () => string;
  getBackgroundGradient: () => string;
  getThemeAccent: () => string;
  getThemeAccentHover: () => string;
  getThemeBorder: () => string;
  getThemeText: () => string;
  getThemeFocusRing: () => string;
  getThemeSolid: (type?: 'bg' | 'ui' | 'card') => string;
  getThemeSubtle: (type?: 'bg' | 'ui' | 'card') => string;
  getThemeTextPrimary: () => string;
  getThemeTextSecondary: () => string;
  getThemeTextMuted: () => string;
  getThemeCardBg: () => string;
  getThemeCardBorder: () => string;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'meshfahem_color_theme';

/** Valid slugs for color_theme (keep in sync with DB constraint + Profile picker). */
export const VALID_COLOR_THEMES: ColorTheme[] = [
  'monochrome',
  'warm-neutrals',
  'sky-blue',
  'rose-pink',
  'slate-mist',
  'plum-sand',
];

const LEGACY_COLOR_THEME_MAP: Record<string, ColorTheme> = {
  'cool-neutrals': 'sky-blue',
  'soft-minimal': 'warm-neutrals',
  'earth-tones': 'sky-blue',
};

/** Coerce API / legacy DB values to a valid ColorTheme (avoids missing themeDefinitions entries). */
export function normalizeColorTheme(raw: string | null | undefined): ColorTheme {
  if (!raw) return 'sky-blue';
  const mapped = LEGACY_COLOR_THEME_MAP[raw] ?? raw;
  if (VALID_COLOR_THEMES.includes(mapped as ColorTheme)) {
    return mapped as ColorTheme;
  }
  return 'sky-blue';
}

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize theme from localStorage
  const [currentTheme, setCurrentTheme] = useState<ColorTheme>(() => {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    const savedTheme = raw ? LEGACY_COLOR_THEME_MAP[raw] ?? raw : null;
    if (savedTheme && VALID_COLOR_THEMES.includes(savedTheme as ColorTheme)) {
      return savedTheme as ColorTheme;
    }
    return 'sky-blue';
  });
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

  const setTheme = async (theme: ColorTheme, updateDatabase?: () => Promise<void>) => {
    ErrorLogger.debug('Setting theme', { component: 'ThemeContext', action: 'setTheme', theme });
    
    // Update local state and localStorage immediately
    setCurrentTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    
    // Optionally update database if callback provided
    if (updateDatabase) {
      try {
        await updateDatabase();
      } catch (error) {
        ErrorLogger.warn('Failed to update theme in database, but localStorage updated', { 
          component: 'ThemeContext', 
          action: 'setTheme', 
          theme,
          error: error instanceof Error ? error.message : String(error)
        });
        // Don't throw - localStorage update is sufficient
      }
    }
    
    ErrorLogger.info('Theme updated successfully', { component: 'ThemeContext', action: 'setTheme', theme });
  };

  const getThemeGradient = (type: 'bg' | 'ui' | 'card' = 'bg'): string => {
    // For backward compatibility, but now returns solid colors
    return getThemeSolid(type);
  };

  const getThemeSolid = (type: 'bg' | 'ui' | 'card' = 'bg'): string => {
    if (type === 'bg') {
      // Return theme-specific background color
      const bgColor = isDark ? activeBackground.from : activeBackground.to;
      // Map color names to Tailwind classes
      const bgClassMap: Record<string, string> = {
        'gray-50': 'bg-gray-50',
        'white': 'bg-white',
        'gray-900': 'bg-gray-900',
        'black': 'bg-black',
        'stone-50': 'bg-stone-50',
        'amber-50': 'bg-amber-50',
        'stone-900': 'bg-stone-900',
        'amber-900': 'bg-amber-900',
        'slate-50': 'bg-slate-50',
        'slate-100': 'bg-slate-100',
        'slate-900': 'bg-slate-900',
        'teal-50': 'bg-teal-50',
        'teal-950': 'bg-teal-950',
        'stone-100': 'bg-stone-100',
        'rose-100': 'bg-rose-100',
        'sky-50': 'bg-sky-50',
        'blue-50': 'bg-blue-50',
        'sky-900': 'bg-sky-900',
        'blue-900': 'bg-blue-900',
        'gray-800': 'bg-gray-800',
        'rose-50': 'bg-rose-50',
        'pink-50': 'bg-pink-50',
        'rose-950': 'bg-rose-950',
        'pink-950': 'bg-pink-950',
        'rose-900': 'bg-rose-900',
      };
      return bgClassMap[bgColor] || `bg-${bgColor}`;
    } else if (type === 'ui') {
      // Return theme-specific UI accent color
      const accentClassMap: Record<string, string> = {
        'gray-700': 'bg-gray-700',
        'gray-300': 'bg-gray-300',
        'amber-600': 'bg-amber-600',
        'amber-400': 'bg-amber-400',
        'slate-600': 'bg-slate-600',
        'slate-400': 'bg-slate-400',
        'sky-600': 'bg-sky-600',
        'sky-400': 'bg-sky-400',
        'gray-600': 'bg-gray-600',
        'gray-400': 'bg-gray-400',
        'rose-600': 'bg-rose-600',
        'rose-400': 'bg-rose-400',
        'rose-700': 'bg-rose-700',
        'teal-600': 'bg-teal-600',
        'teal-400': 'bg-teal-400',
        'cyan-600': 'bg-cyan-600',
        'cyan-700': 'bg-cyan-700',
        'violet-500': 'bg-violet-500',
        'violet-600': 'bg-violet-600',
        'violet-400': 'bg-violet-400',
      };
      return accentClassMap[activeUI.accent] || `bg-${activeUI.accent}`;
    } else {
      // Return theme-specific card background color
      return activeUI.cardBg;
    }
  };

  const getThemeSubtle = (type: 'bg' | 'ui' | 'card' = 'bg'): string => {
    if (type === 'bg') {
      // Return theme-specific subtle background color
      return activeUI.subtleBg;
    } else if (type === 'ui') {
      // Return theme-specific subtle UI color (lighter version of accent)
      const subtleUIMap: Record<ColorTheme, { light: string; dark: string }> = {
        'monochrome': { light: 'bg-gray-100', dark: 'bg-gray-700' },
        'warm-neutrals': { light: 'bg-amber-100', dark: 'bg-amber-800' },
        'sky-blue': { light: 'bg-blue-100', dark: 'bg-blue-800' },
        'rose-pink': { light: 'bg-rose-100', dark: 'bg-rose-800' },
        'slate-mist': { light: 'bg-teal-100', dark: 'bg-teal-900' },
        'plum-sand': { light: 'bg-violet-100', dark: 'bg-violet-900' },
      };
      return isDark ? subtleUIMap[currentTheme].dark : subtleUIMap[currentTheme].light;
    } else {
      // Return theme-specific card subtle color
      return activeUI.cardBg;
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
    // Use theme-specific card border color
    return activeUI.cardBorder;
  };

  const getThemeText = (): string => {
    // Use theme-specific primary text color
    return activeUI.textPrimary;
  };

  const getThemeFocusRing = (): string => {
    // Use theme-specific accent color for focus ring (slightly lighter for visibility)
    const focusColor = isDark ? activeUI.accentHover : activeUI.accent;
    return `focus:ring-${focusColor}`;
  };

  const getThemeTextPrimary = (): string => {
    return activeUI.textPrimary;
  };

  const getThemeTextSecondary = (): string => {
    return activeUI.textSecondary;
  };

  const getThemeTextMuted = (): string => {
    return activeUI.textMuted;
  };

  const getThemeCardBg = (): string => {
    return activeUI.cardBg;
  };

  const getThemeCardBorder = (): string => {
    return activeUI.cardBorder;
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
        getThemeSolid,
        getThemeSubtle,
        getThemeTextPrimary,
        getThemeTextSecondary,
        getThemeTextMuted,
        getThemeCardBg,
        getThemeCardBorder,
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
    'monochrome': 'Monochrome',
    'warm-neutrals': 'Warm Neutrals',
    'sky-blue': 'Sky Blue',
    'rose-pink': 'Rose Pink',
    'slate-mist': 'Slate Mist',
    'plum-sand': 'Plum Sand',
  };
  return names[theme];
};
