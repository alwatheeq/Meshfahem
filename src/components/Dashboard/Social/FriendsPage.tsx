import React, { useState, useEffect, useCallback } from 'react';
import { Users, UserCheck, UserX, MessageCircle, Loader2, Inbox, Heart } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../Toast/Toast';
import { supabase } from '../../../lib/supabase';
import { ErrorLogger } from '../../../utils/errorLogger';
import { UserSearch } from './UserSearch';

interface FriendProfile {
  id: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
}

interface ConnectionRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  requester_profile?: FriendProfile | null;
  addressee_profile?: FriendProfile | null;
}

const getInitials = (name: string | null, username: string): string => {
  if (name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
  return username.slice(0, 2).toUpperCase();
};

export const FriendsPage: React.FC = () => {
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

  const [pendingRequests, setPendingRequests] = useState<ConnectionRow[]>([]);
  const [friends, setFriends] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Fetch pending requests received by this user
      const { data: pending, error: pendingErr } = await supabase
        .from('user_connections')
        .select(`
          id,
          requester_id,
          addressee_id,
          status,
          requester_profile:user_profiles!user_connections_requester_id_fkey(id, display_name, username, avatar_url)
        `)
        .eq('addressee_id', user.id)
        .eq('status', 'pending');

      if (pendingErr) throw pendingErr;

      // Fetch accepted friends (user could be requester or addressee)
      const { data: friendsAsRequester, error: frErr } = await supabase
        .from('user_connections')
        .select(`
          id,
          requester_id,
          addressee_id,
          status,
          addressee_profile:user_profiles!user_connections_addressee_id_fkey(id, display_name, username, avatar_url)
        `)
        .eq('requester_id', user.id)
        .eq('status', 'accepted');

      if (frErr) throw frErr;

      const { data: friendsAsAddressee, error: faErr } = await supabase
        .from('user_connections')
        .select(`
          id,
          requester_id,
          addressee_id,
          status,
          requester_profile:user_profiles!user_connections_requester_id_fkey(id, display_name, username, avatar_url)
        `)
        .eq('addressee_id', user.id)
        .eq('status', 'accepted');

      if (faErr) throw faErr;

      setPendingRequests((pending as ConnectionRow[]) || []);
      setFriends([
        ...((friendsAsRequester as ConnectionRow[]) || []),
        ...((friendsAsAddressee as ConnectionRow[]) || []),
      ]);
    } catch (err) {
      ErrorLogger.log(err as Error, { component: 'FriendsPage', action: 'fetchConnections' });
      showErrorToast(t('social.load_error') || 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }, [user?.id, showErrorToast, t]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleAccept = async (connectionId: string) => {
    setActionLoading(connectionId);
    try {
      const { error } = await supabase
        .from('user_connections')
        .update({ status: 'accepted' })
        .eq('id', connectionId);

      if (error) throw error;
      showSuccessToast(t('social.friend_accepted') || 'Friend request accepted!');
      fetchConnections();
    } catch (err) {
      ErrorLogger.log(err as Error, { component: 'FriendsPage', action: 'acceptRequest' });
      showErrorToast(t('social.accept_error') || 'Failed to accept request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (connectionId: string) => {
    setActionLoading(connectionId);
    try {
      const { error } = await supabase
        .from('user_connections')
        .delete()
        .eq('id', connectionId);

      if (error) throw error;
      showSuccessToast(t('social.request_rejected') || 'Request rejected');
      fetchConnections();
    } catch (err) {
      ErrorLogger.log(err as Error, { component: 'FriendsPage', action: 'rejectRequest' });
      showErrorToast(t('social.reject_error') || 'Failed to reject request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddFriend = async (userId: string) => {
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('user_connections')
        .insert({
          requester_id: user.id,
          addressee_id: userId,
          status: 'pending',
        });

      if (error) {
        if (error.code === '23505') {
          showErrorToast(t('social.already_connected') || 'Connection already exists');
          return;
        }
        throw error;
      }
      showSuccessToast(t('social.request_sent') || 'Friend request sent!');
    } catch (err) {
      ErrorLogger.log(err as Error, { component: 'FriendsPage', action: 'addFriend' });
      showErrorToast(t('social.add_friend_error') || 'Failed to send friend request');
    }
  };

  const getFriendProfile = (conn: ConnectionRow): FriendProfile => {
    if (conn.requester_id === user?.id) {
      const p = conn.addressee_profile;
      return p ? { id: p.id, display_name: p.display_name, username: p.username, avatar_url: p.avatar_url } : { id: conn.addressee_id, display_name: null, username: 'unknown', avatar_url: null };
    }
    const p = conn.requester_profile;
    return p ? { id: p.id, display_name: p.display_name, username: p.username, avatar_url: p.avatar_url } : { id: conn.requester_id, display_name: null, username: 'unknown', avatar_url: null };
  };

  const renderAvatar = (profile: FriendProfile, size: string = 'w-10 h-10') => {
    if (profile.avatar_url) {
      return (
        <img
          src={profile.avatar_url}
          alt={profile.display_name || profile.username}
          className={`${size} rounded-full object-cover border-2 border-emerald-200 dark:border-emerald-800`}
        />
      );
    }
    return (
      <div className={`${size} rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold text-sm`}>
        {getInitials(profile.display_name, profile.username)}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Inbox className="w-5 h-5 text-amber-500" />
            <h3 className={`text-base font-semibold ${getThemeTextPrimary()}`}>
              {t('social.pending_requests') || 'Pending Requests'}
            </h3>
            <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
              {pendingRequests.length}
            </span>
          </div>

          <div className="space-y-3">
            {pendingRequests.map((req) => {
              const profile = req.requester_profile as FriendProfile | null;
              if (!profile) return null;

              return (
                <div
                  key={req.id}
                  className={`flex items-center gap-3 p-4 rounded-xl border ${getThemeCardBorder()} ${getThemeCardBg()} shadow-sm`}
                >
                  {renderAvatar(profile)}

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${getThemeTextPrimary()}`}>
                      {profile.display_name || profile.username}
                    </p>
                    <p className={`text-xs truncate ${getThemeTextMuted()}`}>
                      @{profile.username}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleAccept(req.id)}
                      disabled={actionLoading === req.id}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {actionLoading === req.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5" />
                      )}
                      {t('social.accept') || 'Accept'}
                    </button>
                    <button
                      onClick={() => handleReject(req.id)}
                      disabled={actionLoading === req.id}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      {t('social.reject') || 'Reject'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Friends List */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Heart className="w-5 h-5 text-emerald-500" />
          <h3 className={`text-base font-semibold ${getThemeTextPrimary()}`}>
            {t('social.your_friends') || 'Your Friends'}
          </h3>
          {friends.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full">
              {friends.length}
            </span>
          )}
        </div>

        {friends.length === 0 ? (
          <div className={`text-center py-12 rounded-xl border border-dashed ${getThemeCardBorder()} ${getThemeSubtle()}`}>
            <Users className={`w-12 h-12 mx-auto mb-3 ${getThemeTextMuted()} opacity-40`} />
            <p className={`text-sm font-medium ${getThemeTextSecondary()}`}>
              {t('social.no_friends_yet') || 'No friends yet'}
            </p>
            <p className={`text-xs mt-1 ${getThemeTextMuted()}`}>
              {t('social.search_to_add') || 'Search for users below to send friend requests'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {friends.map((conn) => {
              const profile = getFriendProfile(conn);

              return (
                <div
                  key={conn.id}
                  className={`flex items-center gap-3 p-4 rounded-xl border ${getThemeCardBorder()} ${getThemeCardBg()} shadow-sm hover:shadow-md transition-shadow`}
                >
                  {renderAvatar(profile)}

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${getThemeTextPrimary()}`}>
                      {profile.display_name || profile.username}
                    </p>
                    <p className={`text-xs truncate ${getThemeTextMuted()}`}>
                      @{profile.username}
                    </p>
                  </div>

                  <button
                    className="p-2 rounded-lg text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors flex-shrink-0"
                    title={t('social.message') || 'Message'}
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* User Search */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-teal-500" />
          <h3 className={`text-base font-semibold ${getThemeTextPrimary()}`}>
            {t('social.find_friends') || 'Find Friends'}
          </h3>
        </div>
        <UserSearch onAddFriend={handleAddFriend} />
      </section>
    </div>
  );
};
