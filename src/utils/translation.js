// Translation Utilities
// Handles dynamic content translation using Supabase Edge Functions

import { supabase } from '../lib/supabase';
import { ErrorLogger } from './errorLogger';

/**
 * Available languages for translation
 */
export const AVAILABLE_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸', dir: 'ltr' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  { code: 'fr', name: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷', dir: 'ltr' },
];

/**
 * Get language info by code
 * @param {string} languageCode - The language code
 * @returns {object} - The language object
 */
export const getLanguageInfo = (languageCode) => {
  const language = AVAILABLE_LANGUAGES.find(lang => lang.code === languageCode);
  return language || AVAILABLE_LANGUAGES[0]; // Default to English
};

/**
 * Get language name by code (backward compatibility)
 * @param {string} languageCode - The language code
 * @returns {string} - The language name
 */
export const getLanguageName = (languageCode) => {
  const language = getLanguageInfo(languageCode);
  return language.name;
};

/**
 * Check if translation is needed
 * @param {string} languageCode - The target language code
 * @returns {boolean} - True if translation is needed
 */
export const needsTranslation = (languageCode) => {
  return languageCode && languageCode !== 'original' && languageCode !== 'en';
};

/**
 * Translate text using Supabase Edge Function
 * @param {string} text - Text to translate
 * @param {string} targetLanguage - Target language
 * @returns {Promise<string>} - Translated text
 */
export const translateText = async (text, targetLanguage) => {
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
 * Translate summary content
 * @param {string} summary - Summary text to translate
 * @param {string} targetLanguage - Target language code
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<string>} - Translated summary
 */
export const translateSummary = async (summary, targetLanguage, onProgress) => {
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
 * @param {Array} flashcards - Array of flashcard objects
 * @param {string} targetLanguage - Target language code
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} - Translated flashcards
 */
export const translateFlashcards = async (flashcards, targetLanguage, onProgress) => {
  if (!needsTranslation(targetLanguage) || !Array.isArray(flashcards)) {
    return flashcards;
  }

  const totalCards = flashcards.length;
  const translatedCards = [];

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
        await new Promise(resolve => setTimeout(resolve, 500));
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
 * @param {Object} content - Content object with summary and flashcards
 * @param {string} targetLanguage - Target language code
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} - Translated content
 */
export const translateContent = async (content, targetLanguage, onProgress) => {
  if (!needsTranslation(targetLanguage)) {
    return content;
  }

  const { summaryChunks, flashcards } = content;
  
  try {
    // Translate summary (50% of progress)
    if (onProgress) {
      onProgress(10, 'Starting translation...');
    }

    const translatedSummary = summaryChunks.length > 0 
      ? await translateSummary(summaryChunks[0], targetLanguage, (progress, message) => {
          if (onProgress) {
            onProgress(Math.round(progress * 0.4), message); // 0-40% for summary
          }
        })
      : '';

    // Translate flashcards (remaining 50% of progress)
    const translatedFlashcards = flashcards.length > 0
      ? await translateFlashcards(flashcards, targetLanguage, (progress, message) => {
          if (onProgress) {
            onProgress(40 + Math.round(progress * 0.6), message); // 40-100% for flashcards
          }
        })
      : [];

    if (onProgress) {
      onProgress(100, 'Translation complete!');
    }

    return {
      summaryChunks: translatedSummary ? [translatedSummary] : [],
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
  constructor() {
    this.cache = new Map();
  }

  getKey(text, targetLanguage) {
    return `${targetLanguage}:${text.substring(0, 100)}`; // Use first 100 chars as key
  }

  get(text, targetLanguage) {
    return this.cache.get(this.getKey(text, targetLanguage));
  }

  set(text, targetLanguage, translatedText) {
    this.cache.set(this.getKey(text, targetLanguage), translatedText);
  }

  clear() {
    this.cache.clear();
  }
}

// Create a singleton cache instance
export const translationCache = new TranslationCache();