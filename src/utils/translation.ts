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

export type ProgressCallback = (progress: number, message: string) => void;

export interface Flashcard {
  front: string;
  back: string;
}

export interface TranslateContentInput {
  summaryChunks: string[];
  flashcards: Flashcard[];
}

export interface TranslateContentOutput {
  summaryChunks: string[];
  flashcards: Flashcard[];
}

export const AVAILABLE_LANGUAGES: readonly Language[] = [
  { code: 'en', name: 'English', flag: '🇺🇸', dir: 'ltr' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  { code: 'fr', name: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷', dir: 'ltr' },
] as const;

export const detectLanguage = async (text: string): Promise<string> => {
  if (!text || typeof text !== 'string' || text.trim().length < 50) {
    return 'original';
  }

  try {
    const { data, error } = await supabase.functions.invoke('detect-language', {
      body: { text: text.substring(0, 1000) }
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

    const languageMap: Record<string, string> = {
      'en': 'en',
      'ar': 'ar',
      'fr': 'fr',
      'tr': 'tr'
    };

    const detectedLang = data.language;
    const mappedLanguage = languageMap[detectedLang] || 'original';

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

export const getLanguageInfo = (languageCode: string): Language => {
  const language = AVAILABLE_LANGUAGES.find(lang => lang.code === languageCode);
  return language || AVAILABLE_LANGUAGES[0];
};

export const getLanguageName = (languageCode: string): string => {
  const language = getLanguageInfo(languageCode);
  return language.name;
};

export const needsTranslation = (languageCode: string): boolean => {
  return !!languageCode && languageCode !== 'original' && languageCode !== 'en';
};

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

      const [translatedFront, translatedBack] = await Promise.all([
        translateText(card.front, targetLanguage),
        translateText(card.back, targetLanguage)
      ]);

      translatedCards.push({
        front: translatedFront,
        back: translatedBack
      });

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

export const translateContent = async (
  content: TranslateContentInput,
  targetLanguage: string,
  onProgress?: ProgressCallback
): Promise<TranslateContentOutput> => {
  if (!needsTranslation(targetLanguage)) {
    return content;
  }

  const { summaryChunks, flashcards } = content;
  
  try {
    if (onProgress) {
      onProgress(10, 'Starting translation...');
    }

    const translatedSummaryChunks: string[] = [];
    if (summaryChunks.length > 0) {
      const combinedSummary = summaryChunks.join('\n\n');
      const translatedSummary = await translateSummary(combinedSummary, targetLanguage, (progress, message) => {
        if (onProgress) {
          onProgress(10 + Math.round(progress * 0.3), message);
        }
      });
      
      translatedSummaryChunks.push(translatedSummary);
    }

    const translatedFlashcards = flashcards.length > 0
      ? await translateFlashcards(flashcards, targetLanguage, (progress, message) => {
          if (onProgress) {
            onProgress(40 + Math.round(progress * 0.6), message);
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

class TranslationCache {
  cache: Map<string, string>;

  constructor() {
    this.cache = new Map();
  }

  getKey(text: string, targetLanguage: string): string {
    return `${targetLanguage}:${text.substring(0, 100)}`;
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
