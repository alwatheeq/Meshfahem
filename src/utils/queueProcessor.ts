// Queue Processor
// Handles batched processing for large documents and flashcard sets
// Provides progressive updates and manages processing workflows

import { haikuClient, calculateBatches, type HaikuEdgeInvokeExtras } from './haikuClient';
import { CONFIG } from './config';
import { deduplicateFlashcards } from './deduplication';
import { ErrorLogger } from './errorLogger';

export type ProgressCallback = (progress: number, message: string) => void;
export type ChunkCompleteCallback = (chunk: string, index: number, total: number) => void;
export type BatchCompleteCallback = (cards: Flashcard[], batchIndex: number, totalBatches: number) => void;

export interface Flashcard {
  front: string;
  back: string;
}

export interface SummaryResult {
  summary: string;
  tokens: number;
}

export interface FlashcardResult {
  flashcards: Flashcard[];
  tokens: number;
}

export interface ProcessingMode {
  mode: 'fast' | 'staged';
  reason: string;
  estimatedPages?: number;
  batches: number;
}

export interface TimeEstimate {
  mode: string;
  estimatedPages: number;
  summaryTime: number;
  flashcardTime: number;
  totalTime: number;
  formattedTime: string;
}

export const processSummaryBatches = async (
  text: string,
  onProgress?: ProgressCallback,
  onChunkComplete?: ChunkCompleteCallback,
  invokeExtras?: HaikuEdgeInvokeExtras
): Promise<SummaryResult> => {
  if (!text || text.trim().length === 0) {
    throw new Error('Text content is required');
  }

  const textChunks = splitTextIntoChunks(text);
  const totalChunks = textChunks.length;
  const estimatedPages = Math.max(1, Math.ceil(text.length / CONFIG.CHARS_PER_PAGE));
  const summaryChunks: string[] = [];
  let totalTokensUsed = 0;

  ErrorLogger.info(`Processing ${totalChunks} text chunks in batches`, { component: 'queueProcessor', action: 'processSummaryBatches', totalChunks });

  try {
    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      const progress = Math.round(((i + 1) / totalChunks) * 70);

      if (onProgress) {
        onProgress(progress, `Processing section ${i + 1} of ${totalChunks}...`);
      }

      try {
        ErrorLogger.debug(`Generating summary for chunk ${i + 1}/${totalChunks}`, { component: 'queueProcessor', action: 'processSummaryBatches', chunkIndex: i + 1, totalChunks, chunkSize: chunk.length, medicalMode: false });
        const result = await haikuClient.generateSummary(
          chunk,
          i,
          totalChunks,
          i === 0 ? estimatedPages : 0,
          false,
          invokeExtras
        );
        const summaryText = result.summary || result;

        ErrorLogger.debug(`Chunk ${i + 1} summary generated`, { component: 'queueProcessor', action: 'processSummaryBatches', chunkIndex: i + 1, totalChunks, summaryLength: summaryText?.length || 0 });

        if (!summaryText || summaryText.trim().length === 0) {
          const error = new Error(`Empty summary returned for chunk ${i + 1}`);
          ErrorLogger.error(error, { component: 'queueProcessor', action: 'processSummaryBatches', chunkIndex: i + 1, totalChunks });
          throw error;
        }

        summaryChunks.push(summaryText);

        if (result.tokens && result.tokens.total) {
          totalTokensUsed += result.tokens.total;
          ErrorLogger.debug(`Chunk ${i + 1} used ${result.tokens.total} tokens`, { component: 'queueProcessor', action: 'processSummaryBatches', chunkIndex: i + 1, tokens: result.tokens.total });
        }

        if (onChunkComplete) {
          onChunkComplete(summaryText, i, totalChunks);
        }

        if (i < textChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (chunkError) {
        const err = chunkError instanceof Error ? chunkError : new Error(String(chunkError));
        ErrorLogger.error(err, { component: 'queueProcessor', action: 'processSummaryBatches', chunkIndex: i + 1, totalChunks });
        summaryChunks.push(`[Summary unavailable for section ${i + 1}]`);
      }
    }

    let finalSummary: string;
    if (summaryChunks.length > 1) {
      if (onProgress) {
        onProgress(85, 'Combining summaries...');
      }

      ErrorLogger.debug(`Combining ${summaryChunks.length} chunk summaries`, { component: 'queueProcessor', action: 'combineChunkSummaries', chunkCount: summaryChunks.length });
      try {
        finalSummary = await combineChunkSummaries(summaryChunks);
      } catch (combineError) {
        const err = combineError instanceof Error ? combineError : new Error(String(combineError));
        ErrorLogger.error(err, { component: 'queueProcessor', action: 'combineChunkSummaries', chunkCount: summaryChunks.length });
        finalSummary = summaryChunks.join('\n\n');
      }
    } else {
      finalSummary = summaryChunks[0] || '';
    }

    ErrorLogger.info('Final summary generated', { component: 'queueProcessor', action: 'processSummaryBatches', summaryLength: finalSummary?.length || 0 });

    if (!finalSummary || finalSummary.trim().length === 0) {
      const error = new Error('Summary processing resulted in empty content');
      ErrorLogger.error(error, { component: 'queueProcessor', action: 'processSummaryBatches' });
      throw error;
    }

    if (onProgress) {
      onProgress(100, 'Summary complete!');
    }

    return {
      summary: finalSummary,
      tokens: totalTokensUsed
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'queueProcessor', action: 'processSummaryBatches' });
    throw new Error('Failed to process document summary. Please try again.');
  }
};

