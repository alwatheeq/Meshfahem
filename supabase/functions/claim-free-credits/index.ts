import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse, successResponse } from '../_shared/response.ts';
import { authenticateUser, getSupabaseClient } from '../_shared/auth.ts';
import { validateMethod } from '../_shared/validation.ts';

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const methodError = validateMethod(req, ['POST']);
  if (methodError) {
    return methodError;
  }

  try {
    // Authenticate user
    const authResult = await authenticateUser(req, true);
    if (authResult.error || !authResult.user) {
      return errorResponse(authResult.error || 'Unauthorized', 401);
    }

    const supabase = getSupabaseClient();

    // Call claim_free_credits function
    const { data, error } = await supabase.rpc('claim_free_credits', {
      p_user_id: authResult.user.id
    });

    if (error) {
      console.error('Error claiming free credits:', error);
      return errorResponse('Failed to claim credits', 500);
    }

    if (!data.success) {
      return errorResponse(data.error || 'Failed to claim credits', 400);
    }

    // Return success
    return successResponse({
      credits_added: data.credits_added,
      new_balance: data.new_balance
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
});
