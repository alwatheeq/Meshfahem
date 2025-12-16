import React, { createContext, useContext, useState, ReactNode } from 'react';

export type ChatContextType = 'summary' | 'library_item' | 'history_item' | 'general';

export interface ChatContextData {
  summaryText: string | null;
  originalText: string | null;
  topics: string[];
  medicalMode: boolean;
  contextType: ChatContextType;
  contextId: string | null;
}

interface ChatContextValue {
  context: ChatContextData;
  setChatContext: (data: Partial<ChatContextData>) => void;
  clearChatContext: () => void;
}

const defaultContext: ChatContextData = {
  summaryText: null,
  originalText: null,
  topics: [],
  medicalMode: false,
  contextType: 'general',
  contextId: null,
};

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [context, setContext] = useState<ChatContextData>(defaultContext);

  const setChatContext = (data: Partial<ChatContextData>) => {
    setContext((prev) => ({
      ...prev,
      ...data,
    }));
  };

  const clearChatContext = () => {
    setContext(defaultContext);
  };

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

