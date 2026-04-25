/// <reference path="../_shared/deno.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  // ✅ Enforce POST only
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: 'Server configuration error' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // Call claim_free_credits function
    const { data, error } = await supabase.rpc('claim_free_credits', {
      p_user_id: user.id
    });

    if (error) {
      console.error('Error claiming free credits (rpc error):', error);
      return json({ error: 'Failed to claim credits' }, 500);
    }

    // ✅ Validate RPC return shape
    const row = data as { success?: unknown; credits_added?: unknown; new_balance?: unknown; error?: unknown };
    if (!data || typeof data !== 'object' || typeof row.success !== 'boolean') {
      console.error('Unexpected claim_free_credits response shape:', data);
      return json({ error: 'Failed to claim credits' }, 500);
    }

    const result = row as { success: boolean; credits_added?: number; new_balance?: number; error?: string };

    if (!result.success) {
      return json({ error: result.error || 'Failed to claim credits' }, 400);
    }

    return json({
      success: true,
      credits_added: result.credits_added,
      new_balance: result.new_balance
    }, 200);

  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});
