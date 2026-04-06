import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { handleSupabaseError, isOffline } from '../utils/errorHandler';
import { ErrorLogger } from '../utils/errorLogger';
import { normalizeColorTheme } from './ThemeContext';

export type SidebarMode = 'collapsible' | 'pinnable';

interface UserPreferences {
  sidebar_mode: SidebarMode;
  free_form_mode_enabled: boolean;
  color_theme?: string;
  /** Whether hover-over-nav-item TTS is enabled. Stored in localStorage only. */
  tts_hover_enabled: boolean;
}

interface UserPreferencesContextType {
  preferences: UserPreferences | null;
  loading: boolean;
  updateSidebarMode: (mode: SidebarMode) => Promise<void>;
  updateFreeFormMode: (enabled: boolean) => Promise<void>;
  updateColorTheme: (theme: string) => Promise<void>;
  updateTtsHoverEnabled: (enabled: boolean) => void;
  refreshPreferences: () => Promise<void>;
}

const TTS_HOVER_STORAGE_KEY = 'meshfahem_tts_hover';

const UserPreferencesContext = createContext<UserPreferencesContextType | undefined>(undefined);

const readTtsHoverEnabled = (): boolean => {
  try {
    const stored = localStorage.getItem(TTS_HOVER_STORAGE_KEY);
    return stored === null ? false : stored === 'true';
  } catch {
    return false;
  }
};

