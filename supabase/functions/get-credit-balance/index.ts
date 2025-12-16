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

  const methodError = validateMethod(req, ['GET']);
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

    // Call get_user_credit_balance function
    const { data, error } = await supabase.rpc('get_user_credit_balance', {
      p_user_id: authResult.user.id
    });

    if (error) {
      console.error('Error fetching credit balance:', error);
      return errorResponse('Failed to fetch balance', 500);
    }

    if (!data.success) {
      return errorResponse(data.error || 'Failed to fetch balance', 400);
    }

    // Return balance
    return successResponse({
      credits_remaining: data.credits_remaining,
      credits_total: data.credits_total,
      cycle_start: data.cycle_start,
      cycle_end: data.cycle_end,
      free_credits_claimed: data.free_credits_claimed
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
});
