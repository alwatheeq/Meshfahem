/**
 * Shared CORS headers for all Supabase Edge Functions
 * Ensures consistent CORS configuration across all endpoints
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET, PUT, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, stripe-signature',
};

/**
 * Handle CORS preflight requests
 */
export function handleCorsPreflight(): Response {
  return new Response(null, { 
    headers: corsHeaders, 
    status: 200 
  });
}

