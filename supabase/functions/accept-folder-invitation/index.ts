import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse, successResponse } from '../_shared/response.ts';
import { authenticateUser, getSupabaseClient } from '../_shared/auth.ts';
import { validateMethod, parseJsonBody, validateRequiredFields } from '../_shared/validation.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const methodError = validateMethod(req, ['POST']);
  if (methodError) {
    return methodError;
  }

  const supabase = getSupabaseClient();

  try {
    const bodyResult = await parseJsonBody<{
      folder_id: string;
    }>(req);
    if (bodyResult.error) {
      return bodyResult.error;
    }

    const { folder_id } = bodyResult.data;

    const authResult = await authenticateUser(req, true);
    if (authResult.error || !authResult.user) {
      return errorResponse(authResult.error || 'Unauthorized', 401);
    }

    const currentUserId = authResult.user.id;

    const missingFields = validateRequiredFields(
      { folder_id },
      ['folder_id']
    );
    if (missingFields) {
      return errorResponse(missingFields, 400);
    }

    // Check if there's a pending invitation for this user and folder
    const { data: invitation, error: fetchError } = await supabase
      .from('folder_collaborators')
      .select('id, status')
      .eq('folder_id', folder_id)
      .eq('user_id', currentUserId)
      .single();

    if (fetchError || !invitation) {
      return errorResponse('No pending invitation found for this folder and user', 404);
    }

    if (invitation.status === 'accepted') {
      return successResponse({ message: 'Invitation already accepted' });
    }

    // Update status to 'accepted'
    const { data, error: updateError } = await supabase
      .from('folder_collaborators')
      .update({ status: 'accepted' })
      .eq('id', invitation.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error accepting invitation:', updateError);
      return errorResponse('Failed to accept invitation', 500);
    }

    return successResponse({ collaborator: data, message: 'Invitation accepted successfully' });

  } catch (error) {
    console.error('Edge Function error:', error);
    return errorResponse(
      `Server error: ${error instanceof Error ? error.message : String(error)}`,
      500
    );
  }
});