// Queue Processor
// Handles batched processing for large documents and flashcard sets
// Provides progressive updates and manages processing workflows

import { haikuClient, calculateBatches, getBatchItems } from './haikuClient.js';
import { CONFIG } from './config.js';
import { deduplicateFlashcards } from './deduplication.js';
import { ErrorLogger } from './errorLogger';

/**
 * Process document in batches and generate progressive summaries
 * @param {string} text - Full document text
 * @param {Function} onProgress - Callback for progress updates
 * @param {Function} onChunkComplete - Callback when each summary chunk is ready
 * @returns {Promise<string>} - Final combined summary
 */
export const processSummaryBatches = async (text, onProgress, onChunkComplete) => {
  if (!text || text.trim().length === 0) {
    throw new Error('Text content is required');
  }

  // Split text into chunks based on CHARS_PER_CHUNK configuration
  const textChunks = splitTextIntoChunks(text);
  const totalChunks = textChunks.length;
  const estimatedPages = Math.max(1, Math.ceil(text.length / CONFIG.CHARS_PER_PAGE)); // Estimate pages for usage
  const summaryChunks = [];
  let totalTokensUsed = 0;

  ErrorLogger.info(`Processing ${totalChunks} text chunks in batches`, { component: 'queueProcessor', action: 'processSummaryBatches', totalChunks });

  try {
    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      const progress = Math.round(((i + 1) / totalChunks) * 70); // Reserve 30% for final combination

      if (onProgress) {
        onProgress(progress, `Processing section ${i + 1} of ${totalChunks}...`);
      }

      try {
        ErrorLogger.debug(`Generating summary for chunk ${i + 1}/${totalChunks}`, { component: 'queueProcessor', action: 'processSummaryBatches', chunkIndex: i + 1, totalChunks, chunkSize: chunk.length, medicalMode: false });
        // Explicitly pass medicalMode as false for regular processing
        const result = await haikuClient.generateSummary(chunk, i, totalChunks, i === 0 ? estimatedPages : 0, false);
        const summaryText = result.summary || result;

        ErrorLogger.debug(`Chunk ${i + 1} summary generated`, { component: 'queueProcessor', action: 'processSummaryBatches', chunkIndex: i + 1, totalChunks, summaryLength: summaryText?.length || 0 });

        if (!summaryText || summaryText.trim().length === 0) {
          const error = new Error(`Empty summary returned for chunk ${i + 1}`);
          ErrorLogger.error(error, { component: 'queueProcessor', action: 'processSummaryBatches', chunkIndex: i + 1, totalChunks });
          throw error;
        }

        summaryChunks.push(summaryText);

        // Track tokens from this chunk
        if (result.tokens && result.tokens.total) {
          totalTokensUsed += result.tokens.total;
          ErrorLogger.debug(`Chunk ${i + 1} used ${result.tokens.total} tokens`, { component: 'queueProcessor', action: 'processSummaryBatches', chunkIndex: i + 1, tokens: result.tokens.total });
        }

        // Notify that this chunk is complete
        if (onChunkComplete) {
          onChunkComplete(summaryText, i, totalChunks);
        }

        // Brief pause between requests to avoid rate limiting
        if (i < textChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (chunkError) {
        const err = chunkError instanceof Error ? chunkError : new Error(String(chunkError));
        ErrorLogger.error(err, { component: 'queueProcessor', action: 'processSummaryBatches', chunkIndex: i + 1, totalChunks });
        // Continue with other chunks, but note the failure
        summaryChunks.push(`[Summary unavailable for section ${i + 1}]`);
      }
    }

    // Combine summaries if we have multiple chunks
    let finalSummary;
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
        // Return individual summaries joined together
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

/**
 * Process flashcards in batches with progressive updates
 * @param {string} text - Source text for flashcards
 * @param {number} totalCount - Total number of flashcards to generate
 * @param {string} mode - Generation mode ('full' or 'summary')
 * @param {Function} onProgress - Progress callback
 * @param {Function} onBatchComplete - Callback when each batch is ready
 * @returns {Promise<Array>} - All generated flashcards
 */
export const processFlashcardBatches = async (text, totalCount, mode, onProgress, onBatchComplete) => {
  if (!text || text.trim().length === 0) {
    throw new Error('Text content is required');
  }

  if (totalCount <= 0 || totalCount > 50) {
    throw new Error('Flashcard count must be between 1 and 50');
  }

  const maxBatchSize = 25;
  const batches = calculateBatches(totalCount, maxBatchSize);
  const estimatedPages = Math.max(1, Math.ceil(text.length / CONFIG.CHARS_PER_PAGE)); // Estimate pages for usage
  const allFlashcards = [];

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
        // Explicitly pass medicalMode as false for regular processing
        const result = await haikuClient.generateFlashcards(
          text,
          batchSize,
          mode,
          batchIndex,
          batchIndex === 0 ? estimatedPages : 0,
          false // medicalMode = false for regular processing
        );

        const batchFlashcards = result.flashcards || result;

        // Deduplicate within this batch and against existing cards
        const uniqueBatchCards = deduplicateFlashcards([...allFlashcards, ...batchFlashcards])
          .slice(allFlashcards.length); // Get only the new unique cards

        allFlashcards.push(...uniqueBatchCards);
        
        // Notify that this batch is complete
        if (onBatchComplete) {
          onBatchComplete(uniqueBatchCards, batchIndex, batches);
        }

        // If we have fewer cards than expected due to deduplication, try to generate more
        const remaining = totalCount - allFlashcards.length;
        if (remaining > 0 && batchIndex === batches - 1) {
          ErrorLogger.debug(`Generating ${remaining} additional flashcards to reach target count`, { component: 'queueProcessor', action: 'processFlashcardBatches', remaining, totalCount });
          
          try {
            // Explicitly pass medicalMode as false for regular processing
            const additionalResult = await haikuClient.generateFlashcards(
              text,
              remaining,
              mode,
              batchIndex + 1,
              0, // pageCount
              false // medicalMode = false for regular processing
            );

            const additionalCards = additionalResult.flashcards || additionalResult;

            const uniqueAdditional = deduplicateFlashcards([...allFlashcards, ...additionalCards])
              .slice(allFlashcards.length);
            
            allFlashcards.push(...uniqueAdditional);
          } catch (additionalError) {
            console.warn('Failed to generate additional flashcards:', additionalError);
          }
        }

        // Brief pause between batches
        if (batchIndex < batches - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } catch (batchError) {
        const err = batchError instanceof Error ? batchError : new Error(String(batchError));
        ErrorLogger.error(err, { component: 'queueProcessor', action: 'processFlashcardBatches', batchIndex: batchIndex + 1, totalBatches: batches });
        // Continue with other batches but note the failure
        const errorCard = {
          front: `Batch ${batchIndex + 1} Error`,
          back: 'This batch of flashcards could not be generated. Please try again.'
        };
        allFlashcards.push(errorCard);
      }
    }

    // Ensure we have at least some flashcards
    if (allFlashcards.length === 0) {
      throw new Error('No flashcards could be generated');
    }

    // Trim to requested count and final deduplication
    const finalFlashcards = deduplicateFlashcards(allFlashcards).slice(0, totalCount);

    ErrorLogger.info('Generated flashcards', { component: 'queueProcessor', action: 'processFlashcardBatches', flashcardCount: finalFlashcards.length, totalCount });
    return {
      flashcards: finalFlashcards,
      tokens: 0 // Tokens are tracked separately in the edge function
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'queueProcessor', action: 'processFlashcardBatches' });
    throw new Error('Failed to generate flashcards. Please try again.');
  }
};

