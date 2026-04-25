import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, UserPlus, Check, X, Users, Loader2 } from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../contexts/I18nContext';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../Toast/Toast';
import { supabase } from '../../../lib/supabase';
import { toErrorMessage } from '../../../utils/errorHandler';

interface UserProfile {
  id: string;
  display_name: string | null;
  username: string | null;
}

interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
  requester: UserProfile;
  addressee: UserProfile;
}

export const FriendsPanel: React.FC = () => {
  const { getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle, getThemeGradient } = useTheme();
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const { error: showError, success: showSuccess } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingIncoming, setPendingIncoming] = useState<FriendshipRow[]>([]);
  const [friends, setFriends] = useState<FriendshipRow[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [sendingRequest, setSendingRequest] = useState<string | null>(null);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchGenRef = useRef(0);

  const fetchFriendships = useCallback(
    async (gen: number) => {
      if (!user) {
        setLoadingFriends(false);
        return;
      }

      setLoadingFriends(true);

      try {
        const [incomingRes, friendsRes] = await Promise.all([
          supabase
            .from('user_friendships')
            .select('id, requester_id, addressee_id, status, created_at')
            .eq('addressee_id', user.id)
            .eq('status', 'pending'),
          supabase
            .from('user_friendships')
            .select('id, requester_id, addressee_id, status, created_at')
            .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
            .eq('status', 'accepted'),
        ]);

        if (gen !== fetchGenRef.current) return;

        if (incomingRes.error || friendsRes.error) {
          showError(toErrorMessage(incomingRes.error ?? friendsRes.error));
          return;
        }

        const inc = incomingRes.data ?? [];
        const fr = friendsRes.data ?? [];

        const ids = new Set<string>();
        for (const r of inc) {
          ids.add(r.requester_id);
          ids.add(r.addressee_id);
        }
        for (const r of fr) {
          ids.add(r.requester_id);
          ids.add(r.addressee_id);
        }
        const idList = [...ids];

        const profileMap: Record<string, UserProfile> = {};
        if (idList.length > 0) {
          const { data: profs, error: pErr } = await supabase
            .from('user_profiles')
            .select('id, display_name, username')
            .in('id', idList);

          if (gen !== fetchGenRef.current) return;

          if (pErr) {
            showError(toErrorMessage(pErr));
            return;
          }
          for (const p of profs ?? []) {
            profileMap[p.id] = p as UserProfile;
          }
        }

        if (gen !== fetchGenRef.current) return;

        const enrich = (
          rows: Array<{
            id: string;
            requester_id: string;
            addressee_id: string;
            status: string;
            created_at: string;
          }>
        ): FriendshipRow[] =>
          rows.map((r) => ({
            ...r,
            requester:
              profileMap[r.requester_id] ?? {
                id: r.requester_id,
                display_name: null,
                username: null,
              },
            addressee:
              profileMap[r.addressee_id] ?? {
                id: r.addressee_id,
                display_name: null,
                username: null,
              },
          }));

        setPendingIncoming(enrich(inc));
        setFriends(enrich(fr));
      } finally {
        if (gen === fetchGenRef.current) {
          setLoadingFriends(false);
        }
      }
    },
    [user, showError]
  );

  useEffect(() => {
    const gen = ++fetchGenRef.current;
    void fetchFriendships(gen);
    return () => {
      fetchGenRef.current += 1;
    };
  }, [fetchFriendships]);

  const searchUsers = useCallback(
    async (query: string) => {
      if (!user || query.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      const { data, error } = await supabase.rpc('search_users_by_username', {
        p_query: query.trim(),
      });

      setIsSearching(false);

      if (error) {
        showError(toErrorMessage(error));
        return;
      }

      setSearchResults((data ?? []) as UserProfile[]);
    },
    [user, showError],
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => searchUsers(value), 300);
  };

  const sendFriendRequest = async (targetId: string) => {
    if (!user) return;

    setSendingRequest(targetId);
    const { error } = await supabase
      .from('user_friendships')
      .insert({ requester_id: user.id, addressee_id: targetId, status: 'pending' });

    setSendingRequest(null);

    if (error) {
      showError(toErrorMessage(error));
      return;
    }

    showSuccess(t('social.add_friend'));
    setSearchResults((prev) => prev.filter((u) => u.id !== targetId));
  };

  const handleRequest = async (friendshipId: string, action: 'accepted' | 'rejected') => {
    setProcessingRequest(friendshipId);
    const { error } = await supabase
      .from('user_friendships')
      .update({ status: action })
      .eq('id', friendshipId);

    setProcessingRequest(null);

    if (error) {
      showError(toErrorMessage(error));
      return;
    }

    void fetchFriendships(++fetchGenRef.current);
  };

  const getFriendProfile = (row: FriendshipRow): UserProfile => {
    if (!user) return row.requester;
    return row.requester_id === user.id ? row.addressee : row.requester;
  };

  const Avatar: React.FC<{ name: string | null; size?: string }> = ({ name, size = 'h-10 w-10' }) => (
    <div className={`${size} rounded-full bg-gradient-to-br ${getThemeGradient()} flex items-center justify-center text-white font-semibold text-sm shrink-0`}>
      {(name || '?')[0].toUpperCase()}
    </div>
  );

  return (
    <div className="space-y-6" dir={dir}>
      {/* Search */}
      <div className={`p-4 rounded-xl border ${getThemeCardBorder()} ${getThemeCardBg()}`}>
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${getThemeTextMuted()}`} />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder={t('social.search_friends')}
            className={`w-full pl-10 pr-4 py-2.5 rounded-lg border ${getThemeCardBorder()} ${getThemeSubtle()} ${getThemeTextPrimary()} placeholder:${getThemeTextMuted()} focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors`}
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-400" />
          )}
        </div>

        {searchResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {searchResults.map((profile) => (
              <div
                key={profile.id}
                className={`flex items-center justify-between p-3 rounded-lg ${getThemeSubtle()}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={profile.display_name} />
                  <div className="min-w-0">
                    <p className={`font-medium truncate ${getThemeTextPrimary()}`}>
                      {profile.display_name || profile.username}
                    </p>
                    {profile.username && (
                      <p className={`text-sm truncate ${getThemeTextMuted()}`}>@{profile.username}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => sendFriendRequest(profile.id)}
                  disabled={sendingRequest === profile.id}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r ${getThemeGradient()} hover:opacity-90 transition-opacity disabled:opacity-50`}
                >
                  {sendingRequest === profile.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  {t('social.add_friend')}
                </button>
              </div>
            ))}
          </div>
        )}

        {searchQuery.trim().length >= 2 && !isSearching && searchResults.length === 0 && (
          <p className={`text-sm text-center mt-3 ${getThemeTextMuted()}`}>{t('social.no_results')}</p>
        )}
      </div>

      {/* Pending Incoming Requests */}
      {pendingIncoming.length > 0 && (
        <div className={`p-4 rounded-xl border ${getThemeCardBorder()} ${getThemeCardBg()}`}>
          <h3 className={`text-sm font-semibold uppercase tracking-wide mb-3 ${getThemeTextSecondary()}`}>
            {t('social.pending_requests')}
          </h3>
          <div className="space-y-2">
            {pendingIncoming.map((req) => {
              const profile = req.requester;
              return (
                <div
                  key={req.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${getThemeSubtle()}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={profile.display_name} />
                    <div className="min-w-0">
                      <p className={`font-medium truncate ${getThemeTextPrimary()}`}>
                        {profile.display_name || profile.username}
                      </p>
                      {profile.username && (
                        <p className={`text-sm truncate ${getThemeTextMuted()}`}>@{profile.username}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRequest(req.id, 'accepted')}
                      disabled={processingRequest === req.id}
                      className="p-2 rounded-lg bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors"
                      aria-label={t('social.accept')}
                    >
                      {processingRequest === req.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleRequest(req.id, 'rejected')}
                      disabled={processingRequest === req.id}
                      className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                      aria-label={t('social.reject')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Friends List */}
      <div className={`p-4 rounded-xl border ${getThemeCardBorder()} ${getThemeCardBg()}`}>
        <h3 className={`text-sm font-semibold uppercase tracking-wide mb-3 flex items-center gap-2 ${getThemeTextSecondary()}`}>
          <Users className="h-4 w-4" />
          {t('social.friends_list')}
        </h3>

        {loadingFriends ? (
          <div className="flex justify-center py-8">
            <Loader2 className={`h-6 w-6 animate-spin ${getThemeTextMuted()}`} />
          </div>
        ) : friends.length === 0 ? (
          <p className={`text-sm text-center py-6 ${getThemeTextMuted()}`}>{t('social.no_friends')}</p>
        ) : (
          <div className="space-y-2">
            {friends.map((row) => {
              const profile = getFriendProfile(row);
              return (
                <div
                  key={row.id}
                  className={`flex items-center gap-3 p-3 rounded-lg ${getThemeSubtle()}`}
                >
                  <Avatar name={profile.display_name} />
                  <div className="min-w-0">
                    <p className={`font-medium truncate ${getThemeTextPrimary()}`}>
                      {profile.display_name || profile.username}
                    </p>
                    {profile.username && (
                      <p className={`text-sm truncate ${getThemeTextMuted()}`}>@{profile.username}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
