import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Minimize2, Maximize2, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../Toast/Toast';
import { supabase } from '../../lib/supabase';
import { handleApiError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';

interface ChatAssistantProps {
  summaryText: string;
  originalText?: string;
  topics?: string[];
  medicalMode?: boolean;
  contextType?: 'summary' | 'library_item' | 'history_item' | 'shared';
  contextId?: string | null;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export const ChatAssistant: React.FC<ChatAssistantProps> = ({
  summaryText,
  originalText,
  topics = [],
  medicalMode = false,
  contextType = 'summary',
  contextId = null
}) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { getThemeGradient, getThemeBorder } = useTheme();
  const { error: showErrorToast } = useToast();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [suggestedQuestions] = useState([
    t('chat.suggestions.explain_summary'),
    t('chat.suggestions.key_points'),
    t('chat.suggestions.study_focus'),
    t('chat.suggestions.simplify')
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load existing conversation on mount if contextId is provided
  useEffect(() => {
    if (contextId && isOpen && !conversationId && user) {
      loadExistingConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextId, isOpen, conversationId, user, contextType]);

  // Load conversation history if conversationId exists
  useEffect(() => {
    if (conversationId && isOpen) {
      loadConversationHistory();
    }
  }, [conversationId, isOpen]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadExistingConversation = async () => {
    if (!contextId || !user) return;

    try {
      const { data, error } = await supabase
        .from('chatbot_conversations')
        .select('id')
        .eq('user_id', user.id)
        .eq('context_type', contextType)
        .eq('context_id', contextId)
        .maybeSingle();

      if (error) {
        ErrorLogger.error(error as Error, {
          component: 'ChatAssistant',
          action: 'loadExistingConversation'
        });
        return;
      }

      if (data) {
        setConversationId(data.id);
      }
    } catch (error) {
      ErrorLogger.error(error as Error, {
        component: 'ChatAssistant',
        action: 'loadExistingConversation'
      });
    }
  };

  const loadConversationHistory = async () => {
    if (!conversationId) return;

    try {
      const { data, error } = await supabase
        .from('chatbot_messages')
        .select('id, role, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (data) {
        setMessages(data);
      }
    } catch (error) {
      ErrorLogger.error(error as Error, {
        component: 'ChatAssistant',
        action: 'loadConversationHistory'
      });
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || loading) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    
    // Add user message to UI immediately
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage
    };
    setMessages(prev => [...prev, tempUserMessage]);
    setLoading(true);

    try {
      if (isOffline()) {
        handleOfflineError(showErrorToast);
        setMessages(prev => prev.slice(0, -1)); // Remove temp message
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          message: userMessage,
          conversation_id: conversationId,
          summary_text: summaryText,
          original_text: originalText || null,
          topics: topics || [],
          medical_mode: medicalMode || false,
          context_type: contextType,
          context_id: contextId
        })
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        
        // Handle insufficient credits error (429)
        if (response.status === 429) {
          // Trigger credit balance refresh
          window.dispatchEvent(new CustomEvent('creditUpdated'));
          throw new Error(errorMessage);
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Remove temp message and add real messages
      setMessages(prev => {
        const withoutTemp = prev.filter(m => !m.id.startsWith('temp-'));
        return [
          ...withoutTemp,
          {
            id: `user-${Date.now()}`,
            role: 'user',
            content: userMessage
          },
          {
            id: data.message_id || `assistant-${Date.now()}`,
            role: 'assistant',
            content: data.message
          }
        ];
      });

      // Update conversation ID if this was a new conversation
      if (data.conversation_id && !conversationId) {
        setConversationId(data.conversation_id);
      }

      // Trigger credit balance refresh after successful message
      window.dispatchEvent(new CustomEvent('creditUpdated'));

    } catch (error) {
      ErrorLogger.error(error as Error, {
        component: 'ChatAssistant',
        action: 'sendMessage'
      });
      
      // Fix: Get error message from handleApiError and display it
      const errorMessage = handleApiError(error, {
        component: 'ChatAssistant',
        action: 'sendMessage'
      });
      showErrorToast(errorMessage);
      
      // Remove temp message on error
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
    inputRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 ${getThemeGradient('ui')} text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 flex items-center justify-center`}
        aria-label={t('chat.open_assistant')}
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className={`fixed bottom-6 right-6 z-50 w-96 ${isMinimized ? 'h-16' : 'h-[600px]'} flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border ${getThemeBorder()} transition-all duration-300`}>
      {/* Header */}
      <div className={`flex items-center justify-between p-4 ${getThemeGradient('ui')} text-white rounded-t-lg`}>
        <div className="flex items-center space-x-2">
          <MessageCircle className="h-5 w-5" />
          <span className="font-semibold">{t('chat.assistant_title')}</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="hover:bg-white/20 p-1 rounded transition-colors"
            aria-label={isMinimized ? t('chat.maximize') : t('chat.minimize')}
          >
            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={() => {
              setIsOpen(false);
              setIsMinimized(false);
            }}
            className="hover:bg-white/20 p-1 rounded transition-colors"
            aria-label={t('chat.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 dark:text-gray-400 mb-4">{t('chat.welcome_message')}</p>
                <div className="space-y-2">
                  {suggestedQuestions.map((question, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestionClick(question)}
                      className={`w-full text-left px-4 py-2 text-sm rounded-lg border ${getThemeBorder()} bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        message.role === 'user'
                          ? `${getThemeGradient('ui')} text-white`
                          : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-gray-700 rounded-lg px-4 py-2 border border-gray-200 dark:border-gray-600">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex items-end space-x-2">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={t('chat.input_placeholder')}
                className="flex-1 resize-none px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                rows={1}
                style={{ minHeight: '40px', maxHeight: '120px' }}
              />
              <button
                onClick={sendMessage}
                disabled={!inputValue.trim() || loading}
                className={`p-2 rounded-lg ${getThemeGradient('ui')} text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity`}
                aria-label={t('chat.send')}
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

