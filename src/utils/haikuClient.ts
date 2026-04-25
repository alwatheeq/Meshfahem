import { supabase } from '../lib/supabase';
import { CONFIG } from './config';
import { medStudentClient } from './medStudentClient';
import { ErrorLogger } from './errorLogger';
import { throwIfEdgeFunctionInvokeFailed } from './edgeFunctionInvoke';

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface SummaryResult {
  summary: string;
  tokens: TokenUsage;
}

export interface FlashcardsResult {
  flashcards: Flashcard[];
  tokens: TokenUsage;
}

/**
 * Optional fields merged into `generate-summary-and-flashcards` invoke body.
 * When `usageChannel` is `academics`, the Edge Function may use `ANTHROPIC_API_KEY_ACADEMICS`
 * (falls back to `ANTHROPIC_API_KEY` if unset) so a separate key can be wired later.
 */
export type HaikuEdgeInvokeExtras = {
  usageChannel?: 'academics';
};

class HaikuClient {
  requestTimeout: number;

  constructor() {
    this.requestTimeout = CONFIG.REQUEST_TIMEOUT_MS;
  }

  async callFunction(functionName: string, body: Record<string, unknown>): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      ErrorLogger.debug('Invoking function', {
        component: 'haikuClient',
        action: 'callFunction',
        functionName,
        actionType: body.action,
        textLength: (body.text as string)?.length || 0,
        model: body.model
      });

      const { data, error } = await supabase.functions.invoke(functionName, {
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      try {
        throwIfEdgeFunctionInvokeFailed(data, error);
      } catch (invokeFailure) {
        const err = invokeFailure instanceof Error ? invokeFailure : new Error(String(invokeFailure));
        ErrorLogger.error(err, {
          component: 'haikuClient',
          action: 'callFunction',
          functionName,
          errorCode: (error as { code?: string } | null)?.code
        });
        throw err;
      }

      ErrorLogger.debug(`Function ${functionName} succeeded`, {
        component: 'haikuClient',
        action: 'callFunction',
        functionName,
        actionType: body.action,
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : []
      });

      if (data && (body.action === 'summary' || body.action === 'flashcards' || body.action === 'topics')) {
        ErrorLogger.debug('AI operation completed, triggering credit update', { component: 'haikuClient', action: 'callFunction', functionName, actionType: body.action });
        window.dispatchEvent(new CustomEvent('creditUpdated'));
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        const timeoutError = new Error(`Request timeout - the function took longer than ${this.requestTimeout / 1000} seconds to respond`);
        ErrorLogger.error(timeoutError, { component: 'haikuClient', action: 'callFunction', functionName, timeout: this.requestTimeout });
        throw timeoutError;
      }
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'haikuClient', action: 'callFunction', functionName });
      throw err;
    }
  }

  async generateSummary(
    text: string,
    chunkIndex: number = 0,
    totalChunks: number = 1,
    pageCount: number = 0,
    medicalMode: boolean = false,
    extras?: HaikuEdgeInvokeExtras
  ): Promise<SummaryResult> {
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
    });

    if (medicalMode === true) {
      ErrorLogger.debug('Routing to medical summary generation', { component: 'haikuClient', action: 'generateSummary', medicalMode: true });
      return await medStudentClient.generateMedicalSummary(text, pageCount);
    }
    
    ErrorLogger.debug('Using regular summary generation', { component: 'haikuClient', action: 'generateSummary', medicalMode: false });
    const { summary, tokens } = await this.callFunction('generate-summary-and-flashcards', {
      action: 'summary',
      model: CONFIG.ANTHROPIC_MODEL,
      text,
      chunkIndex,
      totalChunks,
      pageCount,
      ...(extras?.usageChannel ? { usageChannel: extras.usageChannel } : {})
    });

    ErrorLogger.info('Summary generated', { component: 'haikuClient', action: 'generateSummary', summaryLength: summary?.length || 0, tokensUsed: tokens?.total || 0 });
    return { summary, tokens: tokens || { input: 0, output: 0, total: 0 } };
  }

  async generateFlashcards(text: string, count: number, mode: string, batchIndex: number, pageCount: number = 0, medicalMode: boolean = false): Promise<FlashcardsResult> {
    ErrorLogger.debug('Generating flashcards', { 
      component: 'haikuClient', 
      action: 'generateFlashcards', 
      count, 
      mode, 
      batchIndex,
      medicalMode: medicalMode === true 
    });
    
    if (medicalMode === true) {
      ErrorLogger.debug('Routing to medical flashcard generation', { component: 'haikuClient', action: 'generateFlashcards', medicalMode: true });
      return await medStudentClient.generateMedicalFlashcards(text, count, pageCount);
    }
    
    ErrorLogger.debug('Using regular flashcard generation', { component: 'haikuClient', action: 'generateFlashcards', medicalMode: false });

    const { flashcards, tokens } = await this.callFunction('generate-summary-and-flashcards', {
      action: 'flashcards',
      model: CONFIG.ANTHROPIC_MODEL,
      text,
      count,
      mode,
      batchIndex,
      pageCount,
      ...(extras?.usageChannel ? { usageChannel: extras.usageChannel } : {})
    });

    if (!Array.isArray(flashcards) || flashcards.length === 0) {
      throw new Error('No valid flashcards generated');
    }
    return { flashcards: flashcards.slice(0, count), tokens: tokens || { input: 0, output: 0, total: 0 } };
  }

  async detectTopics(text: string, medicalMode: boolean = false, extras?: HaikuEdgeInvokeExtras): Promise<string[]> {
    if (!text?.trim()) {
      throw new Error('Text content is required for topic detection');
    }

    ErrorLogger.debug('Detecting topics', { 
      component: 'haikuClient', 
      action: 'detectTopics', 
      textLength: text.length,
      medicalMode: medicalMode === true 
    });
    
    if (medicalMode === true) {
      ErrorLogger.debug('Routing to medical topic detection', { component: 'haikuClient', action: 'detectTopics', medicalMode: true });
      return await medStudentClient.detectMedicalTopics(text);
    }
    
    ErrorLogger.debug('Using regular topic detection', { component: 'haikuClient', action: 'detectTopics', medicalMode: false });
    const { topics } = await this.callFunction('generate-summary-and-flashcards', {
      action: 'topics',
      text,
      ...(extras?.usageChannel ? { usageChannel: extras.usageChannel } : {})
    });

    if (!Array.isArray(topics) || topics.length === 0) {
      return ['General Content'];
    }
    return topics;
  }

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

export const haikuClient = new HaikuClient();

export { HaikuClient };

export const calculateBatches = (totalItems: number, batchSize: number = CONFIG.BATCH_SIZE): number => {
  return Math.ceil(totalItems / batchSize);
};

export const getBatchItems = <T>(items: T[], batchIndex: number, batchSize: number = CONFIG.BATCH_SIZE): T[] => {
  const start = batchIndex * batchSize;
  const end = start + batchSize;
  return items.slice(start, end);
};
