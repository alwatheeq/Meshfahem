import React, { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useCredits } from '../../contexts/CreditContext';

export const LowCreditBanner: React.FC = () => {
  const { balance } = useCredits();
  const [showBanner, setShowBanner] = useState(false);
  const [warningLevel, setWarningLevel] = useState<1000 | 500 | 250 | null>(null);

  useEffect(() => {
    if (!balance) return;

    const { credits_remaining } = balance;

    if (credits_remaining <= 250 && warningLevel !== 250) {
      setWarningLevel(250);
      setShowBanner(true);
    } else if (credits_remaining <= 500 && credits_remaining > 250 && warningLevel !== 500) {
      setWarningLevel(500);
      setShowBanner(true);
    } else if (credits_remaining <= 1000 && credits_remaining > 500 && warningLevel !== 1000) {
      setWarningLevel(1000);
      setShowBanner(true);
    } else if (credits_remaining > 1000) {
      setShowBanner(false);
      setWarningLevel(null);
    }
  }, [balance, warningLevel]);

  useEffect(() => {
    const handleLowCreditWarning = (event: CustomEvent) => {
      const { level, creditsRemaining } = event.detail;
      ErrorLogger.debug('Warning triggered', { component: 'LowCreditBanner', action: 'handleLowCreditWarning', level, creditsRemaining });
      setWarningLevel(level);
      setShowBanner(true);
    };

    window.addEventListener('lowCreditWarning', handleLowCreditWarning as EventListener);

    return () => {
      window.removeEventListener('lowCreditWarning', handleLowCreditWarning as EventListener);
    };
  }, []);

  if (!showBanner || !balance || !warningLevel) {
    return null;
  }

  const getWarningConfig = () => {
    const { credits_remaining, cycle_end } = balance;
    const cycleEndDate = cycle_end ? new Date(cycle_end).toLocaleDateString() : 'unknown date';

    switch (warningLevel) {
      case 250:
        return {
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          borderColor: 'border-red-200 dark:border-red-800',
          textColor: 'text-red-800 dark:text-red-200',
          iconColor: 'text-red-600 dark:text-red-400',
          title: 'CRITICAL: Very Low Credits',
          message: `You have only ${credits_remaining.toLocaleString()} credits remaining. You may not be able to complete large requests. Credits will refresh on ${cycleEndDate}.`
        };
      case 500:
        return {
          bgColor: 'bg-orange-50 dark:bg-orange-900/20',
          borderColor: 'border-orange-200 dark:border-orange-800',
          textColor: 'text-orange-800 dark:text-orange-200',
          iconColor: 'text-orange-600 dark:text-orange-400',
          title: 'Low Credits Warning',
          message: `You have ${credits_remaining.toLocaleString()} credits remaining. Consider managing your usage carefully. Credits will refresh on ${cycleEndDate}.`
        };
      case 1000:
        return {
          bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
          borderColor: 'border-yellow-200 dark:border-yellow-800',
          textColor: 'text-yellow-800 dark:text-yellow-200',
          iconColor: 'text-yellow-600 dark:text-yellow-400',
          title: 'Credits Running Low',
          message: `You have ${credits_remaining.toLocaleString()} credits remaining out of ${balance.credits_total.toLocaleString()}. Credits will refresh on ${cycleEndDate}.`
        };
      default:
        return null;
    }
  };

  const config = getWarningConfig();
  if (!config) return null;

  return (
    <div className={`${config.bgColor} ${config.borderColor} border rounded-lg p-4 mb-6 animate-in fade-in slide-in-from-top-2 duration-300`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <AlertTriangle className={`h-5 w-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
          <div className="flex-1">
            <h3 className={`font-semibold ${config.textColor} mb-1`}>
              {config.title}
            </h3>
            <p className={`text-sm ${config.textColor}`}>
              {config.message}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowBanner(false)}
          className={`${config.textColor} hover:opacity-70 transition-opacity flex-shrink-0 ml-2`}
          aria-label="Dismiss warning"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};