export const UserPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPreferences = async () => {
    if (!user) {
      setPreferences(null);
      setLoading(false);
      return;
    }

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'UserPreferencesContext', action: 'fetchPreferences', userId: user.id });
      setPreferences({ sidebar_mode: 'collapsible', free_form_mode_enabled: false, tts_hover_enabled: readTtsHoverEnabled() });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('user_preferences')
        .select('sidebar_mode, free_form_mode_enabled, color_theme')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        handleSupabaseError(error, { component: 'UserPreferencesContext', action: 'fetchPreferences', step: 'fetch', userId: user.id });
        ErrorLogger.error(error, { component: 'UserPreferencesContext', action: 'fetchPreferences', step: 'fetch', userId: user.id });
        setPreferences({ sidebar_mode: 'collapsible', free_form_mode_enabled: false, tts_hover_enabled: readTtsHoverEnabled() });
      } else if (data) {
        setPreferences({ 
          sidebar_mode: data.sidebar_mode as SidebarMode,
          free_form_mode_enabled: data.free_form_mode_enabled ?? false,
          color_theme: normalizeColorTheme(data.color_theme),
          tts_hover_enabled: readTtsHoverEnabled(),
        });
      } else {
        const { data: newPrefs, error: insertError } = await supabase
          .from('user_preferences')
          .insert({ user_id: user.id, sidebar_mode: 'collapsible', free_form_mode_enabled: false, color_theme: 'sky-blue' })
          .select('sidebar_mode, free_form_mode_enabled, color_theme')
          .single();

        if (insertError) {
          handleSupabaseError(insertError, { component: 'UserPreferencesContext', action: 'fetchPreferences', step: 'create', userId: user.id });
          ErrorLogger.error(insertError, { component: 'UserPreferencesContext', action: 'fetchPreferences', step: 'create', userId: user.id });
          setPreferences({ sidebar_mode: 'collapsible', free_form_mode_enabled: false, tts_hover_enabled: readTtsHoverEnabled() });
        } else {
          setPreferences({ 
            sidebar_mode: newPrefs.sidebar_mode as SidebarMode,
            free_form_mode_enabled: newPrefs.free_form_mode_enabled ?? false,
            color_theme: normalizeColorTheme(newPrefs.color_theme),
            tts_hover_enabled: readTtsHoverEnabled(),
          });
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'UserPreferencesContext', action: 'fetchPreferences', userId: user.id });
      ErrorLogger.error(err, { component: 'UserPreferencesContext', action: 'fetchPreferences', userId: user.id });
      setPreferences({ sidebar_mode: 'collapsible', free_form_mode_enabled: false, tts_hover_enabled: readTtsHoverEnabled() });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreferences();
  }, [user]);

  const updateSidebarMode = async (mode: SidebarMode) => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'UserPreferencesContext', action: 'updateSidebarMode', userId: user.id });
      setPreferences((prev) => prev ? { ...prev, sidebar_mode: mode } : { sidebar_mode: mode, free_form_mode_enabled: false, tts_hover_enabled: readTtsHoverEnabled() });
      return;
    }

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            sidebar_mode: mode,
            free_form_mode_enabled: preferences?.free_form_mode_enabled ?? false,
            color_theme: normalizeColorTheme(preferences?.color_theme),
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) {
        handleSupabaseError(error, { component: 'UserPreferencesContext', action: 'updateSidebarMode', userId: user.id, mode });
        ErrorLogger.error(error, { component: 'UserPreferencesContext', action: 'updateSidebarMode', userId: user.id, mode });
        throw error;
      }

      setPreferences((prev) => prev ? { ...prev, sidebar_mode: mode } : { sidebar_mode: mode, free_form_mode_enabled: false });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'UserPreferencesContext', action: 'updateSidebarMode', userId: user.id, mode });
      ErrorLogger.error(err, { component: 'UserPreferencesContext', action: 'updateSidebarMode', userId: user.id, mode });
      throw error;
    }
  };

  const updateFreeFormMode = async (enabled: boolean) => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'UserPreferencesContext', action: 'updateFreeFormMode', userId: user.id });
      setPreferences((prev) => prev ? { ...prev, free_form_mode_enabled: enabled } : { sidebar_mode: 'collapsible', free_form_mode_enabled: enabled, tts_hover_enabled: readTtsHoverEnabled() });
      return;
    }

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            sidebar_mode: preferences?.sidebar_mode || 'collapsible',
            free_form_mode_enabled: enabled,
            color_theme: normalizeColorTheme(preferences?.color_theme),
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) {
        handleSupabaseError(error, { component: 'UserPreferencesContext', action: 'updateFreeFormMode', userId: user.id, enabled });
        ErrorLogger.error(error, { component: 'UserPreferencesContext', action: 'updateFreeFormMode', userId: user.id, enabled });
        throw error;
      }

      setPreferences((prev) => prev ? { ...prev, free_form_mode_enabled: enabled } : { sidebar_mode: 'collapsible', free_form_mode_enabled: enabled });
      ErrorLogger.info('Free-form mode preference updated', { component: 'UserPreferencesContext', action: 'updateFreeFormMode', userId: user.id, enabled });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'UserPreferencesContext', action: 'updateFreeFormMode', userId: user.id, enabled });
      ErrorLogger.error(err, { component: 'UserPreferencesContext', action: 'updateFreeFormMode', userId: user.id, enabled });
      throw error;
    }
  };

  const updateColorTheme = async (theme: string) => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'UserPreferencesContext', action: 'updateColorTheme', userId: user.id });
      setPreferences((prev) => prev ? { ...prev, color_theme: theme } : { sidebar_mode: 'collapsible', free_form_mode_enabled: false, color_theme: theme, tts_hover_enabled: readTtsHoverEnabled() });
      return;
    }

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            sidebar_mode: preferences?.sidebar_mode || 'collapsible',
            free_form_mode_enabled: preferences?.free_form_mode_enabled ?? false,
            color_theme: theme,
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) {
        handleSupabaseError(error, { component: 'UserPreferencesContext', action: 'updateColorTheme', userId: user.id, theme });
        ErrorLogger.error(error, { component: 'UserPreferencesContext', action: 'updateColorTheme', userId: user.id, theme });
        throw error;
      }

      setPreferences((prev) => prev ? { ...prev, color_theme: theme } : { sidebar_mode: 'collapsible', free_form_mode_enabled: false, color_theme: theme });
      ErrorLogger.info('Color theme preference updated', { component: 'UserPreferencesContext', action: 'updateColorTheme', userId: user.id, theme });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'UserPreferencesContext', action: 'updateColorTheme', userId: user.id, theme });
      ErrorLogger.error(err, { component: 'UserPreferencesContext', action: 'updateColorTheme', userId: user.id, theme });
      throw error;
    }
  };

  const updateTtsHoverEnabled = (enabled: boolean) => {
    try {
      localStorage.setItem(TTS_HOVER_STORAGE_KEY, String(enabled));
    } catch {
      // ignore storage errors
    }
    setPreferences((prev) =>
      prev ? { ...prev, tts_hover_enabled: enabled } : null
    );
  };

  const refreshPreferences = async () => {
    await fetchPreferences();
  };

  return (
    <UserPreferencesContext.Provider
      value={{
        preferences,
        loading,
        updateSidebarMode,
        updateFreeFormMode,
        updateColorTheme,
        updateTtsHoverEnabled,
        refreshPreferences,
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  );
};

export const useUserPreferences = () => {
  const context = useContext(UserPreferencesContext);
  if (context === undefined) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider');
  }
  return context;
};
