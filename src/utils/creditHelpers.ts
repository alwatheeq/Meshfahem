import { supabase } from '../lib/supabase';
import { handleSupabaseError } from './errorHandler';
import { ErrorLogger } from './errorLogger';

let creditSystemAvailable: boolean | null = null;

export const checkCreditSystemAvailability = async (): Promise<boolean> => {
  if (creditSystemAvailable !== null) {
    return creditSystemAvailable;
  }

  try {
    const { data, error } = await supabase.rpc('get_schema_version');

    if (error) {
      handleSupabaseError(error, { component: 'creditHelpers', action: 'checkCreditSystemAvailability' });
      ErrorLogger.warn('Could not check schema version', { component: 'creditHelpers', action: 'checkCreditSystemAvailability' });
      creditSystemAvailable = false;
      return false;
    }

    const schema = data as { features: { credits_remaining: boolean } };
    creditSystemAvailable = schema?.features?.credits_remaining ?? false;

    ErrorLogger.info('Credit system availability checked', { component: 'creditHelpers', action: 'checkCreditSystemAvailability', available: creditSystemAvailable });
    return creditSystemAvailable;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    handleSupabaseError(err, { component: 'creditHelpers', action: 'checkCreditSystemAvailability' });
    ErrorLogger.error(err, { component: 'creditHelpers', action: 'checkCreditSystemAvailability' });
    creditSystemAvailable = false;
    return false;
  }
};

export const isCreditSystemEnabled = (): boolean => {
  return creditSystemAvailable === true;
};

export const triggerCreditUpdate = () => {
  ErrorLogger.debug('Triggering credit balance refresh', { component: 'creditHelpers', action: 'triggerCreditUpdate' });
  window.dispatchEvent(new CustomEvent('creditUpdated'));
};

export const handleCreditNotifications = async (
  notificationFlags: {
    notify_1000?: boolean;
    notify_500?: boolean;
    notify_250?: boolean;
  },
  creditsRemaining: number,
  cycleEnd: string
) => {
  // Check if credit system is available first
  const isAvailable = await checkCreditSystemAvailability();
  if (!isAvailable) {
    ErrorLogger.debug('Skipping notifications - credit system not available', { component: 'creditHelpers', action: 'handleCreditNotifications' });
    return;
  }

  if (notificationFlags.notify_1000) {
    ErrorLogger.warn('Credit warning: below 1000 threshold', { component: 'creditHelpers', action: 'handleCreditNotifications', creditsRemaining, threshold: 1000, cycleEnd });
    window.dispatchEvent(
      new CustomEvent('lowCreditWarning', {
        detail: {
          level: 1000,
          creditsRemaining,
          cycleEnd,
          message: `You have ${creditsRemaining} credits remaining. Your credits will refresh on ${new Date(
            cycleEnd
          ).toLocaleDateString()}.`,
        },
      })
    );
  }

  if (notificationFlags.notify_500) {
    ErrorLogger.warn('Credit warning: below 500 threshold', { component: 'creditHelpers', action: 'handleCreditNotifications', creditsRemaining, threshold: 500, cycleEnd });
    window.dispatchEvent(
      new CustomEvent('lowCreditWarning', {
        detail: {
          level: 500,
          creditsRemaining,
          cycleEnd,
          message: `You have ${creditsRemaining} credits remaining. Your credits will refresh on ${new Date(
            cycleEnd
          ).toLocaleDateString()}.`,
        },
      })
    );
  }

  if (notificationFlags.notify_250) {
    ErrorLogger.warn('Credit warning: CRITICAL - below 250 threshold', { component: 'creditHelpers', action: 'handleCreditNotifications', creditsRemaining, threshold: 250, cycleEnd });
    window.dispatchEvent(
      new CustomEvent('lowCreditWarning', {
        detail: {
          level: 250,
          creditsRemaining,
          cycleEnd,
          message: `CRITICAL: You have ${creditsRemaining} credits remaining. Your credits will refresh on ${new Date(
            cycleEnd
          ).toLocaleDateString()}.`,
        },
      })
    );
  }
};
