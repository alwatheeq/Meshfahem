// Translation Utilities
// Handles dynamic content translation using Supabase Edge Functions

import { supabase } from '../lib/supabase';
import { ErrorLogger } from './errorLogger';

export interface Language {
  code: string;
  name: string;
  flag: string;
  dir: 'ltr' | 'rtl';
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface TranslatableContent {
  summaryChunks: string[];
  flashcards: Flashcard[];
}

export interface TranslatedContent {
  summaryChunks: string[];
  flashcards: Flashcard[];
}

type ProgressCallback = (progress: number, message: string) => void;

/**
 * Available languages for translation
 */
export const AVAILABLE_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', flag: '🇺🇸', dir: 'ltr' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  { code: 'fr', name: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷', dir: 'ltr' },
];

/**
 * Detect the language of text content
 * @param text - Text to detect language from
 * @returns Detected language code ('en', 'ar', 'fr', 'tr', or 'original')
 */
export const detectLanguage = async (text: string): Promise<string> => {
  if (!text || typeof text !== 'string' || text.trim().length < 50) {
    // Too short for reliable detection
    return 'original';
  }

  try {
    const { data, error } = await supabase.functions.invoke('detect-language', {
      body: { text: text.substring(0, 1000) } // Use first 1000 chars for efficiency
    });

    if (error || !data?.language) {
      ErrorLogger.warn('Language detection failed or returned no result', {
        component: 'translation',
        action: 'detectLanguage',
        error: error?.message,
        hasData: !!data
      });
      return 'original';
    }

    // Map detected language to our codes
    const languageMap: Record<string, string> = {
      'en': 'en',
      'ar': 'ar',
      'fr': 'fr',
      'tr': 'tr'
    };

    const detectedLang: string = data.language;
    const mappedLanguage: string = languageMap[detectedLang] || 'original';

    ErrorLogger.debug('Language detected', {
      component: 'translation',
      action: 'detectLanguage',
      detectedLanguage: detectedLang,
      mappedLanguage: mappedLanguage
    });

    return mappedLanguage;
  } catch (error) {
    ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), {
      component: 'translation',
      action: 'detectLanguage'
    });
    return 'original';
  }
};

/**
 * Get language info by code
 * @param languageCode - The language code
 * @returns The language object
 */
export const getLanguageInfo = (languageCode: string): Language => {
  const language = AVAILABLE_LANGUAGES.find(lang => lang.code === languageCode);
  return language || AVAILABLE_LANGUAGES[0]; // Default to English
};

/**
 * Get language name by code (backward compatibility)
 * @param languageCode - The language code
 * @returns The language name
 */
export const getLanguageName = (languageCode: string): string => {
  const language = getLanguageInfo(languageCode);
  return language.name;
};

/**
 * Check if translation is needed
 * @param languageCode - The target language code
 * @returns True if translation is needed
 */
export const needsTranslation = (languageCode: string): boolean => {
  return !!languageCode && languageCode !== 'original' && languageCode !== 'en';
};

/**
 * Translate text using Supabase Edge Function
 * @param text - Text to translate
 * @param targetLanguage - Target language
 * @returns Translated text
 */
export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
  if (!text || !targetLanguage || targetLanguage === 'original') {
    return text;
  }

  try {
    const { data, error } = await supabase.functions.invoke('translate-text', {
      body: {
        text: text.trim(),
        targetLanguage: getLanguageName(targetLanguage)
      }
    });

    if (error) {
      ErrorLogger.error(error, { component: 'translation', action: 'translateText', targetLanguage });
      throw new Error(error.message || 'Translation failed');
    }

    if (!data || !data.translatedText) {
      throw new Error('No translation received');
    }

    return data.translatedText;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'translation', action: 'translateText', targetLanguage });
    throw new Error(`Translation failed: ${err.message}`);
  }
};

/**
 * Translate an array of texts in bulk
 * @param texts - Array of texts to translate
 * @param targetLanguage - Target language code
 * @returns Array of translated texts
 */
export const translateBulk = async (texts: string[], targetLanguage: string): Promise<string[]> => {
  if (!texts || texts.length === 0 || !targetLanguage || targetLanguage === 'original') {
    return texts;
  }

  const results: string[] = [];
  for (const text of texts) {
    const translated = await translateText(text, targetLanguage);
    results.push(translated);
  }
  return results;
};

/**
 * Translate summary content
 * @param summary - Summary text to translate
 * @param targetLanguage - Target language code
 * @param onProgress - Progress callback
 * @returns Translated summary
 */
