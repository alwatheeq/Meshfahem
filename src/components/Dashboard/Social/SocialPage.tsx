import React, { useState, useEffect, useCallback } from 'react';
import { Users, UsersRound, Copy, Check, AtSign, Loader2 } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../Toast/Toast';
import { supabase } from '../../../lib/supabase';
import { ErrorLogger } from '../../../utils/errorLogger';
import { UsernameSetup } from './UsernameSetup';
import { FriendsPage } from './FriendsPage';
import { StudyGroupsPage } from './StudyGroupsPage';

type TabKey = 'friends' | 'groups';

export const SocialPage: React.FC = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const {
    getThemeCardBg,
    getThemeCardBorder,
    getThemeTextPrimary,
    getThemeTextSecondary,
    getThemeTextMuted,
    getThemeGradient,
    getThemeSubtle,
  } = useTheme();
  const { success: showSuccessToast, error: showErrorToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>('friends');
  const [username, setUsername] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [showUsernameSetup, setShowUsernameSetup] = useState(false);
  const [copiedUsername, setCopiedUsername] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user?.id) return;
    setLoadingProfile(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.username) {
        setUsername(data.username);
      } else {
        setUsername(null);
        setShowUsernameSetup(true);
      }
    } catch (err) {
      ErrorLogger.log(err as Error, { component: 'SocialPage', action: 'fetchProfile' });
      showErrorToast(t('social.profile_load_error') || 'Failed to load profile');
    } finally {
      setLoadingProfile(false);
    }
  }, [user?.id, showErrorToast, t]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSaveUsername = async (newUsername: string) => {
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          id: user.id,
          username: newUsername,
        }, { onConflict: 'id' });

      if (error) throw error;

      setUsername(newUsername);
      setShowUsernameSetup(false);
      showSuccessToast(t('social.username_saved') || 'Username saved!');
    } catch (err) {
      ErrorLogger.log(err as Error, { component: 'SocialPage', action: 'saveUsername' });
      showErrorToast(t('social.username_save_error') || 'Failed to save username');
    }
  };

  const handleCopyUsername = () => {
    if (!username) return;
    navigator.clipboard.writeText(`@${username}`).then(() => {
      setCopiedUsername(true);
      setTimeout(() => setCopiedUsername(false), 2000);
    });
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    {
      key: 'friends',
      label: t('social.friends') || 'Friends',
      icon: <Users className="w-4 h-4" />,
    },
    {
      key: 'groups',
      label: t('social.groups') || 'Groups',
      icon: <UsersRound className="w-4 h-4" />,
    },
  ];

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className={`text-xl font-bold ${getThemeTextPrimary()}`}>
            {t('social.title') || 'Social'}
          </h2>
          <p className={`text-sm ${getThemeTextMuted()}`}>
            {t('social.subtitle') || 'Connect with friends and study groups'}
          </p>
        </div>

        {username && (
          <button
            onClick={handleCopyUsername}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border ${getThemeCardBorder()} ${getThemeCardBg()} hover:opacity-80 transition-colors group`}
            title={t('social.copy_username') || 'Copy username'}
          >
            <AtSign className="w-3.5 h-3.5 text-emerald-500" />
            <span className={`text-sm font-medium ${getThemeTextPrimary()}`}>{username}</span>
            {copiedUsername ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" />
            )}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className={`flex items-center gap-1 p-1 rounded-xl ${getThemeSubtle()} border ${getThemeCardBorder()}`}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all flex-1 justify-center ${
                isActive
                  ? `${getThemeCardBg()} text-emerald-600 dark:text-emerald-400 shadow-sm`
                  : `${getThemeTextMuted()} hover:opacity-80`
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'friends' && <FriendsPage />}
        {activeTab === 'groups' && <StudyGroupsPage />}
      </div>

      {/* Username Setup Modal */}
      <UsernameSetup
        isOpen={showUsernameSetup}
        onClose={() => setShowUsernameSetup(false)}
        onSave={handleSaveUsername}
      />
    </div>
  );
};
