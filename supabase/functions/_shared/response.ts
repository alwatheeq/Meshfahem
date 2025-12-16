/**
 * Shared response utilities for Supabase Edge Functions
 * Provides consistent JSON response formatting with CORS headers
 */

import { corsHeaders } from './cors.ts';

/**
 * Create a JSON response with CORS headers
 * @param body - Response body (will be JSON stringified)
 * @param status - HTTP status code (default: 200)
 * @returns Response object with JSON body and CORS headers
 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      'Content-Type': 'application/json', 
      ...corsHeaders 
    }
  });
}

/**
 * Create an error response with consistent formatting
 * @param message - Error message
 * @param status - HTTP status code (default: 500)
 * @param details - Optional error details
 * @returns Response object with error JSON and CORS headers
 */
export function errorResponse(
  message: string, 
  status = 500, 
  details?: Record<string, unknown>
): Response {
  return jsonResponse(
    { 
      error: message,
      ...(details && { details })
    },
    status
  );
}

/**
 * Create a success response with consistent formatting
 * @param data - Success data
 * @param status - HTTP status code (default: 200)
 * @returns Response object with success JSON and CORS headers
 */
export function successResponse<T>(data: T, status = 200): Response {
  return jsonResponse(
    { success: true, ...(typeof data === 'object' && data !== null ? data : { data }) },
    status
  );
}

