import React, { useState, useEffect } from 'react';
import { Search, UserPlus, Loader2, Users } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { useDebounce } from '../../../hooks/useDebounce';
import { ErrorLogger } from '../../../utils/errorLogger';
import { useToast } from '../../Toast/Toast';

interface UserSearchProps {
  onAddFriend: (userId: string) => void;
}

interface UserProfile {
  id: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
}

const getInitials = (name: string | null, username: string): string => {
  if (name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
  return username.slice(0, 2).toUpperCase();
};

export const UserSearch: React.FC<UserSearchProps> = ({ onAddFriend }) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const {
    getThemeCardBg,
    getThemeCardBorder,
    getThemeTextPrimary,
    getThemeTextSecondary,
    getThemeTextMuted,
    getThemeSubtle,
  } = useTheme();
  const { error: showErrorToast } = useToast();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query.trim(), 300);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;

    const searchUsers = async () => {
      setSearching(true);
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, display_name, username, avatar_url')
          .ilike('username', `%${debouncedQuery}%`)
          .neq('id', user?.id ?? '')
          .limit(10);

        if (error) throw error;
        if (!cancelled) {
          setResults((data as UserProfile[]) || []);
        }
      } catch (err) {
        ErrorLogger.log(err as Error, { component: 'UserSearch', action: 'searchUsers' });
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    };

    searchUsers();
    return () => { cancelled = true; };
  }, [debouncedQuery, user?.id]);

  const handleAdd = async (userId: string) => {
    setAddingId(userId);
    try {
      onAddFriend(userId);
    } catch (err) {
      showErrorToast(t('social.add_friend_error') || 'Failed to send friend request');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div>
      {/* Search Input */}
      <div className="relative mb-4">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${getThemeTextMuted()}`} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('social.search_users_placeholder') || 'Search by @username...'}
          className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${getThemeCardBorder()} ${getThemeCardBg()} ${getThemeTextPrimary()} placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm`}
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        )}
      </div>

      {/* Results */}
      {debouncedQuery.length >= 2 && !searching && results.length === 0 && (
        <div className={`text-center py-8 ${getThemeTextMuted()}`}>
          <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t('social.no_users_found') || 'No users found'}</p>
        </div>
      )}

      <div className="space-y-2">
        {results.map((profile) => (
          <div
            key={profile.id}
            className={`flex items-center gap-3 p-3 rounded-xl border ${getThemeCardBorder()} ${getThemeCardBg()} hover:opacity-90 transition-all`}
          >
            {/* Avatar */}
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name || profile.username}
                className="w-10 h-10 rounded-full object-cover border-2 border-emerald-200 dark:border-emerald-800"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold text-sm">
                {getInitials(profile.display_name, profile.username)}
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${getThemeTextPrimary()}`}>
                {profile.display_name || profile.username}
              </p>
              <p className={`text-xs truncate ${getThemeTextMuted()}`}>
                @{profile.username}
              </p>
            </div>

            {/* Add button */}
            <button
              onClick={() => handleAdd(profile.id)}
              disabled={addingId === profile.id}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              {addingId === profile.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UserPlus className="w-3.5 h-3.5" />
              )}
              {t('social.add_friend') || 'Add Friend'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