/**
 * Determine processing mode based on content size and requirements
 * @param {string} text - Document text
 * @param {number} flashcardCount - Requested flashcard count
 * @returns {Object} - Processing mode and batch information
 */
export const determineProcessingMode = (text, flashcardCount) => {
  if (!text) {
    return { mode: 'fast', reason: 'No content', batches: 1 };
  }

  // Estimate page/slide count using configured constant
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

/**
 * Split text into manageable chunks for processing
 * @param {string} text - Full text
 * @param {number} pagesPerChunk - Pages per chunk (optional, defaults to calculating based on CHARS_PER_CHUNK)
 * @returns {Array<string>} - Text chunks
 */
const splitTextIntoChunks = (text, pagesPerChunk = null) => {
  // Use CONFIG.CHARS_PER_CHUNK (14000) as the target chunk size
  const charsPerChunk = CONFIG.CHARS_PER_CHUNK || 14000;

  if (text.length <= charsPerChunk) {
    return [text];
  }

  const chunks = [];
  let currentPosition = 0;

  ErrorLogger.debug('Splitting text into chunks', { component: 'queueProcessor', action: 'splitTextIntoChunks', textLength: text.length, charsPerChunk });

  while (currentPosition < text.length) {
    let chunkEnd = currentPosition + charsPerChunk;

    // Try to break at a paragraph or sentence boundary
    if (chunkEnd < text.length) {
      const paragraphBreak = text.lastIndexOf('\n\n', chunkEnd);
      const sentenceBreak = text.lastIndexOf('. ', chunkEnd);

      // Look for break points in the last 30% of the chunk to avoid cutting too early
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

/**
 * Combine individual chunk summaries into a cohesive final summary
 * @param {Array<string>} chunkSummaries - Individual summaries
 * @returns {Promise<string>} - Combined summary
 */
const combineChunkSummaries = async (chunkSummaries) => {
  if (!chunkSummaries || chunkSummaries.length === 0) {
    return 'No summary available.';
  }

  if (chunkSummaries.length === 1) {
    return chunkSummaries[0];
  }

  // Simply join the summaries without section labels for seamless flow
  // Each summary already contains properly formatted bullets starting with "- "
  const combinedText = chunkSummaries
    .map(summary => summary.trim())
    .join('\n\n');

  ErrorLogger.info('Combined chunk summaries', { component: 'queueProcessor', action: 'combineChunkSummaries', chunkCount: chunkSummaries.length, combinedLength: combinedText.length });
  return combinedText;
};

/**
 * Calculate estimated processing time
 * @param {string} text - Document text
 * @param {number} flashcardCount - Number of flashcards
 * @returns {Object} - Time estimates
 */
export const estimateProcessingTime = (text, flashcardCount) => {
  const estimatedPages = Math.ceil(text.length / CONFIG.CHARS_PER_PAGE);
  const mode = determineProcessingMode(text, flashcardCount);
  
  let summaryTime = 0;
  let flashcardTime = 0;

  if (mode.mode === 'fast') {
    summaryTime = Math.min(30, estimatedPages * 2); // ~2 seconds per page, max 30s
    flashcardTime = Math.min(45, flashcardCount * 1.5); // ~1.5 seconds per card, max 45s
  } else {
    summaryTime = Math.min(120, estimatedPages * 3); // ~3 seconds per page, max 2 minutes
    flashcardTime = Math.min(180, flashcardCount * 2.5); // ~2.5 seconds per card, max 3 minutes
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

const formatTime = (seconds) => {
  if (seconds < 60) {
    return `${seconds} seconds`;
  } else if (seconds < 120) {
    return `${Math.round(seconds / 60)} minute`;
  } else {
    return `${Math.round(seconds / 60)} minutes`;
  }
};