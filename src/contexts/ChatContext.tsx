import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { useChatStore } from '../stores/useChatStore';
import type { ChatContextData, ChatContextType } from '../stores/useChatStore';

export type { ChatContextData, ChatContextType };

interface ChatContextValue {
  context: ChatContextData;
  setChatContext: (data: Partial<ChatContextData>) => void;
  clearChatContext: () => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const store = useChatStore();

  const context: ChatContextData = {
    summaryText: store.summaryText,
    originalText: store.originalText,
    topics: store.topics,
    medicalMode: store.medicalMode,
    contextType: store.contextType,
    contextId: store.contextId,
  };

  const setChatContext = useCallback((data: Partial<ChatContextData>) => {
    store.setChatContext(data);
  }, [store]);

  const clearChatContext = useCallback(() => {
    store.clearChatContext();
  }, [store]);

  return (
    <ChatContext.Provider
      value={{
        context,
        setChatContext,
        clearChatContext,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChatContext = (): ChatContextValue => {
  const contextValue = useContext(ChatContext);
  if (!contextValue) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return contextValue;
};

