import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../Toast/Toast';
import { supabase } from '../../../lib/supabase';
import { toErrorMessage } from '../../../utils/errorHandler';

interface ChatMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_username: string | null;
  sender_display_name: string | null;
}

interface GroupChatProps {
  groupId: string;
  groupName: string;
  onBack: () => void;
}

const PAGE_SIZE = 50;

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export const GroupChat: React.FC<GroupChatProps> = ({ groupId, groupName, onBack }) => {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const { error: showError } = useToast();
  const {
    getThemeCardBg,
    getThemeCardBorder,
    getThemeTextPrimary,
    getThemeTextMuted,
    getThemeSubtle,
    getThemeGradient,
    getThemeAccent,
  } = useTheme();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const profileCacheRef = useRef<Record<string, { username: string | null; display_name: string | null }>>({});

  const enrichWithProfiles = useCallback(
    async (
      rawMessages: Array<{ id: string; group_id: string; sender_id: string; content: string; created_at: string }>
    ): Promise<ChatMessage[]> => {
      const cache = profileCacheRef.current;
      const uncachedIds = [...new Set(rawMessages.map((m) => m.sender_id))].filter((id) => !cache[id]);

      if (uncachedIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, username, display_name')
          .in('id', uncachedIds);

        (profiles || []).forEach((p) => {
          cache[p.id] = { username: p.username, display_name: p.display_name };
        });
      }

      return rawMessages.map((m) => ({
        ...m,
        sender_username: cache[m.sender_id]?.username ?? null,
        sender_display_name: cache[m.sender_id]?.display_name ?? null,
      }));
    },
    []
  );

  const loadInitialMessages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('group_messages')
        .select('id, group_id, sender_id, content, created_at')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (error) throw error;

      const reversed = (data || []).reverse();
      const enriched = await enrichWithProfiles(reversed);
      setMessages(enriched);
      setHasMore((data || []).length === PAGE_SIZE);
    } catch (err) {
      showError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [groupId, enrichWithProfiles, showError]);

  useEffect(() => {
    loadInitialMessages();
  }, [loadInitialMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('group-chat-' + groupId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: 'group_id=eq.' + groupId,
        },
        async (payload) => {
          const newMsg = payload.new as {
            id: string;
            group_id: string;
            sender_id: string;
            content: string;
            created_at: string;
          };
          const enriched = await enrichWithProfiles([newMsg]);
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, enriched[0]];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, enrichWithProfiles]);

  const loadOlderMessages = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);

    const oldestCreatedAt = messages[0].created_at;
    const container = scrollContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;

    try {
      const { data, error } = await supabase
        .from('group_messages')
        .select('id, group_id, sender_id, content, created_at')
        .eq('group_id', groupId)
        .lt('created_at', oldestCreatedAt)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (error) throw error;

      const reversed = (data || []).reverse();
      const enriched = await enrichWithProfiles(reversed);
      setMessages((prev) => [...enriched, ...prev]);
      setHasMore((data || []).length === PAGE_SIZE);

      // Preserve scroll position after prepending
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        }
      });
    } catch (err) {
      showError(toErrorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSend = async () => {
    if (!user || sending) return;
    const content = input.trim();
    if (!content) return;

    setSending(true);
    setInput('');
    try {
      const { error } = await supabase
        .from('group_messages')
        .insert({ group_id: groupId, sender_id: user.id, content });

      if (error) throw error;
    } catch (err) {
      showError(toErrorMessage(err));
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (container.scrollTop < 60) {
      loadOlderMessages();
    }
  };

  const senderLabel = (msg: ChatMessage) =>
    msg.sender_username || msg.sender_display_name || msg.sender_id.slice(0, 8);

  const senderInitial = (msg: ChatMessage) =>
    (msg.sender_username || msg.sender_display_name || '?')[0].toUpperCase();

  const isOwn = (msg: ChatMessage) => msg.sender_id === user?.id;

  return (
    <div dir={dir} className="flex flex-col h-full">
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b shrink-0 ${getThemeCardBg()} ${getThemeCardBorder()}`}>
        <button
          onClick={onBack}
          className={`p-1.5 rounded-lg transition-colors ${getThemeSubtle('ui')}`}
        >
          <ArrowLeft className={`w-5 h-5 ${getThemeTextPrimary()}`} />
        </button>
        <h2 className={`font-semibold text-sm truncate ${getThemeTextPrimary()}`}>
          {groupName}
        </h2>
      </div>

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className={`w-6 h-6 animate-spin ${getThemeTextMuted()}`} />
          </div>
        ) : messages.length === 0 ? (
          <div className={`text-sm text-center py-16 ${getThemeTextMuted()}`}>
            {t('social.no_messages')}
          </div>
        ) : (
          <>
            {hasMore && (
              <button
                onClick={loadOlderMessages}
                disabled={loadingMore}
                className={`w-full text-center text-xs py-2 rounded-lg transition-colors ${getThemeSubtle('ui')} ${getThemeTextMuted()}`}
              >
                {loadingMore ? (
                  <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                ) : (
                  t('social.load_more')
                )}
              </button>
            )}
            {messages.map((msg) => {
              const own = isOwn(msg);
              return (
                <div
                  key={msg.id}
                  className={`flex ${own ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-2 max-w-[80%] ${own ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Avatar */}
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ${
                        own ? getThemeAccent() : getThemeGradient()
                      }`}
                    >
                      {senderInitial(msg)}
                    </div>

                    {/* Bubble */}
                    <div>
                      {!own && (
                        <div className={`text-[10px] mb-0.5 px-1 ${getThemeTextMuted()}`}>
                          {senderLabel(msg)}
                        </div>
                      )}
                      <div
                        className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${
                          own
                            ? `${getThemeAccent()} text-white`
                            : `${getThemeSubtle()} ${getThemeTextPrimary()}`
                        }`}
                      >
                        {msg.content}
                      </div>
                      <div
                        className={`text-[10px] mt-0.5 px-1 ${getThemeTextMuted()} ${
                          own ? 'text-end' : 'text-start'
                        }`}
                      >
                        {relativeTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input bar */}
      <div className={`shrink-0 border-t px-4 py-3 ${getThemeCardBg()} ${getThemeCardBorder()}`}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={t('social.type_message')}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm border outline-none transition-colors ${getThemeSubtle()} ${getThemeCardBorder()} ${getThemeTextPrimary()}`}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className={`p-2.5 rounded-xl text-white transition-opacity disabled:opacity-40 ${getThemeAccent()}`}
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
  );
};
