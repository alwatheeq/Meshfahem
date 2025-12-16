import React, { useEffect } from 'react';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../hooks/useAuth';
import { ErrorLogger } from '../utils/errorLogger'; // ErrorLogger import

export const SubscriptionRefreshListener: React.FC = () => {
  const { refresh } = useSubscription();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    ErrorLogger.debug('Setting up visibility listener', { component: 'SubscriptionRefreshListener', action: 'setupListeners', userId: user.id });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        ErrorLogger.debug('App became visible, refreshing subscription', { component: 'SubscriptionRefreshListener', action: 'handleVisibilityChange', userId: user.id });
        refresh();
      }
    };

    const handleFocus = () => {
      ErrorLogger.debug('Window focused, refreshing subscription', { component: 'SubscriptionRefreshListener', action: 'handleFocus', userId: user.id });
      refresh();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      ErrorLogger.debug('Cleaning up listeners', { component: 'SubscriptionRefreshListener', action: 'cleanup', userId: user.id });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, refresh]);

  return null;
};
