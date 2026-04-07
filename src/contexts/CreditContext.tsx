import React, { createContext, useContext, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useCreditStore, CreditBalance } from '../stores/creditStore';
import { ErrorLogger } from '../utils/errorLogger';

// Re-export types for backward compatibility
export type { CreditBalance };

interface CreditContextType {
  balance: CreditBalance | null;
  loading: boolean;
  refreshBalance: () => Promise<void>;
}

const CreditContext = createContext<CreditContextType | undefined>(undefined);

/**
 * CreditProvider - thin wrapper around Zustand store for backward compatibility.
 * Manages polling lifecycle based on auth state.
 * Components can import useCredits (from here) or useCreditStore (from stores/) directly.
 */
export const CreditProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { balance, loading, refreshBalance, startPolling, stopPolling, clearBalance } = useCreditStore();

  useEffect(() => {
    if (user) {
      startPolling(user.id);
    } else {
      clearBalance();
    }
    return () => stopPolling();
  }, [user, startPolling, stopPolling, clearBalance]);

  useEffect(() => {
    const handleCreditUpdate = () => {
      ErrorLogger.debug('Credit update event received, refreshing balance', {
        component: 'CreditContext',
        action: 'handleCreditUpdate',
      });
      refreshBalance();
    };

    window.addEventListener('creditUpdated', handleCreditUpdate);
    return () => window.removeEventListener('creditUpdated', handleCreditUpdate);
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