export const processFlashcardBatches = async (
  text: string,
  totalCount: number,
  mode: string,
  onProgress?: ProgressCallback,
  onBatchComplete?: BatchCompleteCallback
): Promise<FlashcardResult> => {
  if (!text || text.trim().length === 0) {
    throw new Error('Text content is required');
  }

  if (totalCount <= 0 || totalCount > 50) {
    throw new Error('Flashcard count must be between 1 and 50');
  }

  const maxBatchSize = 25;
  const batches = calculateBatches(totalCount, maxBatchSize);
  const estimatedPages = Math.max(1, Math.ceil(text.length / CONFIG.CHARS_PER_PAGE));
  const allFlashcards: Flashcard[] = [];

  ErrorLogger.info(`Generating ${totalCount} flashcards in ${batches} batch(es)`, { component: 'queueProcessor', action: 'processFlashcardBatches', totalCount, batches });

  try {
    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const batchStart = batchIndex * maxBatchSize;
      const batchSize = Math.min(maxBatchSize, totalCount - batchStart);
      const progress = Math.round(((batchIndex + 1) / batches) * 100);

      if (onProgress) {
        onProgress(progress, `Generating flashcards batch ${batchIndex + 1} of ${batches}...`);
      }

      try {
        const result = await haikuClient.generateFlashcards(
          text,
          batchSize,
          mode,
          batchIndex,
          batchIndex === 0 ? estimatedPages : 0,
          false
        );

        const batchFlashcards = result.flashcards || result;

        const uniqueBatchCards = deduplicateFlashcards([...allFlashcards, ...batchFlashcards])
          .slice(allFlashcards.length);

        allFlashcards.push(...uniqueBatchCards);
        
        if (onBatchComplete) {
          onBatchComplete(uniqueBatchCards, batchIndex, batches);
        }

        const remaining = totalCount - allFlashcards.length;
        if (remaining > 0 && batchIndex === batches - 1) {
          ErrorLogger.debug(`Generating ${remaining} additional flashcards to reach target count`, { component: 'queueProcessor', action: 'processFlashcardBatches', remaining, totalCount });
          
          try {
            const additionalResult = await haikuClient.generateFlashcards(
              text,
              remaining,
              mode,
              batchIndex + 1,
              0,
              false
            );

            const additionalCards = additionalResult.flashcards || additionalResult;

            const uniqueAdditional = deduplicateFlashcards([...allFlashcards, ...additionalCards])
              .slice(allFlashcards.length);
            
            allFlashcards.push(...uniqueAdditional);
          } catch (additionalError) {
            console.warn('Failed to generate additional flashcards:', additionalError);
          }
        }

        if (batchIndex < batches - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } catch (batchError) {
        const err = batchError instanceof Error ? batchError : new Error(String(batchError));
        ErrorLogger.error(err, { component: 'queueProcessor', action: 'processFlashcardBatches', batchIndex: batchIndex + 1, totalBatches: batches });
        const errorCard: Flashcard = {
          front: `Batch ${batchIndex + 1} Error`,
          back: 'This batch of flashcards could not be generated. Please try again.'
        };
        allFlashcards.push(errorCard);
      }
    }

    if (allFlashcards.length === 0) {
      throw new Error('No flashcards could be generated');
    }

    const finalFlashcards = deduplicateFlashcards(allFlashcards).slice(0, totalCount);

    ErrorLogger.info('Generated flashcards', { component: 'queueProcessor', action: 'processFlashcardBatches', flashcardCount: finalFlashcards.length, totalCount });
    return {
      flashcards: finalFlashcards,
      tokens: 0
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'queueProcessor', action: 'processFlashcardBatches' });
    throw new Error('Failed to generate flashcards. Please try again.');
  }
};

