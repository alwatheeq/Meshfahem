// File Processing Utilities
// Handles file upload, text extraction, and validation

import { CONFIG } from './config.js';
import { supabase } from '../lib/supabase';
import { ErrorLogger } from './errorLogger';

/**
 * Validate uploaded file against requirements
 * @param {File} file - The uploaded file
 * @returns {Object} - Validation result with isValid flag and error message
 */
export const validateFile = (file) => {
  if (!file) {
    return { isValid: false, error: 'No file selected' };
  }

  // Check file type
  if (!CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
    return { 
      isValid: false, 
      error: 'Invalid file type. Please upload a PDF, PPTX, or DOCX file.' 
    };
  }

  // Check file size
  const maxSizeBytes = CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return { 
      isValid: false, 
      error: `File size exceeds ${CONFIG.MAX_FILE_SIZE_MB}MB limit.` 
    };
  }

  // Basic file name validation
  if (file.name.length > 255) {
    return { 
      isValid: false, 
      error: 'File name is too long.' 
    };
  }

  return { isValid: true, error: null };
};

/**
 * Get file type name for user-friendly messages
 * @param {string} mimeType - File MIME type
 * @returns {string} - User-friendly file type name
 */
const getFileTypeName = (mimeType) => {
  switch (mimeType) {
    case 'application/pdf':
      return 'PDF';
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return 'PPTX';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'DOCX';
    default:
      return 'file';
  }
};

/**
 * Get file type specific troubleshooting tips
 * @param {string} mimeType - File MIME type
 * @returns {string} - Troubleshooting guidance
 */
const getFileTypeTips = (mimeType) => {
  switch (mimeType) {
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return '\n\nTips for PowerPoint files:\n- Ensure slides contain actual text (not just images)\n- Check that text boxes are not empty\n- Verify the file is not corrupted by opening it in PowerPoint\n- Try exporting as a new PPTX file';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return '\n\nTips for Word documents:\n- Ensure document contains actual text (not just images/tables)\n- Check that the file is not password-protected\n- Verify the file is not corrupted by opening it in Word\n- Try saving as a new DOCX file (not .doc)';
    case 'application/pdf':
      return '\n\nTips for PDF files:\n- Ensure the PDF contains selectable text (not scanned images)\n- Check that the file is not password-protected\n- Try using a text-based PDF instead of an image-based PDF';
    default:
      return '';
  }
};

/**
 * Extract text from uploaded file using Supabase Edge Function
 * Uses reliable fetch-based approach for consistent file upload handling
 * @param {File} file - The file to process
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} - Extracted text and metadata
 */
