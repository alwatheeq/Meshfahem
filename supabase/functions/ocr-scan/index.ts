/// <reference path="../_shared/deno.d.ts" />
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse } from '../_shared/response.ts';
import { validateMethod } from '../_shared/validation.ts';

interface OCRResult {
  text: string;
  confidence?: number;
  language?: string;
}

/**
 * Call Azure Computer Vision OCR API
 */
async function callAzureOCR(imageBuffer: ArrayBuffer): Promise<OCRResult> {
  const endpoint = Deno.env.get('AZURE_VISION_ENDPOINT');
  const apiKey = Deno.env.get('AZURE_VISION_KEY');

  if (!endpoint || !apiKey) {
    throw new Error('Azure Vision credentials not configured');
  }

  // Azure Computer Vision OCR endpoint
  // Remove trailing slash if present
  const cleanEndpoint = endpoint.replace(/\/$/, '');
  const ocrUrl = `${cleanEndpoint}/vision/v3.2/ocr?language=auto&detectOrientation=true`;

  console.log('🔍 Calling Azure OCR API...');
  const response = await fetch(ocrUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/octet-stream',
    },
    body: imageBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Azure OCR API error:', response.status, errorText);
    throw new Error(`Azure OCR failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('✅ Azure OCR API response received');
  
  // Extract text from Azure OCR response
  let extractedText = '';
  let totalConfidence = 0;
  let regionCount = 0;

  if (result.regions && Array.isArray(result.regions)) {
    for (const region of result.regions) {
      if (region.lines && Array.isArray(region.lines)) {
        for (const line of region.lines) {
          if (line.words && Array.isArray(line.words)) {
            const lineText = line.words
              .map((word: { text?: string }) => word.text ?? '')
              .join(' ');
            extractedText += lineText + '\n';
            
            // Calculate average confidence
            const wordConfidences = line.words
              .map((w: { confidence?: string }) => parseFloat(w.confidence || '0'))
              .filter((c: number) => !isNaN(c));
            if (wordConfidences.length > 0) {
              const avgConfidence = wordConfidences.reduce((a, b) => a + b, 0) / wordConfidences.length;
              totalConfidence += avgConfidence;
              regionCount++;
            }
          }
        }
      }
    }
  }

  const avgConfidence = regionCount > 0 ? totalConfidence / regionCount : 0;

  return {
    text: extractedText.trim(),
    confidence: avgConfidence,
    language: result.language || 'unknown',
  };
}

Deno.serve(async (req) => {
  console.log('🚀 OCR Edge Function started, method:', req.method);

  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const methodError = validateMethod(req, ['POST']);
  if (methodError) {
    return methodError;
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return jsonResponse({ error: 'Expected multipart/form-data' }, 400);
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return jsonResponse({ error: 'No file provided' }, 400);
    }

    // Supported image types
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/bmp',
      'image/tiff',
      'image/gif',
    ];

    if (!allowedTypes.includes(file.type)) {
      return errorResponse(
        'Unsupported file type. Please upload an image (JPG, PNG, BMP, TIFF, GIF).',
        400
      );
    }

    const maxSize = 10 * 1024 * 1024; // 10MB for images
    if (file.size > maxSize) {
      return errorResponse('File too large. Maximum size is 10MB for images.', 400);
    }

    const fileBuffer = await file.arrayBuffer();
    console.log('📊 File received:', file.name, file.type, fileBuffer.byteLength, 'bytes');

    // Process image with OCR
    console.log('🔍 Starting OCR processing...');
    const ocrResult = await callAzureOCR(fileBuffer);
    
    console.log('✅ OCR completed:', {
      textLength: ocrResult.text.length,
      confidence: ocrResult.confidence,
      language: ocrResult.language,
    });

    if (!ocrResult.text || ocrResult.text.trim().length < 10) {
      return errorResponse(
        'Unable to extract meaningful text from the image. The image may be too blurry, contain no text, or be in an unsupported language.',
        400
      );
    }

    const wordCount = ocrResult.text.trim().split(/\s+/).filter(w => w.length > 0).length;

    return jsonResponse({
      text: ocrResult.text,
      pageCount: 1, // Images are single page
      fileType: file.type,
      fileName: file.name,
      fileSize: file.size,
      extractionMethod: 'Azure Computer Vision OCR',
      confidence: ocrResult.confidence,
      language: ocrResult.language,
      wordCount,
      metadata: {
        ocrProvider: 'Azure Computer Vision',
        confidence: ocrResult.confidence,
        language: ocrResult.language,
      },
    });

  } catch (error) {
    console.error('💥 OCR Edge Function error:', error);
    
    let errorMessage = 'Failed to process image with OCR';
    if (error instanceof Error) {
      errorMessage = error.message;
      
      if (error.message.includes('credentials not configured')) {
        errorMessage = 'OCR service not configured. Please contact support.';
      } else if (error.message.includes('Azure OCR failed')) {
        errorMessage = 'OCR processing failed. The image may be corrupted or unsupported.';
      }
    }
    
    return errorResponse(errorMessage, 500);
  }
});

