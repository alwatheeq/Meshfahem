/// <reference path="../_shared/deno.d.ts" />
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // ✅ Authorize caller (cron secret)
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');

  if (!cronSecret || !providedSecret || providedSecret !== cronSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // ✅ Validate env vars
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  try {
    console.log('🧹 Starting cleanup of expired history entries...');
    const currentTime = new Date().toISOString();

    const { data: deletedEntries, error: deleteError } = await supabase
      .from('user_history')
      .delete()
      .lt('expires_at', currentTime)
      .select('id');

    if (deleteError) {
      console.error('❌ Error deleting expired entries:', deleteError);
      return jsonResponse({
        error: 'Failed to cleanup expired entries',
        details: deleteError.message
      }, 500);
    }

    const deletedCount = deletedEntries?.length || 0;
    console.log(`✅ Deleted ${deletedCount} expired history entries`);

    const { data: deletedCache, error: cacheError } = await supabase
      .from('cached_content')
      .delete()
      .lt('expires_at', currentTime)
      .select('id');

    if (cacheError) {
      console.warn('⚠️ Error cleaning cached content (non-critical):', cacheError);
    }

    const deletedCacheCount = deletedCache?.length || 0;
    console.log(`✅ Deleted ${deletedCacheCount} expired cache entries`);

    // ✅ Correct remaining count
    const { count: remainingHistoryCount, error: statsError } = await supabase
      .from('user_history')
      .select('id', { count: 'exact', head: true });

    if (statsError) {
      console.warn('⚠️ Failed to fetch remaining count:', statsError);
    }

    return jsonResponse({
      success: true,
      message: 'Cleanup completed successfully',
      statistics: {
        deletedHistoryEntries: deletedCount,
        deletedCacheEntries: deletedCacheCount,
        remainingHistoryEntries: remainingHistoryCount ?? null,
        cleanupTimestamp: currentTime
      }
    });

  } catch (error: unknown) {
    console.error('💥 Cleanup function error:', error);
    const details = error instanceof Error ? error.message : String(error);
    return jsonResponse({
      error: 'Server error during cleanup',
      details
    }, 500);
  }
});
