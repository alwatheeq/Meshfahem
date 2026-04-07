// Anthropic Claude Haiku API Client
// Now uses Supabase Edge Functions for secure API key handling

import { supabase } from '../lib/supabase';
import { CONFIG } from './config.js';
import { medStudentClient } from './medStudentClient';
import { ErrorLogger } from './errorLogger';

interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

interface FunctionBody {
  action: string;
  model?: string;
  text?: string;
  chunkIndex?: number;
  totalChunks?: number;
  pageCount?: number;
  count?: number;
  mode?: string;
  batchIndex?: number;
  [key: string]: unknown;
}

interface FunctionResponse {
  summary?: string;
  flashcards?: Flashcard[];
  topics?: string[];
  tokens?: TokenUsage;
  ok?: boolean;
  [key: string]: unknown;
}

interface Flashcard {
  question: string;
  answer: string;
  [key: string]: unknown;
}

interface SummaryResult {
  summary: string;
  tokens: TokenUsage;
}

interface FlashcardsResult {
  flashcards: Flashcard[];
  tokens: TokenUsage;
}

interface DetailedError extends Error {
  code?: string;
  details?: unknown;
  functionName?: string;
}

class HaikuClient {
  private requestTimeout: number;

  constructor() {
    this.requestTimeout = CONFIG.REQUEST_TIMEOUT_MS;
  }

