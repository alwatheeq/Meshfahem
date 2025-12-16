import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { ErrorLogger } from '../../utils/errorLogger';

interface CreditBalance {
  credits_remaining: number;
  credits_total: number;
  cycle_end: string | null;
}

export const CreditBalanceWidget: React.FC = () => {
  const { user } = useAuth();
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchBalance();
      // Set up interval to refresh balance every 30 seconds
      const interval = setInterval(fetchBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchBalance = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('get_user_credit_balance', {
        p_user_id: user.id
      });

      if (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        ErrorLogger.error(err, { component: 'CreditBalanceWidget', action: 'fetchBalance', userId: user.id });
        return;
      }

      if (data && data.success) {
        setBalance({
          credits_remaining: data.credits_remaining,
          credits_total: data.credits_total,
          cycle_end: data.cycle_end
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'CreditBalanceWidget', action: 'fetchBalance', userId: user?.id });
    } finally {
      setLoading(false);
    }
  };

  if (loading || !balance) {
    return null;
  }

  const percentage = balance.credits_total > 0
    ? (balance.credits_remaining / balance.credits_total) * 100
    : 0;

  // Determine color based on percentage
  const getColor = () => {
    if (percentage > 30) return 'text-green-600 dark:text-green-400';
    if (percentage > 10) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getBarColor = () => {
    if (percentage > 30) return 'bg-green-500';
    if (percentage > 10) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Credit Balance</p>
          <p className={`text-xl font-bold ${getColor()}`}>
            {balance.credits_remaining.toLocaleString()} / {balance.credits_total.toLocaleString()}
          </p>
        </div>
        <div className={`text-2xl ${getColor()}`}>
          💳
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
        <div
          className={`${getBarColor()} h-2 rounded-full transition-all duration-300`}
          style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
        />
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {percentage.toFixed(0)}% remaining
        {balance.cycle_end && (
          <span className="ml-1">
            · Resets {new Date(balance.cycle_end).toLocaleDateString()}
          </span>
        )}
      </p>
    </div>
  );
};
