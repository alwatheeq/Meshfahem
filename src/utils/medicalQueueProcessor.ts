// Medical Queue Processor
// Handles medical content processing with enhanced clinical focus

import { medStudentClient } from './medStudentClient';
import { CONFIG } from './config.js';
import { ErrorLogger } from './errorLogger';

interface Flashcard {
  question: string;
  answer: string;
  [key: string]: unknown;
}

interface MedicalProcessingResult {
  summary: string;
  flashcards: Flashcard[];
  topics: string[];
  medicalScore: number;
  tokens: number;
  processingMode: string;
}

interface ProgressData {
  summaryChunks?: string[];
  flashcards?: Flashcard[];
  topics?: string[];
  medicalScore?: number;
}

type OnProgressCallback = (
  percent: number,
  message: string,
  data: ProgressData | null
) => void;

interface ProcessingModeResult {
  mode: string;
  reason: string;
  estimatedPages?: number;
  batches: number;
  medicalOptimized?: boolean;
}

interface TimeEstimate {
  mode: string;
  estimatedPages: number;
  summaryTime: number;
  flashcardTime: number;
  totalTime: number;
  formattedTime: string;
  medicalEnhanced: boolean;
}

/**
 * Process medical content with specialized medical education pipeline
 * @param text - Medical text content
 * @param flashcardCount - Number of flashcards to generate
 * @param fromSummary - Whether to generate flashcards from summary
 * @param onProgress - Progress callback
 * @returns Medical processing results with token usage
 */
export const processMedicalContent = async (
  text: string,
  flashcardCount: number,
  fromSummary: boolean,
  onProgress?: OnProgressCallback
): Promise<MedicalProcessingResult> => {
  if (!text || text.trim().length === 0) {
    throw new Error('Medical text content is required');
  }

  ErrorLogger.info('Starting medical content processing', { component: 'medicalQueueProcessor', action: 'processMedicalContent', textLength: text.length });
  const estimatedPages: number = Math.max(1, Math.ceil(text.length / 2000));
  let medicalScore: number = 0;
  let totalTokens: number = 0;

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
    const summary: string = summaryResult.summary;
    totalTokens += summaryResult.tokens?.total || 0;

    onProgress?.(50, 'Medical summary complete, generating flashcards...', {
      summaryChunks: [summary],
      medicalScore
    });

    // Step 3: Generate medical flashcards
    const sourceText: string = fromSummary ? summary : text;
    const flashcardsResult = await medStudentClient.generateMedicalFlashcards(
      sourceText,
      flashcardCount,
      fromSummary ? 0 : estimatedPages
    );
    const flashcards: Flashcard[] = flashcardsResult.flashcards;
    totalTokens += flashcardsResult.tokens?.total || 0;

    onProgress?.(80, 'Medical flashcards complete, detecting specialties...', {
      summaryChunks: [summary],
      flashcards,
      medicalScore
    });

    // Step 4: Detect medical topics/specialties
    const topics: string[] = await medStudentClient.detectMedicalTopics(text);

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

  } catch (error: unknown) {
    const err: Error = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'medicalQueueProcessor', action: 'processMedicalContent', flashcardCount });
    throw new Error(`Medical processing failed: ${err.message}`);
  }
};

/**
 * Determine medical processing mode based on content
 * @param text - Medical text
 * @param flashcardCount - Requested flashcards
 * @returns Processing mode information
 */
export const determineMedicalProcessingMode = (text: string, flashcardCount: number): ProcessingModeResult => {
  if (!text) {
    return { mode: 'fast', reason: 'No content', batches: 1 };
  }

  const estimatedPages: number = Math.ceil(text.length / 2000);

  // Medical content often benefits from staged processing for better clinical correlation
  const isFastMode: boolean = estimatedPages <= 50 && flashcardCount <= 15;

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
 * @param text - Medical text
 * @param flashcardCount - Number of flashcards
 * @returns Time estimates for medical processing
 */
export const estimateMedicalProcessingTime = (text: string, flashcardCount: number): TimeEstimate => {
  const estimatedPages: number = Math.ceil(text.length / 2000);
  const mode: ProcessingModeResult = determineMedicalProcessingMode(text, flashcardCount);

  // Medical processing takes longer due to enhanced clinical analysis
  let summaryTime: number = 0;
  let flashcardTime: number = 0;

  if (mode.mode === 'fast') {
    summaryTime = Math.min(45, estimatedPages * 3); // Longer for medical analysis
    flashcardTime = Math.min(60, flashcardCount * 2); // Clinical scenarios take more time
  } else {
    summaryTime = Math.min(180, estimatedPages * 4); // Enhanced medical analysis
    flashcardTime = Math.min(240, flashcardCount * 3); // Complex medical questions
  }

  const totalTime: number = summaryTime + flashcardTime;

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

const formatMedicalTime = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds} seconds (enhanced medical analysis)`;
  } else if (seconds < 120) {
    return `${Math.round(seconds / 60)} minute (clinical processing)`;
  } else {
    return `${Math.round(seconds / 60)} minutes (comprehensive medical analysis)`;
  }
};
