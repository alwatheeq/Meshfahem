import { ErrorLogger } from './errorLogger';

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface MedicalFunctionBody {
  action: string;
  text?: string;
  count?: number;
  model?: string;
  maxTokens?: number;
  pageCount?: number;
}

export interface MedicalResponse {
  success: boolean;
  error?: string;
  summary?: string;
  flashcards?: Array<{ front: string; back: string }>;
  topics?: string[];
  tokens?: TokenUsage;
}

export interface ValidationResult {
  isValid: boolean;
  score: number;
  feedback: string;
}

export interface SummaryResult {
  summary: string;
  tokens: TokenUsage;
}

export interface FlashcardsResult {
  flashcards: Array<{ front: string; back: string }>;
  tokens: TokenUsage;
}

class MedStudentClient {
  baseUrl: string;
  headers: Record<string, string>;

  constructor() {
    this.baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/med-student-mode`;
    this.headers = {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    };
  }

  async callMedicalFunction(body: MedicalFunctionBody): Promise<MedicalResponse> {
    try {
      ErrorLogger.debug('Calling Medical Student Mode function', { component: 'medStudentClient', action: 'callMedicalFunction', actionType: body.action });
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Medical processing failed: ${response.status} ${errorText}`);
        ErrorLogger.error(error, { component: 'medStudentClient', action: 'callMedicalFunction', actionType: body.action, status: response.status });
        throw error;
      }

      const data: MedicalResponse = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Medical processing failed');
      }

      ErrorLogger.debug('Medical mode response received successfully', { component: 'medStudentClient', action: 'callMedicalFunction', actionType: body.action });
      return data;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'medStudentClient', action: 'callMedicalFunction', actionType: body?.action });
      throw new Error(`Medical processing error: ${err.message}`);
    }
  }

  async validateMedicalContent(text: string): Promise<ValidationResult> {
    if (!text || typeof text !== 'string') {
      return { isValid: false, score: 0, feedback: 'No text content provided' };
    }

    const trimmedText = text.trim();
    
    if (trimmedText.length < 200) {
      return { isValid: false, score: 0, feedback: 'Text too short for medical analysis (minimum 200 characters)' };
    }

    if (trimmedText.length > 50000) {
      return { isValid: false, score: 0, feedback: 'Text too long for optimal medical processing' };
    }

    const medicalTerms = [
      'diagnosis', 'treatment', 'symptom', 'patient', 'disease', 'condition', 'therapy',
      'clinical', 'medical', 'pathology', 'etiology', 'prognosis', 'syndrome',
      'cardiovascular', 'respiratory', 'neurological', 'gastrointestinal', 'renal',
      'hepatic', 'cardiac', 'pulmonary', 'dermatology', 'oncology',
      'surgery', 'procedure', 'intervention', 'examination', 'assessment',
      'medication', 'drug', 'pharmacology', 'dosage', 'administration',
      'anatomy', 'physiology', 'organ', 'tissue', 'cell', 'muscle', 'bone'
    ];

    const lowerText = trimmedText.toLowerCase();
    const foundTerms = medicalTerms.filter(term => lowerText.includes(term));
    const medicalScore = Math.min((foundTerms.length / medicalTerms.length) * 100, 40);

    let score = 50;
    score += medicalScore;
    
    if (lowerText.includes('patient') || lowerText.includes('clinical')) score += 10;
    if (lowerText.includes('diagnosis') || lowerText.includes('treatment')) score += 10;

    const isValid = score >= 65;
    
    return {
      isValid,
      score: Math.round(score),
      feedback: isValid 
        ? `Suitable for medical processing (${Math.round(medicalScore)}% medical terminology detected)`
        : 'Content may not be medical-focused enough for optimal results'
    };
  }

  async generateMedicalSummary(text: string, pageCount: number = 0): Promise<SummaryResult> {
    const validation = await this.validateMedicalContent(text);
    if (!validation.isValid) {
      throw new Error(validation.feedback);
    }

    const response = await this.callMedicalFunction({
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

  async generateMedicalFlashcards(text: string, count: number, pageCount: number = 0): Promise<FlashcardsResult> {
    const validation = await this.validateMedicalContent(text);
    if (!validation.isValid) {
      throw new Error(validation.feedback);
    }

    const response = await this.callMedicalFunction({
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

  async detectMedicalTopics(text: string): Promise<string[]> {
    const validation = await this.validateMedicalContent(text);
    if (!validation.isValid) {
      return ['Medicine', 'Clinical Studies'];
    }

    try {
      const response = await this.callMedicalFunction({
        action: 'detect_medical_topics',
        text,
        model: 'claude-3-haiku-20240307',
        maxTokens: 500
      });

      return response.topics!;
    } catch (error) {
      console.warn('Medical topic detection failed:', error);
      return ['Medicine', 'Clinical Studies'];
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.callMedicalFunction({ action: 'ping' });
      return response.success === true;
    } catch {
      return false;
    }
  }
}

export const medStudentClient = new MedStudentClient();
export { MedStudentClient };