export const extractTextFromFile = async (file, onProgress) => {
  const validation = validateFile(file);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const fileTypeName = getFileTypeName(file.type);
  ErrorLogger.info('Starting file extraction', { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name, fileType: fileTypeName, fileSize: file.size });

  onProgress(10, `Reading ${fileTypeName} file...`);

  onProgress(20, `Uploading ${fileTypeName} file for text extraction...`);

  try {
    // Get active session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const error = new Error('No active session. Please log in again.');
      ErrorLogger.error(error, { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name });
      throw error;
    }
    ErrorLogger.debug('Active session verified', { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name });

    // Create FormData to send file to Edge Function
    const formData = new FormData();
    formData.append('file', file);

    onProgress(40, `Extracting text from ${fileTypeName}...`);

    // Use direct fetch approach (same as quiz generation) for reliable file upload
    const extractStartTime = Date.now();
    const extractResponse = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-text`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      }
    );
    const extractDuration = Date.now() - extractStartTime;
    ErrorLogger.debug(`Extract-text function responded in ${(extractDuration / 1000).toFixed(2)}s`, { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name, duration: extractDuration });

    if (!extractResponse.ok) {
      let errorData = {};
      let errorText = '';
      
      try {
        errorText = await extractResponse.text();
        if (errorText) {
          errorData = JSON.parse(errorText);
        }
      } catch (parseErr) {
        ErrorLogger.warn('Failed to parse error response', { 
          component: 'fileProcessor', 
          action: 'extractTextFromFile', 
          fileName: file.name,
          parseError: parseErr,
          rawErrorText: errorText?.substring(0, 500)
        });
        errorData = { error: errorText || extractResponse.statusText };
      }

      let userFriendlyError = errorData.error || `Text extraction failed: ${extractResponse.statusText} (Status: ${extractResponse.status})`;

      // Add file type specific tips to error message
      userFriendlyError += getFileTypeTips(file.type);

      const error = new Error(userFriendlyError);
      ErrorLogger.error(error, { 
        component: 'fileProcessor', 
        action: 'extractTextFromFile', 
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        status: extractResponse.status,
        statusText: extractResponse.statusText,
        errorData,
        rawErrorText: errorText?.substring(0, 500)
      });
      throw error;
    }

    ErrorLogger.debug('Extract-text succeeded, parsing response', { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name });
    
    let data;
    try {
      const responseText = await extractResponse.text();
      ErrorLogger.debug('Raw response received', { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name, responseLength: responseText.length });
      
      if (!responseText || responseText.trim().length === 0) {
        throw new Error('Empty response from extract-text function');
      }
      
      data = JSON.parse(responseText);
      ErrorLogger.debug('Response parsed successfully', { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name, hasText: !!data?.text });
    } catch (parseError) {
      const err = parseError instanceof Error ? parseError : new Error(String(parseError));
      ErrorLogger.error(err, { 
        component: 'fileProcessor', 
        action: 'extractTextFromFile', 
        fileName: file.name,
        step: 'parseResponse',
        status: extractResponse.status,
        statusText: extractResponse.statusText
      });
      throw new Error(`Failed to parse response from text extraction service: ${err.message}`);
    }
    
    ErrorLogger.info('Extraction results', { 
      component: 'fileProcessor', 
      action: 'extractTextFromFile', 
      fileName: file.name,
      textLength: data?.text?.length || 0,
      pageCount: data?.pageCount || 'unknown',
      extractionMethod: data?.extractionMethod || 'unknown',
      hasText: !!data?.text,
      hasError: !!data?.error
    });

    if (!data) {
      const error = new Error('Invalid response from text extraction service - no data received');
      ErrorLogger.error(error, { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name, responseData: data });
      throw error;
    }

    if (data.error) {
      const error = new Error(data.error || 'Text extraction service returned an error');
      ErrorLogger.error(error, { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name, errorDetails: data });
      throw error;
    }

    // Validate data structure before accessing properties
    if (!data.text || typeof data.text !== 'string') {
      const error = new Error(data?.error || 'No text could be extracted from the file. The file may be corrupted, password-protected, or contain only images.');
      ErrorLogger.error(error, { 
        component: 'fileProcessor', 
        action: 'extractTextFromFile', 
        fileName: file.name,
        responseData: data,
        textType: typeof data.text,
        textLength: data.text?.length,
        hasPageCount: 'pageCount' in data,
        pageCountType: typeof data.pageCount,
        pageCountValue: data.pageCount
      });
      throw error;
    }

    // Ensure text is a valid string before proceeding
    if (typeof data.text.length === 'undefined') {
      const error = new Error('Extracted text is invalid - length property is undefined');
      ErrorLogger.error(error, { 
        component: 'fileProcessor', 
        action: 'extractTextFromFile', 
        fileName: file.name,
        textType: typeof data.text,
        textValue: String(data.text).substring(0, 100)
      });
      throw error;
    }

    onProgress(60, 'Processing extracted text...');

    // Validate the extracted text
    if (data.text.trim().length < 30) {
      const wordCount = data.text.trim().split(/\s+/).filter(w => w.length > 0).length;
      console.warn(`⚠️ [FILE-PROCESSOR] Insufficient text extracted: ${data.text.length} chars, ${wordCount} words`);
      throw new Error(
        `Insufficient text content found in the ${fileTypeName} file. ` +
        `The document may be corrupted or contain no readable text.` +
        getFileTypeTips(file.type)
      );
    }

    // Check page limit (ensure pageCount is a valid number)
    const pageCount = typeof data.pageCount === 'number' ? data.pageCount : (data.pageCount ? parseInt(data.pageCount, 10) : 1);
    if (isNaN(pageCount)) {
      ErrorLogger.warn('Invalid pageCount, defaulting to 1', { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name, pageCount: data.pageCount });
    }
    const validPageCount = isNaN(pageCount) ? 1 : pageCount;
    
    if (validPageCount > CONFIG.MAX_SLIDES_PER_UPLOAD) {
      throw new Error(
        `Document exceeds ${CONFIG.MAX_SLIDES_PER_UPLOAD} page limit. ` +
        `Current document has ${validPageCount} pages.`
      );
    }

    const wordCount = data.text.split(/\s+/).filter(w => w.length > 0).length;
    ErrorLogger.info('Text extraction complete', { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name, wordCount, textLength: data.text.length });
    ErrorLogger.info('Text extraction validated', { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name });

    onProgress(80, 'Text extraction successful');

    onProgress(100, `${fileTypeName} processing complete`);

    return {
      text: data.text,
      pageCount: validPageCount,
      fileType: data.fileType || file.type,
      fileName: data.fileName || file.name,
      fileSize: data.fileSize || file.size,
      extractionMethod: data.extractionMethod || 'unknown'
    };

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name });

    // Provide more specific error messages
    if (err.message?.includes('Function not found')) {
      throw new Error('Text extraction service is not available. Please contact support.');
    } else if (err.message?.includes('timeout')) {
      throw new Error(`${fileTypeName} file processing timed out. Please try with a smaller file.`);
    } else if (err.message?.includes('No active session')) {
      throw new Error(err.message);
    }

    // If error already has helpful tips, pass it through
    if (err.message?.includes('Tips for')) {
      throw err;
    }

    throw new Error(`Failed to extract text from ${fileTypeName}: ${err.message}`);
  }
};

/**
 * Get the appropriate extraction method for file type
 * @param {string} mimeType - File MIME type
 * @returns {string} - Extraction method name
 */
const getExtractionMethod = (mimeType) => {
  switch (mimeType) {
    case 'application/pdf':
      return 'PDF text extraction';
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return 'PPTX slide extraction';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'DOCX document extraction';
    default:
      return 'Unknown extraction method';
  }
};

/**
 * Generate mock extracted text based on file type
 * Replace this with actual text extraction in production
 * @param {File} file - The uploaded file
 * @returns {Promise<string>} - Mock extracted text
 */
const generateMockExtractedText = async (file) => {
  const baseContent = `
This is a comprehensive document about advanced concepts in modern technology and innovation.

Introduction
The landscape of technology has evolved dramatically over the past decade, with artificial intelligence, machine learning, and automation becoming integral parts of our daily lives. This transformation has created new opportunities and challenges across various industries.

Key Concepts
1. Digital Transformation
Digital transformation represents the integration of digital technology into all areas of business, fundamentally changing how organizations operate and deliver value to customers. It requires a cultural change that challenges organizations to continually experiment and adapt to failure.

2. Artificial Intelligence and Machine Learning
Artificial Intelligence (AI) refers to the simulation of human intelligence processes by machines, especially computer systems. Machine Learning (ML) is a subset of AI that enables systems to automatically learn and improve from experience without being explicitly programmed.

3. Cloud Computing Architecture
Cloud computing provides on-demand access to computing resources over the internet. The three main service models are Infrastructure as a Service (IaaS), Platform as a Service (PaaS), and Software as a Service (SaaS).

4. Data Analytics and Insights
Data analytics involves the process of examining datasets to draw conclusions about the information they contain. Advanced analytics techniques include predictive modeling, statistical analysis, and data mining.

Applications and Use Cases
Modern technology applications span across healthcare, finance, education, transportation, and entertainment. Each sector has unique requirements and challenges that drive innovation and adoption of new technologies.

Healthcare Technology
In healthcare, technology has revolutionized patient care through electronic health records, telemedicine, and AI-powered diagnostic tools. These innovations have improved patient outcomes and operational efficiency.

Financial Technology (FinTech)
The financial sector has embraced digital transformation through mobile banking, cryptocurrency, blockchain technology, and robo-advisors. These innovations have democratized access to financial services.

Educational Technology (EdTech)
Education technology has transformed learning through online platforms, virtual reality, and personalized learning systems. These tools have made education more accessible and engaging.

Future Trends and Innovations
Emerging technologies such as quantum computing, 5G networks, Internet of Things (IoT), and augmented reality are set to further transform our world. These technologies will create new possibilities and business models.

Challenges and Considerations
With rapid technological advancement comes challenges including cybersecurity threats, privacy concerns, ethical considerations in AI development, and the need for digital literacy.

Implementation Strategies
Successful technology implementation requires careful planning, stakeholder engagement, change management, and continuous monitoring and optimization.

Best Practices
Organizations should focus on user-centric design, iterative development, cross-functional collaboration, and data-driven decision making when implementing new technologies.

Conclusion
The future of technology holds immense promise, but realizing its benefits requires thoughtful implementation, ethical considerations, and continuous learning and adaptation.

This comprehensive overview provides a foundation for understanding the complex landscape of modern technology and its applications across various sectors.
`;

  // Simulate different document lengths based on file size
  const multiplier = Math.max(1, Math.floor(file.size / (1024 * 1024))); // Rough multiplier based on MB
  let fullContent = baseContent;
  
  for (let i = 1; i < multiplier; i++) {
    fullContent += `\n\nSection ${i + 1}: Additional Content\n${baseContent.substring(0, 1000)}...`;
  }

  return fullContent.trim();
};

/**
 * Clean up file resources after processing
 * @param {File} file - The processed file
 */
export const cleanupFile = (file) => {
  // In a real implementation, this might clear file references,
  // cancel ongoing operations, or clean up temporary resources
  ErrorLogger.debug('Cleaned up file resources', { component: 'fileProcessor', action: 'cleanupFile', fileName: file.name });
};

/**
 * Get file type icon based on MIME type
 * @param {string} mimeType - File MIME type
 * @returns {string} - Icon name for UI
 */
export const getFileTypeIcon = (mimeType) => {
  switch (mimeType) {
    case 'application/pdf':
      return 'file-type-pdf';
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return 'file-type-ppt';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'file-type-doc';
    default:
      return 'file-text';
  }
};

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted size string
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};