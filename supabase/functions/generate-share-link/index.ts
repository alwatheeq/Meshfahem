import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse, successResponse } from '../_shared/response.ts';
import { authenticateUser, getSupabaseClient } from '../_shared/auth.ts';
import { validateMethod, parseJsonBody, validateRequiredFields } from '../_shared/validation.ts';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const methodError = validateMethod(req, ['POST']);
  if (methodError) {
    return methodError;
  }

  // Initialize Supabase client
  const supabase = getSupabaseClient();

  try {
    const bodyResult = await parseJsonBody<{
      item_id: string;
      action: string;
    }>(req);
    if (bodyResult.error) {
      return bodyResult.error;
    }

    const { item_id, action } = bodyResult.data;

    // Authenticate user
    const authResult = await authenticateUser(req, true);
    if (authResult.error || !authResult.user) {
      return errorResponse(authResult.error || 'Unauthorized', 401);
    }

    const missingFields = validateRequiredFields(
      { item_id, action },
      ['item_id', 'action']
    );
    if (missingFields) {
      return errorResponse(missingFields, 400);
    }

    // Verify user owns the item
    const { data: item, error: itemError } = await supabase
      .from('user_library_items')
      .select('id, user_id, title, shareable_link, is_public')
      .eq('id', item_id)
      .eq('user_id', authResult.user.id)
      .single();

    if (itemError || !item) {
      return errorResponse('Item not found or access denied', 404);
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
        return errorResponse('Failed to generate share link', 500);
      }

      // Construct the public URL
      const baseUrl = req.headers.get('origin') || 'https://your-app.com';
      const publicUrl = `${baseUrl}/share/${shareableLink}`;

      return successResponse({
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
        return errorResponse('Failed to revoke share link', 500);
      }

      return successResponse({
        message: 'Share link revoked successfully'
      });

    } else {
      return errorResponse('Invalid action. Use "generate" or "revoke"', 400);
    }

  } catch (error) {
    console.error('Share link function error:', error);
    return errorResponse(
      `Server error: ${error instanceof Error ? error.message : String(error)}`,
      500
    );
  }
});