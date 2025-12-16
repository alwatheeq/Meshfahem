import { createClient } from 'npm:@supabase/supabase-js@2.54.0';
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse, successResponse } from '../_shared/response.ts';
import { getSupabaseClient } from '../_shared/auth.ts';
import { validateMethod } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const methodError = validateMethod(req, ['POST']);
  if (methodError) {
    return methodError;
  }

  try {
    const supabase = getSupabaseClient();
    console.log('🧹 Starting cleanup of expired history entries...');
    
    const currentTime = new Date().toISOString();
    
    // Delete expired history entries
    const { data: deletedEntries, error: deleteError } = await supabase
      .from('user_history')
      .delete()
      .lt('expires_at', currentTime)
      .select('id');

    if (deleteError) {
      console.error('❌ Error deleting expired entries:', deleteError);
      return errorResponse(
        `Failed to cleanup expired entries: ${deleteError.message}`,
        500
      );
    }

    const deletedCount = deletedEntries?.length || 0;
    console.log(`✅ Successfully deleted ${deletedCount} expired history entries`);

    // Also cleanup any expired cached content (if any exists)
    const { data: deletedCache, error: cacheError } = await supabase
      .from('cached_content')
      .delete()
      .lt('expires_at', currentTime)
      .select('id');

    if (cacheError) {
      console.warn('⚠️ Error cleaning cached content (non-critical):', cacheError);
    }

    const deletedCacheCount = deletedCache?.length || 0;
    console.log(`✅ Successfully deleted ${deletedCacheCount} expired cache entries`);

    // Get statistics about remaining data
    const { data: historyStats, error: statsError } = await supabase
      .from('user_history')
      .select('id', { count: 'exact', head: true });

    const remainingHistoryCount = historyStats?.length || 0;

    return successResponse({
      message: 'Cleanup completed successfully',
      statistics: {
        deletedHistoryEntries: deletedCount,
        deletedCacheEntries: deletedCacheCount,
        remainingHistoryEntries: remainingHistoryCount,
        cleanupTimestamp: currentTime
      }
    });

  } catch (error) {
    console.error('💥 Cleanup function error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Server error during cleanup',
      500
    );
  }
});