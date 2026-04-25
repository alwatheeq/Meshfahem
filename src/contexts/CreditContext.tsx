import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { handleSupabaseError, isOffline } from '../utils/errorHandler';
import { ErrorLogger } from '../utils/errorLogger';
import { useCreditStore } from '../stores/useCreditStore';
import type { CreditBalance } from '../stores/useCreditStore';

export type { CreditBalance };

interface CreditContextType {
  balance: CreditBalance | null;
  loading: boolean;
  refreshBalance: () => Promise<void>;
}

const CreditContext = createContext<CreditContextType | undefined>(undefined);

export const CreditProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { balance, loading, setBalance, setLoading } = useCreditStore();

  const fetchBalance = useCallback(async () => {
    if (!user) {
      setBalance(null);
      setLoading(false);
      return;
    }

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'CreditContext', action: 'fetchBalance', userId: user.id });
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_user_credit_balance', {
        p_user_id: user.id
      });

      if (error) {
        handleSupabaseError(error, { component: 'CreditContext', action: 'fetchBalance', userId: user.id });
        ErrorLogger.error(error, { component: 'CreditContext', action: 'fetchBalance', userId: user.id });
        return;
      }

      if (data && data.success) {
        setBalance({
          credits_remaining: data.credits_remaining,
          credits_total: data.credits_total,
          cycle_start: data.cycle_start,
          cycle_end: data.cycle_end,
          free_credits_claimed: data.free_credits_claimed,
          zego_credits_remaining: data.zego_credits_remaining ?? 0,
          zego_credits_total: data.zego_credits_total ?? 0,
          chat_tokens_remaining: data.chat_tokens_remaining ?? 0,
          chat_token_limit: data.chat_token_limit ?? 0
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      handleSupabaseError(error, { component: 'CreditContext', action: 'fetchBalance', userId: user.id });
      ErrorLogger.error(error, { component: 'CreditContext', action: 'fetchBalance', userId: user.id });
    } finally {
      setLoading(false);
    }
  }, [user]);

  const refreshBalance = useCallback(async () => {
    await fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    if (user) {
      fetchBalance();
      const interval = setInterval(fetchBalance, 30000);
      return () => clearInterval(interval);
    } else {
      setBalance(null);
      setLoading(false);
    }
  }, [user, fetchBalance]);

  useEffect(() => {
    const handleCreditUpdate = () => {
      ErrorLogger.debug('Credit update event received, refreshing balance', { component: 'CreditContext', action: 'handleCreditUpdate' });
      refreshBalance();
    };

    window.addEventListener('creditUpdated', handleCreditUpdate);

    return () => {
      window.removeEventListener('creditUpdated', handleCreditUpdate);
    };
  }, [refreshBalance]);

  return (
    <CreditContext.Provider value={{ balance, loading, refreshBalance }}>
      {children}
    </CreditContext.Provider>
  );
};

export const useCredits = () => {
  const context = useContext(CreditContext);
  if (context === undefined) {
    throw new Error('useCredits must be used within a CreditProvider');
  }
  return context;
};
