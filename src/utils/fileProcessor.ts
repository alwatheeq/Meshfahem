import { CONFIG } from './config';
import { supabase } from '../lib/supabase';
import { ErrorLogger } from './errorLogger';

export type ProgressCallback = (progress: number, message: string) => void;

export interface ExtractionResult {
  text: string;
  pageCount: number;
  fileType: string;
  fileName: string;
  fileSize: number;
  extractionMethod: string;
}

export interface OCRResult extends ExtractionResult {
  confidence?: number;
  language?: string;
  wordCount?: number;
}

export const validateFile = (file: File, mode: 'file' | 'ocr' = 'file'): { isValid: boolean; error: string | null } => {
  if (!file) {
    return { isValid: false, error: 'No file selected' };
  }

  if (mode === 'ocr') {
    const allowedImageTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/bmp',
      'image/tiff',
      'image/gif',
    ];

    if (!allowedImageTypes.includes(file.type)) {
      return { 
        isValid: false, 
        error: 'Invalid file type for OCR. Please upload an image (JPG, PNG, BMP, TIFF, GIF).' 
      };
    }

    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return { 
        isValid: false, 
        error: 'File size exceeds 10MB limit for images.' 
      };
    }

    if (file.name.length > 255) {
      return { 
        isValid: false, 
        error: 'File name is too long.' 
      };
    }

    return { isValid: true, error: null };
  }

  if (!CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
    return { 
      isValid: false, 
      error: 'Invalid file type. Please upload a PDF, PPTX, or DOCX file.' 
    };
  }

  const maxSizeBytes = CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return { 
      isValid: false, 
      error: `File size exceeds ${CONFIG.MAX_FILE_SIZE_MB}MB limit.` 
    };
  }

  if (file.name.length > 255) {
    return { 
      isValid: false, 
      error: 'File name is too long.' 
    };
  }

  return { isValid: true, error: null };
};

const getFileTypeName = (mimeType: string): string => {
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

const getImageTypeName = (mimeType: string): string => {
  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'JPG';
    case 'image/png':
      return 'PNG';
    case 'image/bmp':
      return 'BMP';
    case 'image/tiff':
      return 'TIFF';
    case 'image/gif':
      return 'GIF';
    default:
      return 'image';
  }
};

const getFileTypeTips = (mimeType: string): string => {
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

export const extractTextFromFile = async (file: File, onProgress: ProgressCallback): Promise<ExtractionResult> => {
  const validation = validateFile(file);
  if (!validation.isValid) {
    throw new Error(validation.error!);
  }

  const fileTypeName = getFileTypeName(file.type);
  ErrorLogger.info('Starting file extraction', { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name, fileType: fileTypeName, fileSize: file.size });

  onProgress(10, `Reading ${fileTypeName} file...`);

  onProgress(20, `Uploading ${fileTypeName} file for text extraction...`);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const error = new Error('No active session. Please log in again.');
      ErrorLogger.error(error, { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name });
      throw error;
    }
    ErrorLogger.debug('Active session verified', { component: 'fileProcessor', action: 'extractTextFromFile', fileName: file.name });

    const formData = new FormData();
    formData.append('file', file);

    onProgress(40, `Extracting text from ${fileTypeName}...`);

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
      let errorData: Record<string, any> = {};
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
    
    let data: Record<string, any>;
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

    if (data.text.trim().length < 30) {
      const wordCount = data.text.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
      console.warn(`⚠️ [FILE-PROCESSOR] Insufficient text extracted: ${data.text.length} chars, ${wordCount} words`);
      throw new Error(
        `Insufficient text content found in the ${fileTypeName} file. ` +
        `The document may be corrupted or contain no readable text.` +
        getFileTypeTips(file.type)
      );
    }

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

    const wordCount = data.text.split(/\s+/).filter((w: string) => w.length > 0).length;
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

    if (err.message?.includes('Function not found')) {
      throw new Error('Text extraction service is not available. Please contact support.');
    } else if (err.message?.includes('timeout')) {
      throw new Error(`${fileTypeName} file processing timed out. Please try with a smaller file.`);
    } else if (err.message?.includes('No active session')) {
      throw new Error(err.message);
    }

    if (err.message?.includes('Tips for')) {
      throw err;
    }

    throw new Error(`Failed to extract text from ${fileTypeName}: ${err.message}`);
  }
};

