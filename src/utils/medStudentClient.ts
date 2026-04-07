// Medical Student Mode API Client
// Handles communication with the med-student-mode Edge Function

import { supabase } from '../lib/supabase';
import { ErrorLogger } from './errorLogger';

interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

interface MedicalFunctionBody {
  action: string;
  text?: string;
  count?: number;
  model?: string;
  maxTokens?: number;
  pageCount?: number;
}

interface MedicalFunctionResponse {
  success: boolean;
  error?: string;
  summary?: string;
  flashcards?: Flashcard[];
  topics?: string[];
  tokens?: TokenUsage;
}

interface Flashcard {
  question: string;
  answer: string;
  [key: string]: unknown;
}

interface ValidationResult {
  isValid: boolean;
  score: number;
  feedback: string;
}

interface MedicalSummaryResult {
  summary: string;
  tokens: TokenUsage;
}

interface MedicalFlashcardsResult {
  flashcards: Flashcard[];
  tokens: TokenUsage;
}

class MedStudentClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor() {
    this.baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/med-student-mode`;
    this.headers = {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Call the med-student-mode Edge Function
   */
  async callMedicalFunction(body: MedicalFunctionBody): Promise<MedicalFunctionResponse> {
    try {
      ErrorLogger.debug('Calling Medical Student Mode function', { component: 'medStudentClient', action: 'callMedicalFunction', actionType: body.action } as Record<string, unknown>);

      const response: Response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText: string = await response.text();
        const error: Error = new Error(`Medical processing failed: ${response.status} ${errorText}`);
        ErrorLogger.error(error, { component: 'medStudentClient', action: 'callMedicalFunction', actionType: body.action, status: response.status } as Record<string, unknown>);
        throw error;
      }

      const data: MedicalFunctionResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Medical processing failed');
      }

      ErrorLogger.debug('Medical mode response received successfully', { component: 'medStudentClient', action: 'callMedicalFunction', actionType: body.action } as Record<string, unknown>);
      return data;
    } catch (error: unknown) {
      const err: Error = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'medStudentClient', action: 'callMedicalFunction', actionType: body?.action } as Record<string, unknown>);
      throw new Error(`Medical processing error: ${err.message}`);
    }
  }

  /**
   * Validate if content is suitable for medical processing
   */
  async validateMedicalContent(text: string): Promise<ValidationResult> {
    if (!text || typeof text !== 'string') {
      return { isValid: false, score: 0, feedback: 'No text content provided' };
    }

    const trimmedText: string = text.trim();

    if (trimmedText.length < 200) {
      return { isValid: false, score: 0, feedback: 'Text too short for medical analysis (minimum 200 characters)' };
    }

    if (trimmedText.length > 50000) {
      return { isValid: false, score: 0, feedback: 'Text too long for optimal medical processing' };
    }

    // Medical terminology detection
    const medicalTerms: string[] = [
      'diagnosis', 'treatment', 'symptom', 'patient', 'disease', 'condition', 'therapy',
      'clinical', 'medical', 'pathology', 'etiology', 'prognosis', 'syndrome',
      'cardiovascular', 'respiratory', 'neurological', 'gastrointestinal', 'renal',
      'hepatic', 'cardiac', 'pulmonary', 'dermatology', 'oncology',
      'surgery', 'procedure', 'intervention', 'examination', 'assessment',
      'medication', 'drug', 'pharmacology', 'dosage', 'administration',
      'anatomy', 'physiology', 'organ', 'tissue', 'cell', 'muscle', 'bone'
    ];

    const lowerText: string = trimmedText.toLowerCase();
    const foundTerms: string[] = medicalTerms.filter((term: string) => lowerText.includes(term));
    const medicalScore: number = Math.min((foundTerms.length / medicalTerms.length) * 100, 40);

    let score: number = 50; // Base score
    score += medicalScore; // Add up to 40 points for medical content

    // Bonus points for clinical indicators
    if (lowerText.includes('patient') || lowerText.includes('clinical')) score += 10;
    if (lowerText.includes('diagnosis') || lowerText.includes('treatment')) score += 10;

    const isValid: boolean = score >= 65; // Higher threshold for medical content

    return {
      isValid,
      score: Math.round(score),
      feedback: isValid
        ? `Suitable for medical processing (${Math.round(medicalScore)}% medical terminology detected)`
        : 'Content may not be medical-focused enough for optimal results'
    };
  }

  /**
   * Generate medical summary
   */
  async generateMedicalSummary(text: string, pageCount: number = 0): Promise<MedicalSummaryResult> {
    const validation: ValidationResult = await this.validateMedicalContent(text);
    if (!validation.isValid) {
      throw new Error(validation.feedback);
    }

    const response: MedicalFunctionResponse = await this.callMedicalFunction({
      action: 'summarize_medical_text',
      text,
      model: 'claude-3-haiku-20240307',
      maxTokens: 2000,
      pageCount
    });

    return {
      summary: response.summary!,
      tokens: response.tokens || { input: 0, output: 0, total: 0 }
    };
  }

  /**
   * Generate medical flashcards
   */
  async generateMedicalFlashcards(text: string, count: number, pageCount: number = 0): Promise<MedicalFlashcardsResult> {
    const validation: ValidationResult = await this.validateMedicalContent(text);
    if (!validation.isValid) {
      throw new Error(validation.feedback);
    }

    const response: MedicalFunctionResponse = await this.callMedicalFunction({
      action: 'generate_medical_flashcards',
      text,
      count,
      model: 'claude-3-haiku-20240307',
      maxTokens: 2500,
      pageCount
    });

    return {
      flashcards: response.flashcards!,
      tokens: response.tokens || { input: 0, output: 0, total: 0 }
    };
  }

  /**
   * Detect medical topics
   */
  async detectMedicalTopics(text: string): Promise<string[]> {
    const validation: ValidationResult = await this.validateMedicalContent(text);
    if (!validation.isValid) {
      return ['Medicine', 'Clinical Studies'];
    }

    try {
      const response: MedicalFunctionResponse = await this.callMedicalFunction({
        action: 'detect_medical_topics',
        text,
        model: 'claude-3-haiku-20240307',
        maxTokens: 500
      });

      return response.topics!;
    } catch (error: unknown) {
      console.warn('Medical topic detection failed:', error);
      return ['Medicine', 'Clinical Studies'];
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response: MedicalFunctionResponse = await this.callMedicalFunction({ action: 'ping' });
      return response.success === true;
    } catch {
      return false;
    }
  }
}

// Create and export singleton instance
export const medStudentClient: MedStudentClient = new MedStudentClient();
export { MedStudentClient };
