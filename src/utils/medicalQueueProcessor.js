// Medical Queue Processor
// Handles medical content processing with enhanced clinical focus

import { medStudentClient } from './medStudentClient.js';
import { CONFIG } from './config.js';
import { ErrorLogger } from './errorLogger';

/**
 * Process medical content with specialized medical education pipeline
 * @param {string} text - Medical text content
 * @param {number} flashcardCount - Number of flashcards to generate
 * @param {boolean} fromSummary - Whether to generate flashcards from summary
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} - Medical processing results with token usage
 */
export const processMedicalContent = async (text, flashcardCount, fromSummary, onProgress) => {
  if (!text || text.trim().length === 0) {
    throw new Error('Medical text content is required');
  }

  ErrorLogger.info('Starting medical content processing', { component: 'medicalQueueProcessor', action: 'processMedicalContent', textLength: text.length });
  const estimatedPages = Math.max(1, Math.ceil(text.length / 2000));
  let medicalScore = 0;
  let totalTokens = 0;

  try {
    // Step 1: Validate medical content
    onProgress?.(10, 'Validating medical content...', null);
    const validation = await medStudentClient.validateMedicalContent(text);

    if (!validation.isValid) {
      throw new Error(`Medical validation failed: ${validation.feedback}`);
    }

    medicalScore = validation.score;
    ErrorLogger.info('Medical content validated', { component: 'medicalQueueProcessor', action: 'processMedicalContent', medicalScore });

    // Step 2: Generate medical summary
    onProgress?.(25, 'Generating medical summary with clinical focus...', { medicalScore });
    const summaryResult = await medStudentClient.generateMedicalSummary(text, estimatedPages);
    const summary = summaryResult.summary;
    totalTokens += summaryResult.tokens?.total || 0;

    onProgress?.(50, 'Medical summary complete, generating flashcards...', {
      summaryChunks: [summary],
      medicalScore
    });

    // Step 3: Generate medical flashcards
    const sourceText = fromSummary ? summary : text;
    const flashcardsResult = await medStudentClient.generateMedicalFlashcards(
      sourceText,
      flashcardCount,
      fromSummary ? 0 : estimatedPages
    );
    const flashcards = flashcardsResult.flashcards;
    totalTokens += flashcardsResult.tokens?.total || 0;

    onProgress?.(80, 'Medical flashcards complete, detecting specialties...', {
      summaryChunks: [summary],
      flashcards,
      medicalScore
    });

    // Step 4: Detect medical topics/specialties
    const topics = await medStudentClient.detectMedicalTopics(text);

    onProgress?.(100, 'Medical processing complete!', {
      summaryChunks: [summary],
      flashcards,
      topics,
      medicalScore
    });

    ErrorLogger.info('Medical processing completed successfully', {
      component: 'medicalQueueProcessor',
      action: 'processMedicalContent',
      summaryLength: summary.length,
      flashcardCount: flashcards.length,
      topicsDetected: topics.length,
      medicalScore,
      tokensUsed: totalTokens
    });

    return {
      summary,
      flashcards,
      topics,
      medicalScore,
      tokens: totalTokens,
      processingMode: 'medical'
    };

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'medicalQueueProcessor', action: 'processMedicalContent', flashcardCount });
    throw new Error(`Medical processing failed: ${err.message}`);
  }
};

/**
 * Determine medical processing mode based on content
 * @param {string} text - Medical text
 * @param {number} flashcardCount - Requested flashcards
 * @returns {Object} - Processing mode information
 */
export const determineMedicalProcessingMode = (text, flashcardCount) => {
  if (!text) {
    return { mode: 'fast', reason: 'No content', batches: 1 };
  }

  const estimatedPages = Math.ceil(text.length / 2000);
  
  // Medical content often benefits from staged processing for better clinical correlation
  const isFastMode = estimatedPages <= 50 && flashcardCount <= 15;

  if (isFastMode) {
    return {
      mode: 'fast',
      reason: 'Small medical document',
      estimatedPages,
      batches: 1,
      medicalOptimized: true
    };
  } else {
    return {
      mode: 'staged',
      reason: 'Large medical document - enhanced clinical processing',
      estimatedPages,
      batches: Math.ceil(estimatedPages / 25),
      medicalOptimized: true
    };
  }
};

/**
 * Estimate medical processing time with clinical complexity factors
 * @param {string} text - Medical text
 * @param {number} flashcardCount - Number of flashcards
 * @returns {Object} - Time estimates for medical processing
 */
export const estimateMedicalProcessingTime = (text, flashcardCount) => {
  const estimatedPages = Math.ceil(text.length / 2000);
  const mode = determineMedicalProcessingMode(text, flashcardCount);
  
  // Medical processing takes longer due to enhanced clinical analysis
  let summaryTime = 0;
  let flashcardTime = 0;

  if (mode.mode === 'fast') {
    summaryTime = Math.min(45, estimatedPages * 3); // Longer for medical analysis
    flashcardTime = Math.min(60, flashcardCount * 2); // Clinical scenarios take more time
  } else {
    summaryTime = Math.min(180, estimatedPages * 4); // Enhanced medical analysis
    flashcardTime = Math.min(240, flashcardCount * 3); // Complex medical questions
  }

  const totalTime = summaryTime + flashcardTime;

  return {
    mode: mode.mode,
    estimatedPages,
    summaryTime,
    flashcardTime,
    totalTime,
    formattedTime: formatMedicalTime(totalTime),
    medicalEnhanced: true
  };
};

const formatMedicalTime = (seconds) => {
  if (seconds < 60) {
    return `${seconds} seconds (enhanced medical analysis)`;
  } else if (seconds < 120) {
    return `${Math.round(seconds / 60)} minute (clinical processing)`;
  } else {
    return `${Math.round(seconds / 60)} minutes (comprehensive medical analysis)`;
  }
};