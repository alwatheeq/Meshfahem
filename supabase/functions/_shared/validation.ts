/**
 * Shared validation utilities for Supabase Edge Functions
 * Provides consistent request validation patterns
 */

import { errorResponse } from './response.ts';

/**
 * Validate that request method is allowed
 * @param req - Request object
 * @param allowedMethods - Array of allowed HTTP methods
 * @returns Error response if method not allowed, null otherwise
 */
export function validateMethod(
  req: Request,
  allowedMethods: string[]
): Response | null {
  if (!allowedMethods.includes(req.method)) {
    return errorResponse(
      `Method not allowed. Allowed methods: ${allowedMethods.join(', ')}`,
      405
    );
  }
  return null;
}

/**
 * Validate request has JSON content type
 * @param req - Request object
 * @returns Error response if invalid content type, null otherwise
 */
export function validateJsonContentType(req: Request): Response | null {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return errorResponse(
      'Invalid content type. Expected application/json',
      400
    );
  }
  return null;
}

/**
 * Parse and validate JSON request body
 * @param req - Request object
 * @returns Parsed JSON object or error response
 */
export async function parseJsonBody<T = unknown>(
  req: Request
): Promise<{ data: T; error: null } | { data: null; error: Response }> {
  try {
    const body = await req.json() as T;
    return { data: body, error: null };
  } catch (_error) {
    return {
      data: null,
      error: errorResponse(
        'Invalid JSON in request body',
        400
      )
    };
  }
}

/**
 * Validate required fields in an object
 * @param obj - Object to validate
 * @param requiredFields - Array of required field names
 * @returns Error message if validation fails, null otherwise
 */
export function validateRequiredFields(
  obj: Record<string, unknown>,
  requiredFields: string[]
): string | null {
  const missing = requiredFields.filter(field => {
    const value = obj[field];
    return value === undefined || value === null || 
           (typeof value === 'string' && value.trim() === '');
  });

  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(', ')}`;
  }
  return null;
}

/**
 * Validate string is not empty
 * @param value - Value to validate
 * @param fieldName - Name of the field (for error message)
 * @returns Error message if invalid, null otherwise
 */
export function validateNonEmptyString(
  value: unknown,
  fieldName: string
): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return `${fieldName} must be a non-empty string`;
  }
  return null;
}

/**
 * Validate number is within range
 * @param value - Value to validate
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @param fieldName - Name of the field (for error message)
 * @returns Error message if invalid, null otherwise
 */
export function validateNumberRange(
  value: unknown,
  min: number,
  max: number,
  fieldName: string
): string | null {
  if (typeof value !== 'number' || isNaN(value)) {
    return `${fieldName} must be a number`;
  }
  if (value < min || value > max) {
    return `${fieldName} must be between ${min} and ${max}`;
  }
  return null;
}

