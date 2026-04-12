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

interface ChatStoreState extends ChatContextData {
  setChatContext: (data: Partial<ChatContextData>) => void;
  clearChatContext: () => void;
}

const defaultState: ChatContextData = {
  summaryText: null,
  originalText: null,
  topics: [],
  medicalMode: false,
  contextType: 'general',
  contextId: null,
};

export const useChatStore = create<ChatStoreState>((set) => ({
  ...defaultState,
  setChatContext: (data) => set((state) => ({ ...state, ...data })),
  clearChatContext: () => set(defaultState),
}));
