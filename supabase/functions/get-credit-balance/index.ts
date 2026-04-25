/// <reference path="../_shared/deno.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface CreditBalanceResult {
  success: boolean;
  credits_remaining?: number;
  credits_total?: number;
  cycle_start?: string;
  cycle_end?: string;
  free_credits_claimed?: boolean;
  error?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  const startTime = Date.now();

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 200 });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: 'Server configuration error' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    // Robust token extraction
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    // Attach user JWT to all requests on this client so auth.uid() works in RLS and RPCs
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const { data, error } = await supabase.rpc('get_user_credit_balance');

    if (error) {
      console.error('get_user_credit_balance RPC error:', error);
      return json({ error: 'Failed to fetch balance' }, 500);
    }

    const result = data as CreditBalanceResult;

    if (!result || typeof result.success !== 'boolean') {
      console.error('Unexpected response shape from get_user_credit_balance:', data);
      return json({ error: 'Failed to fetch balance' }, 500);
    }

    if (!result.success) {
      return json({ error: result.error || 'Failed to fetch balance' }, 400);
    }

    console.log(`get-credit-balance userId=${user.id} duration=${Date.now() - startTime}ms`);

    return json({
      success: true,
      credits_remaining: result.credits_remaining,
      credits_total: result.credits_total,
      cycle_start: result.cycle_start,
      cycle_end: result.cycle_end,
      free_credits_claimed: result.free_credits_claimed,
    });
  } catch (err: unknown) {
    console.error('Unexpected error in get-credit-balance:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});