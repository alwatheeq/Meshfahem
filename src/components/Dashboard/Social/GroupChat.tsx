import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, Users, Shield, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../Toast/Toast';
import { supabase } from '../../../lib/supabase';
import { ErrorLogger } from '../../../utils/errorLogger';

interface GroupChatProps {
  groupId: string;
  groupName: string;
  onBack: () => void;
}

interface ChatMessage {
  id: string;
  group_id: string;
  user_id: string | null;
  content: string;
  message_type: string; // 'text' | 'system'
  created_at: string;
  sender_profile?: {
    display_name: string | null;
    username: string;
    avatar_url: string | null;
  } | null;
}

interface GroupMember {
  id: string;
  user_id: string;
  role: string;
  profile?: {
    display_name: string | null;
    username: string;
    avatar_url: string | null;
  } | null;
}

const PAGE_SIZE = 50;

const getInitials = (name: string | null, username: string): string => {
  if (name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
  return username.slice(0, 2).toUpperCase();
};

const formatTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const GroupChat: React.FC<GroupChatProps> = ({ groupId, groupName, onBack }) => {
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
  const { error: showErrorToast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  const scrollToBottom = useCallback(() => {
    if (shouldAutoScroll.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Load members
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const { data, error } = await supabase
          .from('study_group_members')
          .select(`
            id,
            user_id,
            role,
            profile:user_profiles!study_group_members_user_id_fkey(display_name, username, avatar_url)
          `)
          .eq('group_id', groupId);

        if (error) throw error;
        setMembers((data as unknown as GroupMember[]) || []);
      } catch (err) {
        ErrorLogger.log(err as Error, { component: 'GroupChat', action: 'fetchMembers' });
      }
    };
    fetchMembers();
  }, [groupId]);

  // Load initial messages
  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('study_group_messages')
          .select(`
            id,
            group_id,
            user_id,
            content,
            message_type,
            created_at,
            sender_profile:user_profiles!study_group_messages_user_id_fkey(display_name, username, avatar_url)
          `)
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);

        if (error) throw error;

        const sorted = (data || []).reverse();
        setMessages(sorted as ChatMessage[]);
        setHasMore((data?.length || 0) === PAGE_SIZE);
      } catch (err) {
        ErrorLogger.log(err as Error, { component: 'GroupChat', action: 'fetchMessages' });
        showErrorToast(t('social.messages_load_error') || 'Failed to load messages');
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();
  }, [groupId, showErrorToast, t]);

  // Auto scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`group-chat-${groupId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'study_group_messages',
        filter: `group_id=eq.${groupId}`,
      }, async (payload) => {
        const newMsg = payload.new as ChatMessage;

        // Fetch sender profile for the new message
        if (newMsg.user_id) {
          try {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('display_name, username, avatar_url')
              .eq('id', newMsg.user_id)
              .maybeSingle();

            newMsg.sender_profile = profile;
          } catch {
            // ignore profile fetch failure
          }
        }

        setMessages((prev) => {
          // Avoid duplicates
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        shouldAutoScroll.current = true;
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [groupId]);

  // Load older messages on scroll up
  const handleScroll = useCallback(async () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // Check if scrolled near bottom for auto-scroll
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    shouldAutoScroll.current = isNearBottom;

    // Load older messages if scrolled to top
    if (container.scrollTop < 50 && hasMore && !loadingOlder && messages.length > 0) {
      setLoadingOlder(true);
      const oldestMsg = messages[0];
      try {
        const { data, error } = await supabase
          .from('study_group_messages')
          .select(`
            id,
            group_id,
            user_id,
            content,
            message_type,
            created_at,
            sender_profile:user_profiles!study_group_messages_user_id_fkey(display_name, username, avatar_url)
          `)
          .eq('group_id', groupId)
          .lt('created_at', oldestMsg.created_at)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);

        if (error) throw error;

        const older = (data || []).reverse();
        if (older.length < PAGE_SIZE) setHasMore(false);

        const prevHeight = container.scrollHeight;
        setMessages((prev) => [...(older as ChatMessage[]), ...prev]);

        // Maintain scroll position
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight - prevHeight;
        });
      } catch (err) {
        ErrorLogger.log(err as Error, { component: 'GroupChat', action: 'loadOlderMessages' });
      } finally {
        setLoadingOlder(false);
      }
    }
  }, [groupId, hasMore, loadingOlder, messages]);

  const handleSend = async () => {
    if (!user?.id || !input.trim() || sending) return;
    const content = input.trim();
    setInput('');
    setSending(true);

    try {
      const { error } = await supabase
        .from('study_group_messages')
        .insert({
          group_id: groupId,
          user_id: user.id,
          content,
          message_type: 'text',
        });

      if (error) throw error;
      shouldAutoScroll.current = true;
    } catch (err) {
      ErrorLogger.log(err as Error, { component: 'GroupChat', action: 'sendMessage' });
      showErrorToast(t('social.send_error') || 'Failed to send message');
      setInput(content); // Restore input on failure
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderAvatar = (profile: { display_name: string | null; username: string; avatar_url: string | null } | null) => {
    if (!profile) return null;
    if (profile.avatar_url) {
      return (
        <img
          src={profile.avatar_url}
          alt={profile.display_name || profile.username}
          className={`w-8 h-8 rounded-full object-cover border ${getThemeCardBorder()} flex-shrink-0`}
        />
      );
    }
    return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
        {getInitials(profile.display_name, profile.username)}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-h-[700px]">
      {/* Header */}
      <div className={`flex items-center gap-3 p-4 border-b ${getThemeCardBorder()} ${getThemeCardBg()} rounded-t-xl`}>
        <button
          onClick={onBack}
          className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${getThemeTextSecondary()}`}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getThemeGradient()} flex items-center justify-center flex-shrink-0`}>
          <Users className="w-4 h-4 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-semibold truncate ${getThemeTextPrimary()}`}>{groupName}</h3>
          <p className={`text-xs ${getThemeTextMuted()}`}>
            {members.length} {t('social.members') || 'members'}
          </p>
        </div>

        <button
          onClick={() => setShowMembers(!showMembers)}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border ${getThemeCardBorder()} ${getThemeTextSecondary()} hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}
        >
          <Users className="w-3.5 h-3.5" />
          {showMembers ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Messages panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Message list */}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className={`flex-1 overflow-y-auto px-4 py-3 space-y-3 ${getThemeSubtle()}`}
          >
            {loadingOlder && (
              <div className="flex justify-center py-2">
                <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className={`text-center py-16 ${getThemeTextMuted()}`}>
                <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t('social.no_messages') || 'No messages yet. Say hello!'}</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isSystem = msg.message_type === 'system';
                const isOwn = msg.user_id === user?.id;

                if (isSystem) {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <span className={`text-xs px-3 py-1 rounded-full ${getThemeSubtle()} ${getThemeTextMuted()}`}>
                        {msg.content}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {!isOwn && renderAvatar(msg.sender_profile || null)}

                    <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                      {!isOwn && msg.sender_profile && (
                        <p className={`text-xs font-medium mb-0.5 ${getThemeTextSecondary()} ${isOwn ? 'text-right' : 'text-left'}`}>
                          @{msg.sender_profile.username}
                        </p>
                      )}
                      <div
                        className={`px-3 py-2 rounded-xl text-sm break-words ${
                          isOwn
                            ? 'bg-emerald-500 text-white rounded-br-sm'
                            : `${getThemeCardBg()} border ${getThemeCardBorder()} ${getThemeTextPrimary()} rounded-bl-sm`
                        }`}
                      >
                        {msg.content}
                      </div>
                      <p className={`text-[10px] mt-0.5 ${getThemeTextMuted()} ${isOwn ? 'text-right' : 'text-left'}`}>
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div className={`p-3 border-t ${getThemeCardBorder()} ${getThemeCardBg()}`}>
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('social.type_message') || 'Type a message...'}
                rows={1}
                className={`flex-1 px-3 py-2 rounded-xl border ${getThemeCardBorder()} ${getThemeCardBg()} ${getThemeTextPrimary()} placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm resize-none max-h-24`}
                style={{ minHeight: '38px' }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Members sidebar */}
        {showMembers && (
          <div className={`w-56 border-l ${getThemeCardBorder()} ${getThemeCardBg()} overflow-y-auto flex-shrink-0`}>
            <div className={`p-3 border-b ${getThemeCardBorder()}`}>
              <h4 className={`text-xs font-semibold uppercase tracking-wider ${getThemeTextMuted()}`}>
                {t('social.members') || 'Members'} ({members.length})
              </h4>
            </div>
            <div className="p-2 space-y-1">
              {members.map((member) => {
                const profile = member.profile;
                return (
                  <div
                    key={member.id}
                    className={`flex items-center gap-2 p-2 rounded-lg ${getThemeSubtle()}`}
                  >
                    {profile?.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={profile.display_name || profile.username}
                        className="w-7 h-7 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold text-[10px]">
                        {getInitials(profile?.display_name || null, profile?.username || '?')}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${getThemeTextPrimary()}`}>
                        {profile?.display_name || profile?.username || 'Unknown'}
                      </p>
                      {profile?.username && (
                        <p className={`text-[10px] truncate ${getThemeTextMuted()}`}>
                          @{profile.username}
                        </p>
                      )}
                    </div>
                    {member.role === 'admin' && (
                      <Shield className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" title="Admin" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
