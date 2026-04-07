// Cleanup Service
// Utility functions for data retention and cleanup operations

import { supabase } from '../lib/supabase';
import { ErrorLogger } from './errorLogger';

interface CleanupResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

interface HistoryItem {
  id: string;
  created_at: string;
  expires_at: string;
}

interface LibraryItem {
  id: string;
  created_at: string;
}

interface RetentionStats {
  history: {
    total: number;
    active: number;
    expired: number;
  };
  library: {
    total: number;
    permanent: number;
  };
  dataRetentionPolicy: {
    historyRetentionDays: number;
    libraryRetentionDays: string;
  };
}

interface CleanupScheduleInfo {
  automaticCleanup: {
    enabled: boolean;
    frequency: string;
    nextRun: string;
    description: string;
  };
  manualCleanup: {
    available: boolean;
    description: string;
  };
}

/**
 * Manually trigger cleanup of expired history entries
 */
export const triggerManualCleanup = async (): Promise<CleanupResult> => {
  try {
    ErrorLogger.info('Triggering manual cleanup of expired history entries', { component: 'cleanupService', action: 'triggerManualCleanup' } as Record<string, unknown>);

    const { data, error } = await supabase.functions.invoke('cleanup-expired-history', {
      body: {}
    });

    if (error) {
      throw new Error(error.message || 'Failed to trigger cleanup');
    }

    ErrorLogger.info('Cleanup completed', { component: 'cleanupService', action: 'triggerManualCleanup', cleanupData: data } as Record<string, unknown>);
    return {
      success: true,
      ...data
    };
  } catch (error: unknown) {
    const err: Error = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'cleanupService', action: 'triggerManualCleanup' } as Record<string, unknown>);
    return {
      success: false,
      error: err.message
    };
  }
};

/**
 * Get retention statistics for user data
 */
export const getRetentionStats = async (): Promise<RetentionStats> => {
  if (!supabase.auth.user) {
    throw new Error('User must be authenticated');
  }

  try {
    const userId: string = (supabase.auth as unknown as { user: { id: string } }).user.id;
    const currentTime: string = new Date().toISOString();

    // Get history statistics
    const { data: historyData, error: historyError } = await supabase
      .from('user_history')
      .select('id, created_at, expires_at')
      .eq('user_id', userId);

    if (historyError) {
      throw historyError;
    }

    // Get library statistics
    const { data: libraryData, error: libraryError } = await supabase
      .from('user_library_items')
      .select('id, created_at')
      .eq('user_id', userId);

    if (libraryError) {
      throw libraryError;
    }

    // Calculate statistics
    const totalHistoryItems: number = historyData?.length || 0;
    const expiredHistoryItems: number = historyData?.filter((item: HistoryItem) =>
      new Date(item.expires_at) <= new Date(currentTime)
    ).length || 0;
    const activeHistoryItems: number = totalHistoryItems - expiredHistoryItems;

    const totalLibraryItems: number = libraryData?.length || 0;

    return {
      history: {
        total: totalHistoryItems,
        active: activeHistoryItems,
        expired: expiredHistoryItems
      },
      library: {
        total: totalLibraryItems,
        permanent: totalLibraryItems // Library items don't expire
      },
      dataRetentionPolicy: {
        historyRetentionDays: 365,
        libraryRetentionDays: 'Permanent'
      }
    };
  } catch (error: unknown) {
    const err: Error = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'cleanupService', action: 'getRetentionStats' } as Record<string, unknown>);
    throw err;
  }
};

/**
 * Schedule automatic cleanup (placeholder for future cron job setup)
 */
export const getCleanupScheduleInfo = (): CleanupScheduleInfo => {
  return {
    automaticCleanup: {
      enabled: true,
      frequency: 'daily',
      nextRun: 'Managed by Supabase Edge Functions',
      description: 'Expired history entries are automatically cleaned up daily'
    },
    manualCleanup: {
      available: true,
      description: 'You can manually trigger cleanup using the triggerManualCleanup function'
    }
  };
};