  async callFunction(functionName: string, body: FunctionBody): Promise<FunctionResponse> {
    const controller: AbortController = new AbortController();
    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      ErrorLogger.debug('Invoking function', {
        component: 'haikuClient',
        action: 'callFunction',
        functionName,
        actionType: body.action,
        textLength: body.text?.length || 0,
        model: body.model
      } as Record<string, unknown>);

      const { data, error } = await supabase.functions.invoke(functionName, {
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (error) {
        // Try to extract detailed error information
        let errorMessage: string = 'Function call failed';

        if (error.message) {
          try {
            // Check if the error message contains JSON with detailed error info
            const errorData: { error?: string } = JSON.parse(error.message);
            if (errorData.error) {
              errorMessage = errorData.error;
            } else {
              errorMessage = error.message;
            }
          } catch {
            // If parsing fails, use the raw error message
            errorMessage = error.message;
          }
        }

        // Include additional context in the error
        const detailedError: DetailedError = new Error(errorMessage) as DetailedError;
        detailedError.code = (error as { code?: string }).code;
        detailedError.details = (error as { details?: unknown }).details;
        detailedError.functionName = functionName;
        ErrorLogger.error(detailedError, {
          component: 'haikuClient',
          action: 'callFunction',
          functionName,
          errorCode: (error as { code?: string }).code
        } as Record<string, unknown>);
        throw detailedError;
      }

      ErrorLogger.debug(`Function ${functionName} succeeded`, {
        component: 'haikuClient',
        action: 'callFunction',
        functionName,
        actionType: body.action,
        hasData: !!data,
        dataKeys: data ? Object.keys(data as Record<string, unknown>) : []
      } as Record<string, unknown>);

      // Trigger credit balance refresh after successful AI operation
      if (data && (body.action === 'summary' || body.action === 'flashcards' || body.action === 'topics')) {
        ErrorLogger.debug('AI operation completed, triggering credit update', { component: 'haikuClient', action: 'callFunction', functionName, actionType: body.action } as Record<string, unknown>);
        window.dispatchEvent(new CustomEvent('creditUpdated'));
      }

      return data as FunctionResponse;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError: Error = new Error(`Request timeout - the function took longer than ${this.requestTimeout / 1000} seconds to respond`);
        ErrorLogger.error(timeoutError, { component: 'haikuClient', action: 'callFunction', functionName, timeout: this.requestTimeout } as Record<string, unknown>);
        throw timeoutError;
      }
      const err: Error = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'haikuClient', action: 'callFunction', functionName } as Record<string, unknown>);
      throw err;
    }
  }

  /**
   * Generate a summary from the provided text
   */
  async generateSummary(text: string, chunkIndex: number = 0, totalChunks: number = 1, pageCount: number = 0, medicalMode: boolean = false): Promise<SummaryResult> {
    if (!text?.trim()) {
      throw new Error('Text content is required for summary generation');
    }

    ErrorLogger.debug(`Generating summary for chunk ${chunkIndex + 1}/${totalChunks}`, {
      component: 'haikuClient',
      action: 'generateSummary',
      chunkIndex,
      totalChunks,
      textLength: text.length,
      medicalMode: medicalMode === true
    } as Record<string, unknown>);

    // Route to medical processing ONLY if explicitly enabled (strict check)
    if (medicalMode === true) {
      ErrorLogger.debug('Routing to medical summary generation', { component: 'haikuClient', action: 'generateSummary', medicalMode: true } as Record<string, unknown>);
      return await medStudentClient.generateMedicalSummary(text, pageCount);
    }

    // Regular summary generation (medicalMode is false or undefined)
    ErrorLogger.debug('Using regular summary generation', { component: 'haikuClient', action: 'generateSummary', medicalMode: false } as Record<string, unknown>);
    const { summary, tokens } = await this.callFunction('generate-summary-and-flashcards', {
      action: 'summary',
      model: CONFIG.ANTHROPIC_MODEL,
      text,
      chunkIndex,
      totalChunks,
      pageCount
    });

    ErrorLogger.info('Summary generated', { component: 'haikuClient', action: 'generateSummary', summaryLength: summary?.length || 0, tokensUsed: tokens?.total || 0 } as Record<string, unknown>);
    return { summary: summary!, tokens: tokens || { input: 0, output: 0, total: 0 } };
  }

  /**
   * Generate flashcards from the provided text
   */
  async generateFlashcards(text: string, count: number, mode: string, batchIndex: number, pageCount: number = 0, medicalMode: boolean = false): Promise<FlashcardsResult> {
    ErrorLogger.debug('Generating flashcards', {
      component: 'haikuClient',
      action: 'generateFlashcards',
      count,
      mode,
      batchIndex,
      medicalMode: medicalMode === true
    } as Record<string, unknown>);

    // Route to medical processing ONLY if explicitly enabled (strict check)
    if (medicalMode === true) {
      ErrorLogger.debug('Routing to medical flashcard generation', { component: 'haikuClient', action: 'generateFlashcards', medicalMode: true } as Record<string, unknown>);
      return await medStudentClient.generateMedicalFlashcards(text, count, pageCount);
    }

    // Regular flashcard generation (medicalMode is false or undefined)
    ErrorLogger.debug('Using regular flashcard generation', { component: 'haikuClient', action: 'generateFlashcards', medicalMode: false } as Record<string, unknown>);

    const { flashcards, tokens } = await this.callFunction('generate-summary-and-flashcards', {
      action: 'flashcards',
      model: CONFIG.ANTHROPIC_MODEL,
      text,
      count,
      mode,
      batchIndex,
      pageCount
    });

    if (!Array.isArray(flashcards) || flashcards.length === 0) {
      throw new Error('No valid flashcards generated');
    }
    return { flashcards: flashcards.slice(0, count), tokens: tokens || { input: 0, output: 0, total: 0 } };
  }

  /**
   * Detect topics from the provided text
   */
  async detectTopics(text: string, medicalMode: boolean = false): Promise<string[]> {
    if (!text?.trim()) {
      throw new Error('Text content is required for topic detection');
    }

    ErrorLogger.debug('Detecting topics', {
      component: 'haikuClient',
      action: 'detectTopics',
      textLength: text.length,
      medicalMode: medicalMode === true
    } as Record<string, unknown>);

    // Route to medical processing ONLY if explicitly enabled (strict check)
    if (medicalMode === true) {
      ErrorLogger.debug('Routing to medical topic detection', { component: 'haikuClient', action: 'detectTopics', medicalMode: true } as Record<string, unknown>);
      return await medStudentClient.detectMedicalTopics(text);
    }

    // Regular topic detection (medicalMode is false or undefined)
    ErrorLogger.debug('Using regular topic detection', { component: 'haikuClient', action: 'detectTopics', medicalMode: false } as Record<string, unknown>);
    const { topics } = await this.callFunction('generate-summary-and-flashcards', {
      action: 'topics',
      text
    });

    if (!Array.isArray(topics) || topics.length === 0) {
      return ['General Content'];
    }
    return topics;
  }

  /**
   * Check if the API key is configured and valid
   */
  async validateApiKey(): Promise<boolean> {
    try {
      const { ok } = await this.callFunction('generate-summary-and-flashcards', {
        action: 'ping'
      });
      return !!ok;
    } catch {
      return false;
    }
  }
}

// Create and export a singleton instance
export const haikuClient: HaikuClient = new HaikuClient();

// Export the class for testing purposes
export { HaikuClient };

// Utility functions for batch processing
export const calculateBatches = (totalItems: number, batchSize: number = CONFIG.BATCH_SIZE): number => {
  return Math.ceil(totalItems / batchSize);
};

export const getBatchItems = <T>(items: T[], batchIndex: number, batchSize: number = CONFIG.BATCH_SIZE): T[] => {
  const start: number = batchIndex * batchSize;
  const end: number = start + batchSize;
  return items.slice(start, end);
};
