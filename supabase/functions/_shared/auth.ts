/**
 * Shared authentication utilities for Supabase Edge Functions
 * Provides consistent user authentication patterns
 */

import { createClient } from 'npm:@supabase/supabase-js@2.54.0';
import { errorResponse } from './response.ts';

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

export interface AuthResult {
  user: AuthenticatedUser | null;
  error: string | null;
}

/**
 * Authenticate user from request Authorization header
 * @param req - Request object
 * @param requireAuth - Whether authentication is required (default: true)
 * @returns AuthResult with user and error
 */
export async function authenticateUser(
  req: Request,
  requireAuth = true
): Promise<AuthResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      user: null,
      error: 'Server configuration error: Missing Supabase credentials'
    };
  }

  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader) {
    if (requireAuth) {
      return {
        user: null,
        error: 'Missing authorization header'
      };
    }
    return { user: null, error: null };
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return {
        user: null,
        error: 'Unauthorized: Invalid or expired token'
      };
    }

    return {
      user: {
        id: user.id,
        email: user.email
      },
      error: null
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      user: null,
      error: 'Authentication failed'
    };
  }
}

/**
 * Get Supabase client with service role key (for admin operations)
 * @returns Supabase client instance
 */
export function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
    },
  });
}

/**
 * Create an unauthorized response
 * @param message - Optional custom error message
 * @returns 401 error response
 */
export function unauthorizedResponse(message = 'Unauthorized'): Response {
  return errorResponse(message, 401);
}

