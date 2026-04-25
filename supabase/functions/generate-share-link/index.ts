/// <reference path="../_shared/deno.d.ts" />
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // Initialize Supabase client
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: {
        persistSession: false,
      },
    }
  );

  try {
    const requestBody = await req.json();
    const { item_id, action } = requestBody;

    // Extract user ID from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Authorization required' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: 'Invalid authorization' }, 401);
    }

    if (!item_id || !action) {
      return jsonResponse({ error: 'item_id and action are required' }, 400);
    }

    // Verify user owns the item
    const { data: item, error: itemError } = await supabase
      .from('user_library_items')
      .select('id, user_id, title, shareable_link, is_public')
      .eq('id', item_id)
      .eq('user_id', user.id)
      .single();

    if (itemError || !item) {
      return jsonResponse({ error: 'Item not found or access denied' }, 404);
    }

    if (action === 'generate') {
      // Generate new shareable link
      const shareableLink = crypto.randomUUID();

      const { error: updateError } = await supabase
        .from('user_library_items')
        .update({
          shareable_link: shareableLink,
          is_public: true
        })
        .eq('id', item_id);

      if (updateError) {
        return jsonResponse({ error: 'Failed to generate share link' }, 500);
      }

      // Construct the public URL
      const baseUrl = req.headers.get('origin') || 'https://your-app.com';
      const publicUrl = `${baseUrl}/share/${shareableLink}`;

      return jsonResponse({
        success: true,
        shareable_link: shareableLink,
        public_url: publicUrl,
        message: 'Share link generated successfully'
      });

    } else if (action === 'revoke') {
      // Revoke sharing
      const { error: updateError } = await supabase
        .from('user_library_items')
        .update({
          shareable_link: null,
          is_public: false
        })
        .eq('id', item_id);

      if (updateError) {
        return jsonResponse({ error: 'Failed to revoke share link' }, 500);
      }

      return jsonResponse({
        success: true,
        message: 'Share link revoked successfully'
      });

    } else {
      return jsonResponse({ error: 'Invalid action. Use "generate" or "revoke"' }, 400);
    }

  } catch (error: unknown) {
    console.error('Share link function error:', error);
    const details = error instanceof Error ? error.message : String(error);
    return jsonResponse({
      error: 'Server error',
      details
    }, 500);
  }
});
