// Medical Queue Processor
// Handles medical content processing with enhanced clinical focus

import { medStudentClient } from './medStudentClient';
import { ErrorLogger } from './errorLogger';

export interface Flashcard {
  front: string;
  back: string;
}

export interface MedicalProgressData {
  summaryChunks?: string[];
  flashcards?: Flashcard[];
  topics?: string[];
  medicalScore?: number;
}

export type MedicalProgressCallback = (progress: number, message: string, data: MedicalProgressData | null) => void;

export interface MedicalProcessingResult {
  summary: string;
  flashcards: Flashcard[];
  topics: string[];
  medicalScore: number;
  tokens: number;
  processingMode: 'medical';
}

export interface MedicalProcessingMode {
  mode: 'fast' | 'staged';
  reason: string;
  estimatedPages: number;
  batches: number;
  medicalOptimized: boolean;
}

export interface TimeEstimate {
  mode: string;
  estimatedPages: number;
  summaryTime: number;
  flashcardTime: number;
  totalTime: number;
  formattedTime: string;
}

export interface MedicalTimeEstimate extends Omit<TimeEstimate, 'mode'> {
  mode: string;
  medicalEnhanced: boolean;
}

export const processMedicalContent = async (
  text: string,
  flashcardCount: number,
  fromSummary: boolean,
  onProgress?: MedicalProgressCallback,
  opts?: { includeSummary?: boolean; includeFlashcards?: boolean }
): Promise<MedicalProcessingResult> => {
  const includeSummary = opts?.includeSummary !== false;
  const includeFlashcards = opts?.includeFlashcards !== false;
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

    // Step 2: Generate medical summary (optional)
    let summary = '';
    if (includeSummary) {
      onProgress?.(25, 'Generating medical summary with clinical focus...', { medicalScore });
      const summaryResult = await medStudentClient.generateMedicalSummary(text, estimatedPages);
      summary = summaryResult.summary;
      totalTokens += summaryResult.tokens?.total || 0;
    }

    onProgress?.(50, 'Medical summary complete, generating flashcards...', {
      summaryChunks: [summary],
      medicalScore
    });

    // Step 3: Generate medical flashcards (optional)
    let flashcards: Flashcard[] = [];
    if (includeFlashcards) {
      const effectiveFromSummary = includeSummary && fromSummary && summary.trim().length > 0;
      const sourceText = effectiveFromSummary ? summary : text;
      const flashcardsResult = await medStudentClient.generateMedicalFlashcards(
        sourceText,
        flashcardCount,
        effectiveFromSummary ? 0 : estimatedPages
      );
      flashcards = flashcardsResult.flashcards;
      totalTokens += flashcardsResult.tokens?.total || 0;
    }

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

export const determineMedicalProcessingMode = (text: string, flashcardCount: number): MedicalProcessingMode => {
  if (!text) {
    return { mode: 'fast', reason: 'No content', estimatedPages: 0, batches: 1, medicalOptimized: true };
  }

  const estimatedPages = Math.ceil(text.length / 2000);
  
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

export const estimateMedicalProcessingTime = (text: string, flashcardCount: number): MedicalTimeEstimate => {
  const estimatedPages = Math.ceil(text.length / 2000);
  const mode = determineMedicalProcessingMode(text, flashcardCount);
  
  let summaryTime = 0;
  let flashcardTime = 0;

  if (mode.mode === 'fast') {
    summaryTime = Math.min(45, estimatedPages * 3);
    flashcardTime = Math.min(60, flashcardCount * 2);
  } else {
    summaryTime = Math.min(180, estimatedPages * 4);
    flashcardTime = Math.min(240, flashcardCount * 3);
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

const formatMedicalTime = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds} seconds (enhanced medical analysis)`;
  } else if (seconds < 120) {
    return `${Math.round(seconds / 60)} minute (clinical processing)`;
  } else {
    return `${Math.round(seconds / 60)} minutes (comprehensive medical analysis)`;
  }
};
