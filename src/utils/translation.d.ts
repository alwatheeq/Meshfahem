export interface Language {
  code: string;
  name: string;
  flag: string;
  dir: 'ltr' | 'rtl';
}

export const AVAILABLE_LANGUAGES: Language[];

export function getLanguageInfo(languageCode: string): Language;
export function getLanguageName(languageCode: string): string;
export function needsTranslation(languageCode: string): boolean;
export function translateText(text: string, targetLanguage: string): Promise<string>;
export function translateBulk(texts: string[], targetLanguage: string): Promise<string[]>;

