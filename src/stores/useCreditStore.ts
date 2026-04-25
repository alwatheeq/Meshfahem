import { create } from 'zustand';

export interface CreditBalance {
  credits_remaining: number;
  credits_total: number;
  cycle_start: string | null;
  cycle_end: string | null;
  free_credits_claimed: boolean;
  zego_credits_remaining?: number;
  zego_credits_total?: number;
  /** Subscription AI chat pool: token_limit − tokens_used_current_cycle */
  chat_tokens_remaining?: number;
  chat_token_limit?: number;
}

interface CreditStoreState {
  balance: CreditBalance | null;
  loading: boolean;
  setBalance: (balance: CreditBalance | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useCreditStore = create<CreditStoreState>((set) => ({
  balance: null,
  loading: true,
  setBalance: (balance) => set({ balance }),
  setLoading: (loading) => set({ loading }),
}));
