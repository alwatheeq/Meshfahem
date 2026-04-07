import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { handleSupabaseError, isOffline } from '../utils/errorHandler';
import { ErrorLogger } from '../utils/errorLogger';

export interface CreditBalance {
  credits_remaining: number;
  credits_total: number;
  cycle_start: string | null;
  cycle_end: string | null;
  free_credits_claimed: boolean;
  zego_credits_remaining?: number;
  zego_credits_total?: number;
}

interface CreditStore {
  balance: CreditBalance | null;
  loading: boolean;
  _userId: string | null;
  _intervalId: ReturnType<typeof setInterval> | null;
  fetchBalance: (userId: string) => Promise<void>;
  refreshBalance: () => Promise<void>;
  clearBalance: () => void;
  startPolling: (userId: string) => void;
  stopPolling: () => void;
}

export const useCreditStore = create<CreditStore>((set, get) => ({
  balance: null,
  loading: true,
  _userId: null,
  _intervalId: null,

  fetchBalance: async (userId: string) => {
    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'CreditStore', action: 'fetchBalance', userId });
      set({ loading: false });
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_user_credit_balance', {
        p_user_id: userId,
      });

      if (error) {
        handleSupabaseError(error, { component: 'CreditStore', action: 'fetchBalance', userId });
        ErrorLogger.error(error, { component: 'CreditStore', action: 'fetchBalance', userId });
        return;
      }

      if (data && data.success) {
        set({
          balance: {
            credits_remaining: data.credits_remaining,
            credits_total: data.credits_total,
            cycle_start: data.cycle_start,
            cycle_end: data.cycle_end,
            free_credits_claimed: data.free_credits_claimed,
            zego_credits_remaining: data.zego_credits_remaining ?? 0,
            zego_credits_total: data.zego_credits_total ?? 0,
          },
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      handleSupabaseError(error, { component: 'CreditStore', action: 'fetchBalance', userId });
      ErrorLogger.error(error, { component: 'CreditStore', action: 'fetchBalance', userId });
    } finally {
      set({ loading: false });
    }
  },

  refreshBalance: async () => {
    const userId = get()._userId;
    if (userId) {
      await get().fetchBalance(userId);
    }
  },

  clearBalance: () => {
    get().stopPolling();
    set({ balance: null, loading: false, _userId: null });
  },

  startPolling: (userId: string) => {
    const state = get();
    if (state._intervalId) clearInterval(state._intervalId);

    set({ _userId: userId, loading: true });
    get().fetchBalance(userId);

    const intervalId = setInterval(() => get().fetchBalance(userId), 30000);
    set({ _intervalId: intervalId });
  },

  stopPolling: () => {
    const { _intervalId } = get();
    if (_intervalId) {
      clearInterval(_intervalId);
      set({ _intervalId: null });
    }
  },
}));
