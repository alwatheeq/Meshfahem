// Anthropic Claude Haiku API Client
// Now uses Supabase Edge Functions for secure API key handling

import { supabase } from '../lib/supabase';
import { CONFIG } from './config.js';
import { medStudentClient } from './medStudentClient.js';
import { ErrorLogger } from './errorLogger';

class HaikuClient {
  constructor() {
    this.requestTimeout = CONFIG.REQUEST_TIMEOUT_MS;
  }

  async callFunction(functionName, body) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      ErrorLogger.debug('Invoking function', {
        component: 'haikuClient',
        action: 'callFunction',
        functionName,
        actionType: body.action,
        textLength: body.text?.length || 0,
        model: body.model
      });

      const { data, error } = await supabase.functions.invoke(functionName, {
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (error) {
        // Try to extract detailed error information
        let errorMessage = 'Function call failed';

        if (error.message) {
          try {
            // Check if the error message contains JSON with detailed error info
            const errorData = JSON.parse(error.message);
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
        const detailedError = new Error(errorMessage);
        detailedError.code = error.code;
        detailedError.details = error.details;
        detailedError.functionName = functionName;
        ErrorLogger.error(detailedError, { 
          component: 'haikuClient', 
          action: 'callFunction', 
          functionName,
          errorCode: error.code 
        });
        throw detailedError;
      }

      ErrorLogger.debug(`Function ${functionName} succeeded`, {
        component: 'haikuClient',
        action: 'callFunction',
        functionName,
        actionType: body.action,
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : []
      });

      // Trigger credit balance refresh after successful AI operation
      if (data && (body.action === 'summary' || body.action === 'flashcards' || body.action === 'topics')) {
        ErrorLogger.debug('AI operation completed, triggering credit update', { component: 'haikuClient', action: 'callFunction', functionName, actionType: body.action });
        window.dispatchEvent(new CustomEvent('creditUpdated'));
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Request timeout - the function took longer than ${this.requestTimeout / 1000} seconds to respond`);
        ErrorLogger.error(timeoutError, { component: 'haikuClient', action: 'callFunction', functionName, timeout: this.requestTimeout });
        throw timeoutError;
      }
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'haikuClient', action: 'callFunction', functionName });
      throw err;
    }
  }

  /**
   * Generate a summary from the provided text
   * @param {string} text - The text to summarize
   * @param {number} chunkIndex - Optional chunk index for batch processing
   * @param {number} totalChunks - Optional total number of chunks
   * @param {number} pageCount - Optional page count for usage tracking
    * @param {boolean} medicalMode - Whether to use medical processing
    * @param {boolean} medicalMode - Whether to use medical processing
   * @returns {Promise<{summary: string, tokens: {input: number, output: number, total: number}}>} - Generated summary with token usage
   */
  async generateSummary(text, chunkIndex = 0, totalChunks = 1, pageCount = 0, medicalMode = false) {
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

    // Route to medical processing ONLY if explicitly enabled (strict check)
    if (medicalMode === true) {
      ErrorLogger.debug('Routing to medical summary generation', { component: 'haikuClient', action: 'generateSummary', medicalMode: true });
      return await medStudentClient.generateMedicalSummary(text, pageCount);
    }
    
    // Regular summary generation (medicalMode is false or undefined)
    ErrorLogger.debug('Using regular summary generation', { component: 'haikuClient', action: 'generateSummary', medicalMode: false });
    const { summary, tokens } = await this.callFunction('generate-summary-and-flashcards', {
      action: 'summary',
      model: CONFIG.ANTHROPIC_MODEL,
      text,
      chunkIndex,
      totalChunks,
      pageCount
    });

    ErrorLogger.info('Summary generated', { component: 'haikuClient', action: 'generateSummary', summaryLength: summary?.length || 0, tokensUsed: tokens?.total || 0 });
    return { summary, tokens: tokens || { input: 0, output: 0, total: 0 } };
  }

  /**
   * Generate flashcards from the provided text
   * @param {string} text - The text to create flashcards from
   * @param {number} count - Number of flashcards to generate
    * @param {string} mode - The mode for flashcard generation
    * @param {number} batchIndex - The batch index for processing
    * @param {number} pageCount - Optional page count for usage tracking
    * @returns {Promise<{flashcards: Array, tokens: {input: number, output: number, total: number}}>} - Generated flashcards with token usage
    */
  async generateFlashcards(text, count, mode, batchIndex, pageCount = 0, medicalMode = false) {
    ErrorLogger.debug('Generating flashcards', { 
      component: 'haikuClient', 
      action: 'generateFlashcards', 
      count, 
      mode, 
      batchIndex,
      medicalMode: medicalMode === true 
    });
    
    // Route to medical processing ONLY if explicitly enabled (strict check)
    if (medicalMode === true) {
      ErrorLogger.debug('Routing to medical flashcard generation', { component: 'haikuClient', action: 'generateFlashcards', medicalMode: true });
      return await medStudentClient.generateMedicalFlashcards(text, count, pageCount);
    }
    
    // Regular flashcard generation (medicalMode is false or undefined)
    ErrorLogger.debug('Using regular flashcard generation', { component: 'haikuClient', action: 'generateFlashcards', medicalMode: false });

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
   * @param {string} text - The text to analyze for topics
   * @param {boolean} medicalMode - Whether to use medical processing
   * @returns {Promise<Array>} - Detected topics
   */
  async detectTopics(text, medicalMode = false) {
    if (!text?.trim()) {
      throw new Error('Text content is required for topic detection');
    }

    ErrorLogger.debug('Detecting topics', { 
      component: 'haikuClient', 
      action: 'detectTopics', 
      textLength: text.length,
      medicalMode: medicalMode === true 
    });
    
    // Route to medical processing ONLY if explicitly enabled (strict check)
    if (medicalMode === true) {
      ErrorLogger.debug('Routing to medical topic detection', { component: 'haikuClient', action: 'detectTopics', medicalMode: true });
      return await medStudentClient.detectMedicalTopics(text);
    }
    
    // Regular topic detection (medicalMode is false or undefined)
    ErrorLogger.debug('Using regular topic detection', { component: 'haikuClient', action: 'detectTopics', medicalMode: false });
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
   * @returns {Promise<boolean>} - True if API is accessible
   */
  async validateApiKey() {
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
export const haikuClient = new HaikuClient();

// Export the class for testing purposes
export { HaikuClient };

// Utility functions for batch processing
export const calculateBatches = (totalItems, batchSize = CONFIG.BATCH_SIZE) => {
  return Math.ceil(totalItems / batchSize);
};

export const getBatchItems = (items, batchIndex, batchSize = CONFIG.BATCH_SIZE) => {
  const start = batchIndex * batchSize;
  const end = start + batchSize;
  return items.slice(start, end);
};