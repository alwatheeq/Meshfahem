import { ErrorLogger, ErrorContext } from './errorLogger';

/**
 * Standardized error handling utility
 * Provides consistent error handling patterns across the application
 */

export interface ApiError extends Error {
  code?: string;
  details?: string;
  hint?: string;
  statusCode?: number;
}

/**
 * Turn any thrown/caught value into a safe user-visible string (toasts, alerts).
 * Handles Error, PostgREST-style plain objects, and avoids "[object Object]".
 */
export function toErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error === null || error === undefined) return fallback;
  if (typeof error === 'string') return error || fallback;

  if (error instanceof Error) {
    const m = error.message?.trim();
    return m || fallback;
  }

  if (typeof error === 'object') {
    const o = error as Record<string, unknown>;
    const msg = o.message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();

    const parts: string[] = [];
    if (typeof o.code === 'string' && o.code) parts.push(o.code);
    if (typeof o.details === 'string' && o.details) parts.push(o.details);
    if (typeof o.hint === 'string' && o.hint) parts.push(o.hint);
    if (parts.length) return parts.join(' — ');

    try {
      const s = JSON.stringify(error);
      if (s && s !== '{}') return s.length > 200 ? `${s.slice(0, 200)}…` : s;
    } catch {
      /* ignore */
    }
  }

  const coerced = String(error);
  if (coerced === '[object Object]') return fallback;
  return coerced || fallback;
}

/**
 * Handle API errors with standardized logging and user-friendly messages
 */
export const handleApiError = (
  error: unknown,
  context: ErrorContext,
  userMessage?: string
): string => {
  const err = error instanceof Error ? error : new Error(String(error));
  const apiError = err as ApiError;

  // Log to ErrorLogger
  ErrorLogger.error(err, context);

  // Return user-friendly message
  if (userMessage) {
    return userMessage;
  }

  // Generate user-friendly message based on error type
  if (apiError.code === 'PGRST116' || apiError.message.includes('not found')) {
    return 'The requested item was not found.';
  }

  if (apiError.code === '23505' || apiError.message.includes('duplicate')) {
    return 'This item already exists.';
  }

  if (apiError.code === '42501' || apiError.message.includes('permission') || apiError.message.includes('policy')) {
    return 'You do not have permission to perform this action.';
  }

  if (apiError.message.includes('network') || apiError.message.includes('fetch')) {
    return 'Network error. Please check your connection and try again.';
  }

  if (apiError.message.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }

  // Default message
  return apiError.message || 'An unexpected error occurred. Please try again.';
};

/**
 * Handle validation errors with standardized toast notifications
 */
export const handleValidationError = (message: string, showToast: (msg: string) => void): void => {
  ErrorLogger.warn(message, { component: 'Validation', action: 'validate' });
  showToast(message);
};

/**
 * Wrapper function for automatic error handling
 * Automatically logs errors and provides error recovery
 */
export function withErrorHandling<T extends (...args: unknown[]) => unknown>(
  fn: T,
  context: ErrorContext,
  options: {
    onError?: (error: Error) => void;
    retryCount?: number;
    retryDelay?: number;
  } = {}
): T {
  const { onError, retryCount = 0, retryDelay = 1000 } = options;

  return ((...args: Parameters<T>) => {
    const execute = async (attempt: number): Promise<ReturnType<T>> => {
      try {
        const result = fn(...args);
        
        if (result instanceof Promise) {
          return await result.catch(async (error) => {
            ErrorLogger.error(error, { ...context, attempt });
            
            // Retry logic for network errors
            if (attempt < retryCount && (
              error.message?.includes('network') ||
              error.message?.includes('fetch') ||
              error.message?.includes('timeout')
            )) {
              await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
              return execute(attempt + 1);
            }

            if (onError) {
              onError(error);
            }
            throw error;
          });
        }
        
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        ErrorLogger.error(err, { ...context, attempt });
        
        // Retry logic for network errors
        if (attempt < retryCount && (
          err.message?.includes('network') ||
          err.message?.includes('fetch') ||
          err.message?.includes('timeout')
        )) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
          return execute(attempt + 1);
        }

        if (onError) {
          onError(err);
        }
        throw err;
      }
    };

    return execute(0);
  }) as T;
}

/**
 * Check if user is offline
 */
export const isOffline = (): boolean => {
  return !navigator.onLine;
};

/**
 * Handle offline scenarios
 */
export const handleOfflineError = (showToast: (msg: string) => void): void => {
  if (isOffline()) {
    ErrorLogger.warn('User is offline', { component: 'Network', action: 'checkConnection' });
    showToast('You are currently offline. Please check your internet connection.');
  }
};

/**
 * Standardized Supabase error handler
 * Extracts user-friendly messages from Supabase errors
 */
export const handleSupabaseError = (
  error: unknown,
  context: ErrorContext,
  defaultMessage: string = 'An error occurred. Please try again.'
): string => {
  if (!error) {
    return defaultMessage;
  }

  const err = error as ApiError;
  ErrorLogger.error(err, context);

  // Supabase-specific error handling
  if (err.code) {
    switch (err.code) {
      case 'PGRST116':
        return 'The requested item was not found.';
      case '23505':
        return 'This item already exists.';
      case '42501':
        return 'You do not have permission to perform this action.';
      case '23503':
        return 'This item is referenced elsewhere and cannot be deleted.';
      case '23514':
        return 'Invalid data provided. Please check your input.';
      default:
        if (err.hint) {
          return `${err.message}. ${err.hint}`;
        }
        return err.message || defaultMessage;
    }
  }

  return err.message || defaultMessage;
};