export const extractTextFromImage = async (file: File, onProgress: ProgressCallback): Promise<OCRResult> => {
  const validation = validateFile(file, 'ocr');
  if (!validation.isValid) {
    throw new Error(validation.error!);
  }

  const imageTypeName = getImageTypeName(file.type);
  ErrorLogger.info('Starting OCR extraction', { 
    component: 'fileProcessor', 
    action: 'extractTextFromImage', 
    fileName: file.name, 
    fileType: imageTypeName, 
    fileSize: file.size 
  });

  onProgress(10, `Preparing ${imageTypeName} for OCR...`);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const error = new Error('No active session. Please log in again.');
      ErrorLogger.error(error, { component: 'fileProcessor', action: 'extractTextFromImage', fileName: file.name });
      throw error;
    }
    ErrorLogger.debug('Active session verified', { component: 'fileProcessor', action: 'extractTextFromImage', fileName: file.name });

    const formData = new FormData();
    formData.append('file', file);

    onProgress(30, `Sending ${imageTypeName} for OCR processing...`);

    const ocrStartTime = Date.now();
    const ocrResponse = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-scan`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      }
    );
    const ocrDuration = Date.now() - ocrStartTime;
    ErrorLogger.debug(`OCR function responded in ${(ocrDuration / 1000).toFixed(2)}s`, { 
      component: 'fileProcessor', 
      action: 'extractTextFromImage', 
      fileName: file.name, 
      duration: ocrDuration 
    });

    if (!ocrResponse.ok) {
      let errorData: Record<string, any> = {};
      let errorText = '';
      try {
        errorText = await ocrResponse.text();
        if (errorText) {
          errorData = JSON.parse(errorText);
        }
      } catch (parseErr) {
        ErrorLogger.warn('Failed to parse error response', { 
          component: 'fileProcessor', 
          action: 'extractTextFromImage', 
          fileName: file.name,
          parseError: parseErr,
          rawErrorText: errorText?.substring(0, 500)
        });
        errorData = { error: errorText || ocrResponse.statusText };
      }

      const errorMessage = errorData.error || `OCR processing failed: ${ocrResponse.statusText} (Status: ${ocrResponse.status})`;
      const error = new Error(errorMessage);
      ErrorLogger.error(error, { 
        component: 'fileProcessor', 
        action: 'extractTextFromImage', 
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        status: ocrResponse.status,
        statusText: ocrResponse.statusText,
        errorData,
        rawErrorText: errorText?.substring(0, 500)
      });
      throw error;
    }

    ErrorLogger.debug('OCR function succeeded, parsing response', { component: 'fileProcessor', action: 'extractTextFromImage', fileName: file.name });
    
    let data: Record<string, any>;
    try {
      const responseText = await ocrResponse.text();
      ErrorLogger.debug('Raw OCR response received', { component: 'fileProcessor', action: 'extractTextFromImage', fileName: file.name, responseLength: responseText.length });
      
      if (!responseText || responseText.trim().length === 0) {
        throw new Error('Empty response from OCR function');
      }
      
      data = JSON.parse(responseText);
      ErrorLogger.debug('OCR response parsed successfully', { component: 'fileProcessor', action: 'extractTextFromImage', fileName: file.name, hasText: !!data?.text });
    } catch (parseError) {
      const err = parseError instanceof Error ? parseError : new Error(String(parseError));
      ErrorLogger.error(err, { 
        component: 'fileProcessor', 
        action: 'extractTextFromImage', 
        fileName: file.name,
        step: 'parseResponse',
        status: ocrResponse.status,
        statusText: ocrResponse.statusText
      });
      throw new Error(`Failed to parse response from OCR service: ${err.message}`);
    }
    
    ErrorLogger.info('OCR results', { 
      component: 'fileProcessor', 
      action: 'extractTextFromImage', 
      fileName: file.name,
      textLength: data?.text?.length || 0,
      confidence: data?.confidence,
      language: data?.language,
      hasText: !!data?.text,
      hasError: !!data?.error
    });

    if (!data) {
      const error = new Error('Invalid response from OCR service - no data received');
      ErrorLogger.error(error, { component: 'fileProcessor', action: 'extractTextFromImage', fileName: file.name, responseData: data });
      throw error;
    }

    if (data.error) {
      const error = new Error(data.error || 'OCR service returned an error');
      ErrorLogger.error(error, { component: 'fileProcessor', action: 'extractTextFromImage', fileName: file.name, errorDetails: data });
      throw error;
    }

    if (!data.text || typeof data.text !== 'string') {
      const error = new Error(data?.error || 'No text could be extracted from the image. The image may be too blurry, contain no text, or be in an unsupported language.');
      ErrorLogger.error(error, { 
        component: 'fileProcessor', 
        action: 'extractTextFromImage', 
        fileName: file.name,
        responseData: data,
        textType: typeof data.text,
        textLength: data.text?.length
      });
      throw error;
    }

    onProgress(90, 'Processing OCR results...');

    if (data.text.trim().length < 10) {
      const wordCount = data.text.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
      console.warn(`⚠️ [FILE-PROCESSOR] Insufficient text extracted from image: ${data.text.length} chars, ${wordCount} words`);
      throw new Error(
        `Insufficient text content found in the ${imageTypeName} image. ` +
        `The image may be too blurry, contain no readable text, or be in an unsupported language.`
      );
    }

    const wordCount = data.text.split(/\s+/).filter((w: string) => w.length > 0).length;
    ErrorLogger.info('OCR extraction complete', { component: 'fileProcessor', action: 'extractTextFromImage', fileName: file.name, wordCount, textLength: data.text.length });

    onProgress(100, 'OCR extraction complete');

    return {
      text: data.text,
      pageCount: data.pageCount || 1,
      fileType: data.fileType || file.type,
      fileName: data.fileName || file.name,
      fileSize: data.fileSize || file.size,
      extractionMethod: data.extractionMethod || 'OCR',
      confidence: data.confidence,
      language: data.language,
      wordCount: data.wordCount || wordCount,
    };

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, { component: 'fileProcessor', action: 'extractTextFromImage', fileName: file.name });

    if (err.message?.includes('Function not found')) {
      throw new Error('OCR service is not available. Please contact support.');
    } else if (err.message?.includes('timeout')) {
      throw new Error(`${imageTypeName} image processing timed out. Please try with a smaller image.`);
    } else if (err.message?.includes('No active session')) {
      throw new Error(err.message);
    } else if (err.message?.includes('credentials not configured')) {
      throw new Error('OCR service is not configured. Please contact support.');
    }

    throw new Error(`Failed to extract text from ${imageTypeName} image: ${err.message}`);
  }
};

export const cleanupFile = (file: File): void => {
  ErrorLogger.debug('Cleaned up file resources', { component: 'fileProcessor', action: 'cleanupFile', fileName: file.name });
};

export const getFileTypeIcon = (mimeType: string): string => {
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

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
