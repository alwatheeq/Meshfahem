import { create } from 'zustand';

export type ChatContextType = 'summary' | 'library_item' | 'history_item' | 'general';

export interface ChatContextData {
  summaryText: string | null;
  originalText: string | null;
  topics: string[];
  medicalMode: boolean;
  contextType: ChatContextType;
  contextId: string | null;
}

interface ChatStore {
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

export const useChatStore = create<ChatStore>((set) => ({
  context: defaultContext,
  setChatContext: (data) =>
    set((state) => ({
      context: { ...state.context, ...data },
    })),
  clearChatContext: () => set({ context: defaultContext }),
}));
