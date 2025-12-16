// Cleanup Service
// Utility functions for data retention and cleanup operations

import { supabase } from '../lib/supabase';
import { ErrorLogger } from './errorLogger';

/**
 * Manually trigger cleanup of expired history entries
 * @returns {Promise<Object>} - Cleanup results
 */
export const triggerManualCleanup = async () => {
  try {
    ErrorLogger.info('Triggering manual cleanup of expired history entries', { component: 'cleanupService', action: 'triggerManualCleanup' });
    
    const { data, error } = await supabase.functions.invoke('cleanup-expired-history', {
      body: {}
    });

    if (error) {
      throw new Error(error.message || 'Failed to trigger cleanup');
    }

    ErrorLogger.info('Cleanup completed', { component: 'cleanupService', action: 'triggerManualCleanup', cleanupData: data });
    return {
      success: true,
      ...data
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'cleanupService', action: 'triggerManualCleanup' });
    return {
      success: false,
      error: err.message
    };
  }
};

/**
 * Get retention statistics for user data
 * @returns {Promise<Object>} - Data retention statistics
 */
export const getRetentionStats = async () => {
  if (!supabase.auth.user) {
    throw new Error('User must be authenticated');
  }

  try {
    const userId = supabase.auth.user.id;
    const currentTime = new Date().toISOString();

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
    const totalHistoryItems = historyData?.length || 0;
    const expiredHistoryItems = historyData?.filter(item => 
      new Date(item.expires_at) <= new Date(currentTime)
    ).length || 0;
    const activeHistoryItems = totalHistoryItems - expiredHistoryItems;
    
    const totalLibraryItems = libraryData?.length || 0;

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
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'cleanupService', action: 'getRetentionStats' });
    throw err;
  }
};

/**
 * Schedule automatic cleanup (placeholder for future cron job setup)
 * @returns {Object} - Scheduling information
 */
export const getCleanupScheduleInfo = () => {
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