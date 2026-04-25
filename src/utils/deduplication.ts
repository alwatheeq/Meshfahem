// Deduplication Service
// Handles text normalization, hashing, and cache checking to avoid redundant AI processing

import { supabase } from '../lib/supabase';
import { ErrorLogger } from './errorLogger';

export interface Flashcard {
  front: string;
  back: string;
}

export interface CacheResult {
  summary: string;
  flashcards: Flashcard[];
  cachedAt: string;
}

export interface CacheStats {
  totalEntries: number;
  validEntries: number;
  totalSizeBytes?: number;
  retentionDays: number;
}

/**
 * Normalize text content for consistent hashing
 * Removes slide numbers, headers, footers, and standardizes formatting
 */
export const normalizeText = (text: string): string => {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const normalized = text
    // Convert to lowercase
    .toLowerCase()
    // Remove common slide/page headers and footers
    .replace(/slide \d+/gi, '')
    .replace(/page \d+ of \d+/gi, '')
    .replace(/^\d+\s*$/gm, '') // Remove standalone page numbers
    // Remove common presentation artifacts
    .replace(/^(agenda|outline|overview|conclusion|thank you|questions\?)$/gmi, '')
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove leading/trailing whitespace
    .trim()
    // Remove common document metadata
    .replace(/^(title|author|date|version):\s*.+$/gmi, '')
    // Remove timestamps
    .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, '')
    .replace(/\d{1,2}-\d{1,2}-\d{4}/g, '')
    // Remove bullet points and numbering
    .replace(/^[\s]*(?:[•\-*]|\d+\.)[\s]*/gm, '')
    // Normalize punctuation spacing
    .replace(/\s*([,.!?;:])\s*/g, '$1 ')
    // Remove duplicate spaces
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
};

/**
 * Generate SHA-256 hash of normalized text
 */
export const generateTextHash = async (normalizedText: string): Promise<string> => {
  if (!normalizedText) {
    throw new Error('Text is required for hashing');
  }

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(normalizedText);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // Convert buffer to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'deduplication', action: 'generateTextHash' });
    throw new Error('Failed to generate content hash');
  }
};

/**
 * Create a composite key for cache lookups
 * Includes content hash, flashcard count, and processing mode
 */
export const createCacheKey = (contentHash: string, flashcardCount: number, mode: string = 'full'): string => {
  return `${contentHash}_${flashcardCount}_${mode}`;
};

/**
 * Check if content has been processed before
 * Now queries Supabase for cached results
 */
export const checkCache = async (cacheKey: string): Promise<CacheResult | null> => {
  try {
    ErrorLogger.debug('Checking cache', { component: 'deduplication', action: 'checkCache', cacheKey });
    
    // Query Supabase for cached content that hasn't expired
    const { data, error } = await supabase
      .from('cached_content')
      .select('summary, flashcards, created_at')
      .eq('content_hash', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) {
      ErrorLogger.error(error, { component: 'deduplication', action: 'checkCache', cacheKey });
      return null;
    }

    if (!data) {
      ErrorLogger.debug('No cached content found', { component: 'deduplication', action: 'checkCache', cacheKey });
      return null;
    }

    ErrorLogger.debug('Cache hit', { component: 'deduplication', action: 'checkCache', cacheKey });
    return {
      summary: data.summary,
      flashcards: data.flashcards,
      cachedAt: data.created_at
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'deduplication', action: 'checkCache', cacheKey });
    return null;
  }
};

/**
 * Store processed results in cache
 * Now stores in Supabase with 365-day retention
 */
