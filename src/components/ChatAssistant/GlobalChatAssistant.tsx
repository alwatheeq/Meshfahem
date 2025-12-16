import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, X, Send, Minimize2, Maximize2, Loader2, GripVertical } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../Toast/Toast';
import { supabase } from '../../lib/supabase';
import { handleApiError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { useLocation } from 'react-router-dom';
import { useChatContext } from '../../contexts/ChatContext';
import './GlobalChatAssistant.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export const GlobalChatAssistant: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { getThemeGradient, getThemeBorder } = useTheme();
  const { error: showErrorToast } = useToast();
  const location = useLocation();
  const { context: chatContext } = useChatContext();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('chatAssistantPosition');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { x: window.innerWidth - 100, y: window.innerHeight - 100 };
      }
    }
    return { x: window.innerWidth - 100, y: window.innerHeight - 100 };
  });
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('chatAssistantSize');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { width: 384, height: 600 };
      }
    }
    return { width: 384, height: 600 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<string>('');
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [shouldShake, setShouldShake] = useState(false);
  const [wasDragging, setWasDragging] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Exclude from EduPlay routes
  const isEduPlayRoute = location.pathname.includes('/eduplay') || 
                         location.pathname.includes('/join/') ||
                         location.pathname.includes('/multiplayer');

  // Shake animation every 10 minutes
  useEffect(() => {
    if (!isOpen && user && !isEduPlayRoute) {
      const shakeInterval = setInterval(() => {
        setShouldShake(true);
        setTimeout(() => setShouldShake(false), 1000);
      }, 10 * 60 * 1000); // 10 minutes

      return () => clearInterval(shakeInterval);
    }
  }, [isOpen, user, isEduPlayRoute]);

  const loadExistingConversation = useCallback(async () => {
    if (!user) return;

    try {
      // Use context if available, otherwise use general
      const contextType = chatContext.contextType !== 'general' ? chatContext.contextType : 'general';
      const contextId = chatContext.contextId;

      let query = supabase
        .from('chatbot_conversations')
        .select('id')
        .eq('user_id', user.id)
        .eq('context_type', contextType);

      if (contextId) {
        query = query.eq('context_id', contextId);
      }

      const { data, error } = await query
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        ErrorLogger.error(error as Error, {
          component: 'GlobalChatAssistant',
          action: 'loadExistingConversation'
        });
        return;
      }

      if (data) {
        setConversationId(data.id);
        // Load messages for this conversation
        const { data: messagesData, error: messagesError } = await supabase
          .from('chatbot_messages')
          .select('id, role, content, created_at')
          .eq('conversation_id', data.id)
          .order('created_at', { ascending: true });

        if (messagesError) throw messagesError;
        setMessages(messagesData || []);
      }
    } catch (error) {
      ErrorLogger.error(error as Error, {
        component: 'GlobalChatAssistant',
        action: 'loadExistingConversation'
      });
    }
  }, [user, chatContext]);

  // Load existing conversation when context changes or chat opens
  useEffect(() => {
    if (isOpen && user && chatContext.contextType !== 'general' && chatContext.contextId && !conversationId) {
      loadExistingConversation();
    }
  }, [isOpen, user, chatContext.contextType, chatContext.contextId, conversationId, loadExistingConversation]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Save position when it changes
  useEffect(() => {
    localStorage.setItem('chatAssistantPosition', JSON.stringify(position));
  }, [position]);

  // Save size when it changes
  useEffect(() => {
    if (isOpen) {
      localStorage.setItem('chatAssistantSize', JSON.stringify(size));
    }
  }, [size, isOpen]);

  const loadConversationHistory = useCallback(async () => {
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
        component: 'GlobalChatAssistant',
        action: 'loadConversationHistory'
      });
    }
  }, [conversationId]);

  // Load conversation history if conversationId exists
  useEffect(() => {
    if (conversationId && isOpen) {
      loadConversationHistory();
    }
  }, [conversationId, isOpen, loadConversationHistory]);

  const handleButtonMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setWasDragging(false);
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleChatMouseDown = (e: React.MouseEvent) => {
    if (!isOpen) return;
    
    const target = e.target as HTMLElement;
    // Don't drag if clicking buttons or input fields
    if (target.closest('button') || target.closest('textarea') || target.closest('input')) {
      return;
    }
    
    // Only allow dragging from header area
    if (!target.closest('.chat-header') && !target.closest('.drag-handle')) {
      return;
    }

    e.preventDefault();
    setIsDragging(true);
    if (chatRef.current) {
      const rect = chatRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isResizing && resizeDirection) {
      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;
      
      let newWidth = resizeStart.width;
      let newHeight = resizeStart.height;
      let newX = position.x;
      let newY = position.y;

      // Minimum and maximum sizes
      const minWidth = 300;
      const minHeight = isMinimized ? 64 : 400;
      const maxWidth = window.innerWidth - 20;
      const maxHeight = window.innerHeight - 20;

      // Handle resize directions
      if (resizeDirection.includes('right')) {
        newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStart.width + deltaX));
      }
      if (resizeDirection.includes('left')) {
        const widthChange = resizeStart.width - Math.max(minWidth, Math.min(maxWidth, resizeStart.width - deltaX));
        newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStart.width - deltaX));
        newX = position.x + (resizeStart.width - newWidth);
      }
      if (resizeDirection.includes('bottom')) {
        newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStart.height + deltaY));
      }
      if (resizeDirection.includes('top')) {
        const heightChange = resizeStart.height - Math.max(minHeight, Math.min(maxHeight, resizeStart.height - deltaY));
        newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStart.height - deltaY));
        newY = position.y + (resizeStart.height - newHeight);
      }

      // Constrain position to viewport
      const maxX = window.innerWidth - newWidth;
      const maxY = window.innerHeight - newHeight;
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      setSize({ width: newWidth, height: newHeight });
      setPosition({ x: newX, y: newY });
      return;
    }

    if (!isDragging) return;

    // Track if we actually moved (dragged) vs just clicked
    if (!wasDragging && (Math.abs(e.clientX - (position.x + dragOffset.x)) > 5 || Math.abs(e.clientY - (position.y + dragOffset.y)) > 5)) {
      setWasDragging(true);
    }

    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;

    // Constrain to viewport
    const buttonSize = 56; // Button is 56px (p-4 = 16px * 2 + 24px icon)
    const currentWidth = isOpen ? (isMinimized ? size.width : size.width) : buttonSize;
    const currentHeight = isOpen ? (isMinimized ? 64 : size.height) : buttonSize;
    const maxX = window.innerWidth - currentWidth;
    const maxY = window.innerHeight - currentHeight;

    setPosition({
      x: Math.max(buttonSize / 2, Math.min(newX, maxX)),
      y: Math.max(buttonSize / 2, Math.min(newY, maxY))
    });
  };

  const handleMouseUp = () => {
    const dragged = wasDragging;
    setIsDragging(false);
    setIsResizing(false);
    setResizeDirection('');
    setWasDragging(false);
    // Reset wasDragging after a short delay to allow click handler to check it
    setTimeout(() => {
      setWasDragging(false);
    }, 100);
  };

  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeDirection(direction);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height
    });
  };

  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none'; // Prevent text selection while dragging/resizing
      document.body.style.cursor = isResizing ? (resizeDirection.includes('nw') || resizeDirection.includes('se') ? 'nwse-resize' : resizeDirection.includes('ne') || resizeDirection.includes('sw') ? 'nesw-resize' : resizeDirection.includes('right') || resizeDirection.includes('left') ? 'ew-resize' : 'ns-resize') : 'move';
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isDragging, isResizing, resizeDirection, dragOffset, position, size, resizeStart]);

  const sendMessage = async () => {
    if (!inputValue.trim() || loading || !user) return;

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
        setMessages(prev => prev.slice(0, -1));
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Use chat context if available, otherwise use general context
      const hasContext = chatContext.summaryText !== null;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          message: userMessage,
          conversation_id: conversationId,
          summary_text: hasContext 
            ? chatContext.summaryText 
            : 'General assistant - user can ask questions about the application, study tips, or general questions.',
          original_text: hasContext ? chatContext.originalText : null,
          topics: hasContext ? chatContext.topics : [],
          medical_mode: hasContext ? chatContext.medicalMode : false,
          context_type: hasContext ? chatContext.contextType : 'general',
          context_id: hasContext ? chatContext.contextId : null
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = errorData.error || `HTTP ${response.status}`;
        
        // Handle insufficient credits error (429)
        if (response.status === 429) {
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
        component: 'GlobalChatAssistant',
        action: 'sendMessage'
      });
      
      // Fix: Get error message from handleApiError and display it
      const errorMessage = handleApiError(error, {
        component: 'GlobalChatAssistant',
        action: 'sendMessage'
      });
      showErrorToast(errorMessage);
      
      // Remove temp message on error
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Don't render on EduPlay routes
  if (isEduPlayRoute) {
    return null;
  }

  if (!user) {
    return null;
  }

  if (!isOpen) {
    return (
      <button
        ref={buttonRef}
        onMouseDown={handleButtonMouseDown}
        onClick={(e) => {
          // Only open if we weren't dragging
          if (!wasDragging && !isDragging) {
            setIsOpen(true);
          }
        }}
        className={`fixed z-50 ${getThemeGradient('ui')} text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 flex items-center justify-center ${shouldShake ? 'animate-shake' : ''} ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: 'translate(-50%, -50%)'
        }}
        aria-label={t('chat.open_assistant')}
      >
        <Sparkles className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div
      ref={chatRef}
      className={`fixed z-50 flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border ${getThemeBorder()} transition-all duration-300 ${isDragging ? 'cursor-move' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: isMinimized ? '64px' : `${size.height}px`,
        transform: 'none'
      }}
      onMouseDown={handleChatMouseDown}
    >
      {/* Header with drag handle */}
      <div className={`flex items-center justify-between p-4 ${getThemeGradient('ui')} text-white rounded-t-lg chat-header cursor-move`}>
        <div className="flex items-center space-x-2 flex-1">
          <div className="drag-handle cursor-move">
            <GripVertical className="h-4 w-4 opacity-70" />
          </div>
          <Sparkles className="h-5 w-5" />
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

      {/* Resize handles */}
      {!isMinimized && (
        <>
          {/* Corner handles */}
          <div
            className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize hover:bg-blue-500/50 rounded-tl-lg resize-handle z-10"
            onMouseDown={(e) => handleResizeStart(e, 'top-left')}
          />
          <div
            className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize hover:bg-blue-500/50 rounded-tr-lg resize-handle z-10"
            onMouseDown={(e) => handleResizeStart(e, 'top-right')}
          />
          <div
            className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize hover:bg-blue-500/50 rounded-bl-lg resize-handle z-10"
            onMouseDown={(e) => handleResizeStart(e, 'bottom-left')}
          />
          <div
            className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize hover:bg-blue-500/50 rounded-br-lg resize-handle z-10"
            onMouseDown={(e) => handleResizeStart(e, 'bottom-right')}
          />
          {/* Edge handles */}
          <div
            className="absolute top-0 left-3 right-3 h-1 cursor-ns-resize hover:bg-blue-500/50 resize-handle z-10"
            onMouseDown={(e) => handleResizeStart(e, 'top')}
          />
          <div
            className="absolute bottom-0 left-3 right-3 h-1 cursor-ns-resize hover:bg-blue-500/50 resize-handle z-10"
            onMouseDown={(e) => handleResizeStart(e, 'bottom')}
          />
          <div
            className="absolute left-0 top-3 bottom-3 w-1 cursor-ew-resize hover:bg-blue-500/50 resize-handle z-10"
            onMouseDown={(e) => handleResizeStart(e, 'left')}
          />
          <div
            className="absolute right-0 top-3 bottom-3 w-1 cursor-ew-resize hover:bg-blue-500/50 resize-handle z-10"
            onMouseDown={(e) => handleResizeStart(e, 'right')}
          />
        </>
      )}

      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <Sparkles className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {chatContext.summaryText 
                    ? t('chat.welcome_message') 
                    : t('chat.welcome_message_global')}
                </p>
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

