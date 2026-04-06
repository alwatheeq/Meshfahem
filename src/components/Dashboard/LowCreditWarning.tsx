import React, { useState, useEffect } from 'react';
import { AlertTriangle, CreditCard, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { ErrorLogger } from '../../utils/errorLogger';

export const LowCreditWarning: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [creditBalance, setCreditBalance] = useState<{
    credits_remaining: number;
    credits_total: number;
    cycle_end: string | null;
  } | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (user) {
      fetchCreditBalance();
      const interval = setInterval(fetchCreditBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchCreditBalance = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc('get_user_credit_balance', {
        p_user_id: user.id
      });
      if (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        ErrorLogger.error(err, { component: 'LowCreditWarning', action: 'fetchCreditBalance', userId: user.id });
        return;
      }
      if (data && data.success) {
        setCreditBalance({
          credits_remaining: data.credits_remaining,
          credits_total: data.credits_total,
          cycle_end: data.cycle_end
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'LowCreditWarning', action: 'fetchCreditBalance', userId: user?.id });
    }
  };

  if (!creditBalance || isDismissed) return null;

  const percentage = (creditBalance.credits_remaining / creditBalance.credits_total) * 100;

  if (percentage > 20) return null;

  const getWarningLevel = () => {
    if (percentage <= 5) return 'critical';
    if (percentage <= 10) return 'high';
    return 'medium';
  };

  const warningLevel = getWarningLevel();

  const warningStyles = {
    critical: {
      bg: 'bg-red-50 dark:bg-red-900/30',
      border: 'border-red-300 dark:border-red-700',
      text: 'text-red-900 dark:text-red-200',
      icon: 'text-red-600 dark:text-red-400',
      button: 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800'
    },
    high: {
      bg: 'bg-orange-50 dark:bg-orange-900/30',
      border: 'border-orange-300 dark:border-orange-700',
      text: 'text-orange-900 dark:text-orange-200',
      icon: 'text-orange-600 dark:text-orange-400',
      button: 'bg-orange-600 hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-800'
    },
    medium: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/30',
      border: 'border-yellow-300 dark:border-yellow-700',
      text: 'text-yellow-900 dark:text-yellow-200',
      icon: 'text-yellow-600 dark:text-yellow-400',
      button: 'bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-700 dark:hover:bg-yellow-800'
    }
  };

  const style = warningStyles[warningLevel];

  const getWarningMessage = () => {
    if (warningLevel === 'critical') {
      return 'Critical: You have very few credits remaining';
    }
    if (warningLevel === 'high') {
      return 'Warning: Your credits are running low';
    }
    return 'Notice: Your credit balance is getting low';
  };

  const getDaysUntilRefresh = () => {
    if (!creditBalance.cycle_end) return null;
    const now = new Date();
    const end = new Date(creditBalance.cycle_end);
    const days = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const daysUntilRefresh = getDaysUntilRefresh();

  return (
    <div className={`${style.bg} border ${style.border} rounded-md p-4 mb-6 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <div className={`${style.icon} mt-0.5`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className={`text-sm font-semibold ${style.text} mb-1`}>
              {getWarningMessage()}
            </h3>
            <p className={`text-sm ${style.text} opacity-90 mb-3`}>
              You have <span className="font-bold">{creditBalance.credits_remaining.toLocaleString()}</span> credits
              remaining out of <span className="font-bold">{creditBalance.credits_total.toLocaleString()}</span>
              {daysUntilRefresh && (
                <span> (resets in {daysUntilRefresh} {daysUntilRefresh === 1 ? 'day' : 'days'})</span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate('/pricing')}
                className={`${style.button} text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center space-x-2`}
              >
                <CreditCard className="h-4 w-4" />
                <span>Upgrade Plan</span>
              </button>
              <button
                onClick={() => navigate('/profile')}
                className={`${style.text} hover:underline text-sm font-medium`}
              >
                View Usage Details
              </button>
            </div>
          </div>
        </div>
        <button
          onClick={() => setIsDismissed(true)}
          className={`${style.text} hover:opacity-70 transition ml-2`}
          aria-label="Dismiss warning"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