export const storeInCache = async (cacheKey: string, summary: string, flashcards: Flashcard[]): Promise<void> => {
  try {
    ErrorLogger.debug('Storing in cache', { component: 'deduplication', action: 'storeInCache', cacheKey });
    
    // Calculate expiration date (365 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 365);

    // Insert into Supabase
    const { error } = await supabase
      .from('cached_content')
      .insert({
        content_hash: cacheKey,
        summary: summary,
        flashcards: flashcards,
        expires_at: expiresAt.toISOString()
      });

    if (error) {
      ErrorLogger.error(error, { component: 'deduplication', action: 'storeInCache', cacheKey });
      return;
    }

    ErrorLogger.info('Successfully cached result', { component: 'deduplication', action: 'storeInCache', cacheKey });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'deduplication', action: 'storeInCache', cacheKey });
  }
};

/**
 * Clean expired cache entries from Supabase
 * This function can be called periodically or by a scheduled job
 */
export const cleanExpiredCache = async (): Promise<number> => {
  try {
    ErrorLogger.debug('Cleaning expired cache entries', { component: 'deduplication', action: 'cleanExpiredCache' });
    
    const { data, error } = await supabase
      .from('cached_content')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      ErrorLogger.error(error, { component: 'deduplication', action: 'cleanExpiredCache' });
      return 0;
    }

    const cleanedCount = data ? data.length : 0;
    ErrorLogger.info('Cleaned expired cache entries', { component: 'deduplication', action: 'cleanExpiredCache', cleanedCount });

    return cleanedCount;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'deduplication', action: 'cleanExpiredCache' });
    return 0;
  }
};

/**
 * Clean expired history entries from Supabase
 * This function can be called periodically or by a scheduled job
 */
export const cleanExpiredHistory = async (): Promise<number> => {
  try {
    ErrorLogger.debug('Cleaning expired history entries', { component: 'deduplication', action: 'cleanExpiredHistory' });
    
    const { data, error } = await supabase
      .from('user_history')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      ErrorLogger.error(error, { component: 'deduplication', action: 'cleanExpiredHistory' });
      return 0;
    }

    const cleanedCount = data ? data.length : 0;
    ErrorLogger.info('Cleaned expired history entries', { component: 'deduplication', action: 'cleanExpiredHistory', cleanedCount });

    return cleanedCount;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'deduplication', action: 'cleanExpiredHistory' });
    return 0;
  }
};

/**
 * Get cache statistics from Supabase
 */
export const getCacheStats = async (): Promise<CacheStats> => {
  try {
    const { data, error } = await supabase
      .from('cached_content')
      .select('id, created_at, expires_at')
      .gt('expires_at', new Date().toISOString());

    if (error) {
      ErrorLogger.error(error, { component: 'deduplication', action: 'getCacheStats' });
      return {
        totalEntries: 0,
        validEntries: 0,
        retentionDays: 365
      };
    }

    return {
      totalEntries: data ? data.length : 0,
      validEntries: data ? data.length : 0,
      retentionDays: 365
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'deduplication', action: 'getCacheStats' });
    return {
      totalEntries: 0,
      validEntries: 0,
      totalSizeBytes: 0,
      retentionDays: 365
    };
  }
};

// Utility function to validate and deduplicate flashcards
export const deduplicateFlashcards = (flashcards: Flashcard[], threshold: number = 0.8): Flashcard[] => {
  if (!Array.isArray(flashcards)) {
    return [];
  }

  const unique: Flashcard[] = [];
  
  for (const card of flashcards) {
    if (!card || !card.front || !card.back) {
      continue;
    }

    // Check for duplicates using simple string similarity
    const isDuplicate = unique.some(existingCard => {
      const frontSimilarity = calculateSimilarity(
        card.front.toLowerCase(),
        existingCard.front.toLowerCase()
      );
      
      return frontSimilarity > threshold;
    });

    if (!isDuplicate) {
      unique.push(card);
    }
  }

  return unique;
};

// Simple string similarity calculation (Levenshtein distance ratio)
const calculateSimilarity = (str1: string, str2: string): number => {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1;
  
  const distance = levenshteinDistance(str1, str2);
  return (maxLength - distance) / maxLength;
};

const levenshteinDistance = (str1: string, str2: string): number => {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
};