export const translateSummary = async (
  summary: string,
  targetLanguage: string,
  onProgress?: ProgressCallback
): Promise<string> => {
  if (!needsTranslation(targetLanguage)) {
    return summary;
  }

  if (onProgress) {
    onProgress(20, 'Translating summary...');
  }

  try {
    const translatedSummary = await translateText(summary, targetLanguage);

    if (onProgress) {
      onProgress(100, 'Summary translation complete');
    }

    return translatedSummary;
  } catch (error) {
    if (onProgress) {
      onProgress(0, 'Summary translation failed');
    }
    throw error;
  }
};

/**
 * Translate flashcards
 * @param flashcards - Array of flashcard objects
 * @param targetLanguage - Target language code
 * @param onProgress - Progress callback
 * @returns Translated flashcards
 */
export const translateFlashcards = async (
  flashcards: Flashcard[],
  targetLanguage: string,
  onProgress?: ProgressCallback
): Promise<Flashcard[]> => {
  if (!needsTranslation(targetLanguage) || !Array.isArray(flashcards)) {
    return flashcards;
  }

  const totalCards = flashcards.length;
  const translatedCards: Flashcard[] = [];

  try {
    for (let i = 0; i < flashcards.length; i++) {
      const card = flashcards[i];
      const progress = Math.round(((i + 1) / totalCards) * 100);

      if (onProgress) {
        onProgress(progress, `Translating flashcard ${i + 1} of ${totalCards}...`);
      }

      // Translate front and back of the flashcard
      const [translatedFront, translatedBack] = await Promise.all([
        translateText(card.front, targetLanguage),
        translateText(card.back, targetLanguage)
      ]);

      translatedCards.push({
        front: translatedFront,
        back: translatedBack
      });

      // Small delay between translations to avoid rate limiting
      if (i < flashcards.length - 1) {
        await new Promise<void>(resolve => setTimeout(resolve, 500));
      }
    }

    return translatedCards;
  } catch (error) {
    if (onProgress) {
      onProgress(0, 'Flashcard translation failed');
    }
    throw error;
  }
};

/**
 * Translate all content (summary and flashcards)
 * @param content - Content object with summary and flashcards
 * @param targetLanguage - Target language code
 * @param onProgress - Progress callback
 * @returns Translated content
 */
export const translateContent = async (
  content: TranslatableContent,
  targetLanguage: string,
  onProgress?: ProgressCallback
): Promise<TranslatedContent> => {
  if (!needsTranslation(targetLanguage)) {
    return content;
  }

  const { summaryChunks, flashcards } = content;

  try {
    // Translate all summary chunks (40% of progress)
    if (onProgress) {
      onProgress(10, 'Starting translation...');
    }

    const translatedSummaryChunks: string[] = [];
    if (summaryChunks.length > 0) {
      // Combine all chunks into one for translation (maintains context)
      const combinedSummary = summaryChunks.join('\n\n');
      const translatedSummary = await translateSummary(combinedSummary, targetLanguage, (progress: number, message: string) => {
        if (onProgress) {
          onProgress(10 + Math.round(progress * 0.3), message); // 10-40% for summary
        }
      });

      // Split back into chunks if needed (preserve structure)
      // For now, return as single chunk to maintain simplicity
      translatedSummaryChunks.push(translatedSummary);
    }

    // Translate flashcards (remaining 60% of progress)
    const translatedFlashcards: Flashcard[] = flashcards.length > 0
      ? await translateFlashcards(flashcards, targetLanguage, (progress: number, message: string) => {
          if (onProgress) {
            onProgress(40 + Math.round(progress * 0.6), message); // 40-100% for flashcards
          }
        })
      : [];

    if (onProgress) {
      onProgress(100, 'Translation complete!');
    }

    return {
      summaryChunks: translatedSummaryChunks,
      flashcards: translatedFlashcards
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'translation', action: 'translateContent', targetLanguage });
    throw new Error(`Translation failed: ${err.message}`);
  }
};

/**
 * Cache translated content to avoid re-translation
 */
class TranslationCache {
  private cache: Map<string, string>;

  constructor() {
    this.cache = new Map();
  }

  getKey(text: string, targetLanguage: string): string {
    return `${targetLanguage}:${text.substring(0, 100)}`; // Use first 100 chars as key
  }

  get(text: string, targetLanguage: string): string | undefined {
    return this.cache.get(this.getKey(text, targetLanguage));
  }

  set(text: string, targetLanguage: string, translatedText: string): void {
    this.cache.set(this.getKey(text, targetLanguage), translatedText);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Create a singleton cache instance
export const translationCache = new TranslationCache();