export const determineProcessingMode = (text: string, flashcardCount: number): ProcessingMode => {
  if (!text) {
    return { mode: 'fast', reason: 'No content', batches: 1 };
  }

  const estimatedPages = Math.ceil(text.length / CONFIG.CHARS_PER_PAGE);
  
  const isFastMode = estimatedPages <= CONFIG.FAST_MODE_MAX_SLIDES && 
                    flashcardCount <= CONFIG.FAST_MODE_MAX_FLASHCARDS;

  if (isFastMode) {
    return {
      mode: 'fast',
      reason: 'Small document and few flashcards',
      estimatedPages,
      batches: 1
    };
  } else {
    const summaryBatches = calculateBatches(estimatedPages, CONFIG.BATCH_SIZE);
    const flashcardBatches = calculateBatches(flashcardCount, 25);
    
    return {
      mode: 'staged',
      reason: 'Large document or many flashcards',
      estimatedPages,
      batches: summaryBatches + flashcardBatches
    };
  }
};

const splitTextIntoChunks = (text: string, _pagesPerChunk: number | null = null): string[] => {
  const charsPerChunk = CONFIG.CHARS_PER_CHUNK || 14000;

  if (text.length <= charsPerChunk) {
    return [text];
  }

  const chunks: string[] = [];
  let currentPosition = 0;

  ErrorLogger.debug('Splitting text into chunks', { component: 'queueProcessor', action: 'splitTextIntoChunks', textLength: text.length, charsPerChunk });

  while (currentPosition < text.length) {
    let chunkEnd = currentPosition + charsPerChunk;

    if (chunkEnd < text.length) {
      const paragraphBreak = text.lastIndexOf('\n\n', chunkEnd);
      const sentenceBreak = text.lastIndexOf('. ', chunkEnd);

      if (paragraphBreak > currentPosition + (charsPerChunk * 0.7)) {
        chunkEnd = paragraphBreak + 2;
      } else if (sentenceBreak > currentPosition + (charsPerChunk * 0.7)) {
        chunkEnd = sentenceBreak + 2;
      }
    }

    const chunk = text.slice(currentPosition, chunkEnd).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
      ErrorLogger.debug('Chunk created', { component: 'queueProcessor', action: 'splitTextIntoChunks', chunkIndex: chunks.length, chunkLength: chunk.length });
    }
    currentPosition = chunkEnd;
  }

  ErrorLogger.info('Text split into chunks', { component: 'queueProcessor', action: 'splitTextIntoChunks', totalChunks: chunks.length });
  return chunks;
};

const combineChunkSummaries = async (chunkSummaries: string[]): Promise<string> => {
  if (!chunkSummaries || chunkSummaries.length === 0) {
    return 'No summary available.';
  }

  if (chunkSummaries.length === 1) {
    return chunkSummaries[0];
  }

  const combinedText = chunkSummaries
    .map(summary => summary.trim())
    .join('\n\n');

  ErrorLogger.info('Combined chunk summaries', { component: 'queueProcessor', action: 'combineChunkSummaries', chunkCount: chunkSummaries.length, combinedLength: combinedText.length });
  return combinedText;
};

export const estimateProcessingTime = (text: string, flashcardCount: number): TimeEstimate => {
  const estimatedPages = Math.ceil(text.length / CONFIG.CHARS_PER_PAGE);
  const mode = determineProcessingMode(text, flashcardCount);
  
  let summaryTime = 0;
  let flashcardTime = 0;

  if (mode.mode === 'fast') {
    summaryTime = Math.min(30, estimatedPages * 2);
    flashcardTime = Math.min(45, flashcardCount * 1.5);
  } else {
    summaryTime = Math.min(120, estimatedPages * 3);
    flashcardTime = Math.min(180, flashcardCount * 2.5);
  }

  const totalTime = summaryTime + flashcardTime;

  return {
    mode: mode.mode,
    estimatedPages,
    summaryTime,
    flashcardTime,
    totalTime,
    formattedTime: formatTime(totalTime)
  };
};

const formatTime = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds} seconds`;
  } else if (seconds < 120) {
    return `${Math.round(seconds / 60)} minute`;
  } else {
    return `${Math.round(seconds / 60)} minutes`;
  }
};
