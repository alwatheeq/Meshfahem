export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

interface ErrorEntry {
    error: Error;
    context: ErrorContext;
    timestamp: Date;
  level: LogLevel;
}

export class ErrorLogger {
  private static errors: ErrorEntry[] = [];
  private static errorFrequency: Map<string, number> = new Map();
  private static lastErrorTime: Map<string, number> = new Map();
  private static readonly DEDUPE_WINDOW_MS = 60000; // 1 minute
  private static readonly MAX_ERRORS = 100;
  private static readonly MIN_LOG_LEVEL = import.meta.env.PROD ? LogLevel.WARN : LogLevel.DEBUG;
  private static backendLogQueue: Array<{ error: Error; context: ErrorContext; level: LogLevel }> = [];
  private static backendLogProcessing = false;

  static log(error: Error, context: ErrorContext = {}, level: LogLevel = LogLevel.ERROR): void {
    // Filter by log level
    if (level < this.MIN_LOG_LEVEL) {
      return;
    }

    // Deduplication: Skip if same error occurred recently
    const errorKey = `${error.message}-${context.component}-${context.action}`;
    const now = Date.now();
    const lastTime = this.lastErrorTime.get(errorKey) || 0;
    
    if (now - lastTime < this.DEDUPE_WINDOW_MS) {
      // Update frequency but don't log duplicate
      this.errorFrequency.set(errorKey, (this.errorFrequency.get(errorKey) || 0) + 1);
      return;
    }

    this.lastErrorTime.set(errorKey, now);
    this.errorFrequency.set(errorKey, 1);

    const errorEntry: ErrorEntry = {
      error,
      context,
      timestamp: new Date(),
      level,
    };

    this.errors.push(errorEntry);

    // Log to console based on level
    if (import.meta.env.DEV || level >= LogLevel.WARN) {
      const logMethod = level === LogLevel.ERROR ? console.error : 
                        level === LogLevel.WARN ? console.warn : 
                        level === LogLevel.INFO ? console.info : 
                        console.log;
      
      logMethod(`[Error Logger ${LogLevel[level]}]`, {
        message: error.message,
        stack: error.stack,
        ...context,
      });
    }

    // Keep only last MAX_ERRORS
    if (this.errors.length > this.MAX_ERRORS) {
      this.errors = this.errors.slice(-this.MAX_ERRORS);
    }

    // Queue for backend logging (non-blocking)
    if (level >= LogLevel.ERROR) {
      this.queueBackendLog(error, context, level);
    }
  }

  static debug(message: string, context: ErrorContext = {}): void {
    this.log(new Error(message), context, LogLevel.DEBUG);
  }

  static info(message: string, context: ErrorContext = {}): void {
    this.log(new Error(message), context, LogLevel.INFO);
  }

  static warn(message: string, context: ErrorContext = {}): void {
    this.log(new Error(message), context, LogLevel.WARN);
  }

  static error(error: Error | string, context: ErrorContext = {}): void {
    const err = typeof error === 'string' ? new Error(error) : error;
    this.log(err, context, LogLevel.ERROR);
  }

  static getRecentErrors(limit: number = 10): ErrorEntry[] {
    return this.errors.slice(-limit);
  }

  static getErrorsByLevel(level: LogLevel, limit: number = 10): ErrorEntry[] {
    return this.errors.filter(e => e.level === level).slice(-limit);
  }

  static getErrorFrequency(): Map<string, number> {
    return new Map(this.errorFrequency);
  }

  static getMostCommonErrors(limit: number = 10): Array<{ key: string; count: number }> {
    return Array.from(this.errorFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, count]) => ({ key, count }));
  }

  static clear(): void {
    this.errors = [];
    this.errorFrequency.clear();
    this.lastErrorTime.clear();
  }

  private static queueBackendLog(error: Error, context: ErrorContext, level: LogLevel): void {
    this.backendLogQueue.push({ error, context, level });
    
    // Process queue asynchronously (non-blocking)
    if (!this.backendLogProcessing) {
      this.processBackendLogQueue();
    }
  }

  private static async processBackendLogQueue(): Promise<void> {
    if (this.backendLogProcessing || this.backendLogQueue.length === 0) {
      return;
    }

    this.backendLogProcessing = true;

    try {
      // Process in batches to avoid overwhelming the backend
      const batch = this.backendLogQueue.splice(0, 10);
      
      for (const { error, context, level } of batch) {
        await this.logToBackend(error, context, level);
      }

      // Process remaining items after a short delay
      if (this.backendLogQueue.length > 0) {
        setTimeout(() => this.processBackendLogQueue(), 1000);
      }
    } catch (e) {
      console.error('[Error Logger] Failed to process backend log queue:', e);
    } finally {
      this.backendLogProcessing = false;
    }
  }

  static async logToBackend(error: Error, context: ErrorContext = {}, level: LogLevel = LogLevel.ERROR): Promise<void> {
    try {
      // Only log errors in production, or if explicitly requested
      if (!import.meta.env.PROD && level < LogLevel.ERROR) {
        return;
      }

      // Import supabase dynamically to avoid circular dependencies
      const { supabase } = await import('../lib/supabase');
      
      // Try to log to quiz_generation_errors if it's a quiz-related error
      if (context.component?.includes('Quiz') || context.action?.includes('quiz')) {
        try {
          const { error: insertError } = await supabase
            .from('quiz_generation_errors')
            .insert({
              user_id: context.userId || null,
              error_type: error.name || 'unknown_error',
              error_message: error.message,
              error_details: {
                stack: error.stack,
                component: context.component,
                action: context.action,
                metadata: context.metadata,
                level: LogLevel[level],
              },
              created_at: new Date().toISOString(),
            });

          if (!insertError) {
            return; // Successfully logged
          }
        } catch (e) {
          // Table might not exist or RLS might block, continue to fallback
        }
      }

      // Fallback: Log to console in production (can be enhanced later with dedicated error_logs table)
      if (import.meta.env.PROD) {
        console.error('[Error Logger] Production Error:', {
        message: error.message,
          stack: error.stack,
          level: LogLevel[level],
          ...context,
      });
      }
    } catch (e) {
      // Non-blocking: Never throw errors from logging
      console.error('[Error Logger] Failed to log error to backend:', e);
    }
  }
}

export function withErrorLogging<T extends (...args: unknown[]) => unknown>(
  fn: T,
  context: ErrorContext = {}
): T {
  return ((...args: Parameters<T>) => {
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        return result.catch((error) => {
          ErrorLogger.log(error, context);
          throw error;
        });
      }
      return result;
    } catch (error) {
      ErrorLogger.log(error as Error, context);
      throw error;
    }
  }) as T;
}
