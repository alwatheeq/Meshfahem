import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { handleSupabaseError, isOffline } from '../utils/errorHandler';
import { ErrorLogger } from '../utils/errorLogger';
import type { ColorTheme } from './ThemeContext';

export type SidebarMode = 'collapsible' | 'pinnable';

interface UserPreferences {
  sidebar_mode: SidebarMode;
  color_theme: ColorTheme;
}

interface UserPreferencesContextType {
  preferences: UserPreferences | null;
  loading: boolean;
  updateSidebarMode: (mode: SidebarMode) => Promise<void>;
  updateColorTheme: (theme: ColorTheme) => Promise<void>;
  refreshPreferences: () => Promise<void>;
}

const UserPreferencesContext = createContext<UserPreferencesContextType | undefined>(undefined);

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
      setPreferences({ sidebar_mode: 'collapsible', color_theme: 'blue-purple' });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('user_preferences')
        .select('sidebar_mode, color_theme')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        handleSupabaseError(error, { component: 'UserPreferencesContext', action: 'fetchPreferences', step: 'fetch', userId: user.id });
        ErrorLogger.error(error, { component: 'UserPreferencesContext', action: 'fetchPreferences', step: 'fetch', userId: user.id });
        setPreferences({ sidebar_mode: 'collapsible', color_theme: 'blue-purple' });
      } else if (data) {
        setPreferences({ 
          sidebar_mode: data.sidebar_mode as SidebarMode,
          color_theme: (data.color_theme as ColorTheme) || 'blue-purple'
        });
      } else {
        const { data: newPrefs, error: insertError } = await supabase
          .from('user_preferences')
          .insert({ user_id: user.id, sidebar_mode: 'collapsible', color_theme: 'blue-purple' })
          .select('sidebar_mode, color_theme')
          .single();

        if (insertError) {
          handleSupabaseError(insertError, { component: 'UserPreferencesContext', action: 'fetchPreferences', step: 'create', userId: user.id });
          ErrorLogger.error(insertError, { component: 'UserPreferencesContext', action: 'fetchPreferences', step: 'create', userId: user.id });
          setPreferences({ sidebar_mode: 'collapsible', color_theme: 'blue-purple' });
        } else {
          setPreferences({ 
            sidebar_mode: newPrefs.sidebar_mode as SidebarMode,
            color_theme: (newPrefs.color_theme as ColorTheme) || 'blue-purple'
          });
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'UserPreferencesContext', action: 'fetchPreferences', userId: user.id });
      ErrorLogger.error(err, { component: 'UserPreferencesContext', action: 'fetchPreferences', userId: user.id });
      setPreferences({ sidebar_mode: 'collapsible', color_theme: 'blue-purple' });
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
      // Update local state even when offline
      setPreferences((prev) => prev ? { ...prev, sidebar_mode: mode } : { sidebar_mode: mode, color_theme: 'blue-purple' });
      return;
    }

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            sidebar_mode: mode,
            color_theme: preferences?.color_theme || 'blue-purple',
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

      setPreferences((prev) => prev ? { ...prev, sidebar_mode: mode } : { sidebar_mode: mode, color_theme: 'blue-purple' });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'UserPreferencesContext', action: 'updateSidebarMode', userId: user.id, mode });
      ErrorLogger.error(err, { component: 'UserPreferencesContext', action: 'updateSidebarMode', userId: user.id, mode });
      throw error;
    }
  };

  const updateColorTheme = async (theme: ColorTheme) => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'UserPreferencesContext', action: 'updateColorTheme', userId: user.id });
      // Update local state even when offline
      setPreferences((prev) => prev ? { ...prev, color_theme: theme } : { sidebar_mode: 'collapsible', color_theme: theme });
      return;
    }

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            sidebar_mode: preferences?.sidebar_mode || 'collapsible',
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

      setPreferences((prev) => prev ? { ...prev, color_theme: theme } : { sidebar_mode: 'collapsible', color_theme: theme });
      ErrorLogger.info('Color theme updated successfully', { component: 'UserPreferencesContext', action: 'updateColorTheme', userId: user.id, theme });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'UserPreferencesContext', action: 'updateColorTheme', userId: user.id, theme });
      ErrorLogger.error(err, { component: 'UserPreferencesContext', action: 'updateColorTheme', userId: user.id, theme });
      throw error;
    }
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
        updateColorTheme,
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
