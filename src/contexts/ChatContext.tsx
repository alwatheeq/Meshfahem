import React, { createContext, useContext, ReactNode } from 'react';
import { useChatStore, ChatContextData, ChatContextType } from '../stores/chatStore';

// Re-export types for backward compatibility
export type { ChatContextType, ChatContextData };

interface ChatContextValue {
  context: ChatContextData;
  setChatContext: (data: Partial<ChatContextData>) => void;
  clearChatContext: () => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

/**
 * ChatProvider - thin wrapper around Zustand store for backward compatibility.
 * Components can import useChatContext (from here) or useChatStore (from stores/) directly.
 */
export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { context, setChatContext, clearChatContext } = useChatStore();

  return (
    <ChatContext.Provider value={{ context, setChatContext, clearChatContext }}>
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
