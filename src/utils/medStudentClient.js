// Medical Student Mode API Client
// Handles communication with the med-student-mode Edge Function

import { supabase } from '../lib/supabase';
import { ErrorLogger } from './errorLogger';

class MedStudentClient {
  constructor() {
    this.baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/med-student-mode`;
    this.headers = {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Call the med-student-mode Edge Function
   * @param {Object} body - Request body
   * @returns {Promise<Object>} - Response data
   */
  async callMedicalFunction(body) {
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

      const data = await response.json();
      
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

  /**
   * Validate if content is suitable for medical processing
   * @param {string} text - Text to validate
   * @returns {Promise<Object>} - Validation result
   */
  async validateMedicalContent(text) {
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

    // Medical terminology detection
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

    let score = 50; // Base score
    score += medicalScore; // Add up to 40 points for medical content
    
    // Bonus points for clinical indicators
    if (lowerText.includes('patient') || lowerText.includes('clinical')) score += 10;
    if (lowerText.includes('diagnosis') || lowerText.includes('treatment')) score += 10;

    const isValid = score >= 65; // Higher threshold for medical content
    
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
   * @param {string} text - Medical text content
   * @param {number} pageCount - Page count for usage tracking
   * @returns {Promise<{summary: string, tokens: {input: number, output: number, total: number}}>} - Medical summary with token usage
   */
  async generateMedicalSummary(text, pageCount = 0) {
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
      summary: response.summary,
      tokens: response.tokens || { input: 0, output: 0, total: 0 }
    };
  }

  /**
   * Generate medical flashcards
   * @param {string} text - Medical text content
   * @param {number} count - Number of flashcards
   * @param {number} pageCount - Page count for usage tracking
   * @returns {Promise<{flashcards: Array, tokens: {input: number, output: number, total: number}}>} - Medical flashcards with token usage
   */
  async generateMedicalFlashcards(text, count, pageCount = 0) {
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
      flashcards: response.flashcards,
      tokens: response.tokens || { input: 0, output: 0, total: 0 }
    };
  }

  /**
   * Detect medical topics
   * @param {string} text - Medical text content
   * @returns {Promise<Array>} - Detected medical topics
   */
  async detectMedicalTopics(text) {
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

      return response.topics;
    } catch (error) {
      console.warn('Medical topic detection failed:', error);
      return ['Medicine', 'Clinical Studies'];
    }
  }

  /**
   * Test API connection
   * @returns {Promise<boolean>} - True if API is accessible
   */
  async testConnection() {
    try {
      const response = await this.callMedicalFunction({ action: 'ping' });
      return response.success === true;
    } catch {
      return false;
    }
  }
}

// Create and export singleton instance
export const medStudentClient = new MedStudentClient();
export { MedStudentClient };