import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse } from '../_shared/response.ts';
import { validateMethod } from '../_shared/validation.ts';

async function extractTextFromPDF(fileBuffer: ArrayBuffer): Promise<string> {
  try {
    console.log('📄 [PDF] Starting PDF text extraction...');
    console.log('📊 [PDF] File buffer size:', fileBuffer.byteLength, 'bytes');
    
    if (!fileBuffer || fileBuffer.byteLength === 0) {
      console.error('❌ [PDF] Invalid or empty file buffer');
      throw new Error('PDF file buffer is empty or invalid');
    }
    
    console.log('📚 [PDF] Importing pdf-parse library...');
    const pdfParse = await import('npm:pdf-parse@1.1.1');
    console.log('✅ [PDF] pdf-parse library loaded successfully');
    
    console.log('🔄 [PDF] Starting PDF parsing...');
    const result = await pdfParse.default(fileBuffer);
    console.log('✅ [PDF] PDF parsing completed');
    console.log('📊 [PDF] Pages:', result.numpages, 'Text length:', result.text?.length || 0);
    
    let extractedText = result.text || '';
    
    if (!extractedText || extractedText.trim().length === 0) {
      console.error('❌ [PDF] No text extracted from PDF');
      console.error('❌ [PDF] PDF may be image-based (scanned) or contain no readable text');
      throw new Error('No readable text found in PDF file. The PDF may be image-based (scanned) or contain only images. Please use a text-based PDF or OCR the document first.');
    }
    
    // Clean and validate the extracted text
    extractedText = cleanExtractedText(extractedText);
    
    if (extractedText.length === 0) {
      console.error('❌ [PDF] Text is empty after cleaning');
      throw new Error('No readable text found in PDF file after processing.');
    }
    
    // Assess text quality
    const quality = assessTextQuality(extractedText);
    console.log('📊 [PDF] Text quality assessment:');
    console.log('  - Quality score:', quality.score, '/100');
    console.log('  - Word count:', quality.wordCount);
    console.log('  - Sentence count:', quality.sentenceCount);
    
    if (quality.warnings.length > 0) {
      console.warn('⚠️ [PDF] Quality warnings:');
      quality.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
    
    if (quality.score < 40) {
      throw new Error(`Text quality is too low (score: ${quality.score}/100). The PDF may not contain sufficient readable content. ${quality.warnings.join(' ')}`);
    }
    
    console.log('✅ [PDF] PDF extraction complete and validated');
    return extractedText;
    
  } catch (error) {
    console.error('💥 [PDF] PDF extraction failed');
    console.error('❌ [PDF] Error name:', error instanceof Error ? error.name : 'Unknown');
    console.error('❌ [PDF] Error message:', error instanceof Error ? error.message : String(error));
    console.error('❌ [PDF] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    if (error instanceof Error) {
      if (error.message.includes('password')) {
        throw new Error('PDF file is password protected. Please remove password protection and try again.');
      } else if (error.message.includes('corrupt') || error.message.includes('invalid')) {
        throw new Error('PDF file appears to be corrupted. Please try opening and re-saving the file.');
      } else if (error.message.includes('image-based') || error.message.includes('scanned')) {
        throw error; // Keep the specific error message
      }
    }
    
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function extractTextFromDOCX(fileBuffer: ArrayBuffer): Promise<string> {
  console.log('📝 [DOCX] Starting DOCX text extraction...');
  console.log('📊 [DOCX] File buffer size:', fileBuffer.byteLength, 'bytes');

  try {
    console.log('📚 [DOCX] Importing mammoth library...');
    const mammoth = await import('npm:mammoth@1.6.0');
    console.log('✅ [DOCX] mammoth library loaded successfully');

    if (!fileBuffer || fileBuffer.byteLength === 0) {
      console.error('❌ [DOCX] Invalid or empty file buffer');
      throw new Error('DOCX file buffer is empty or invalid');
    }

    console.log('🔄 [DOCX] Starting mammoth extraction...');
    const result = await mammoth.extractRawText({ arrayBuffer: fileBuffer });
    console.log('✅ [DOCX] mammoth extraction completed');

    if (!result) {
      console.error('❌ [DOCX] mammoth returned null/undefined result');
      throw new Error('DOCX extraction returned no result');
    }

    let extractedText = result.value || '';
    console.log('📊 [DOCX] Extracted text length:', extractedText.length, 'characters');

    if (extractedText.trim().length === 0) {
      console.warn('⚠️ [DOCX] Extracted text is empty after trimming');
      console.warn('⚠️ [DOCX] Document may contain only images, tables without text, or be corrupted');
      throw new Error('No readable text found in DOCX file. The document may contain only images or be corrupted.');
    }

    const wordCount = extractedText.trim().split(/\s+/).length;
    const lineCount = extractedText.split('\n').length;
    console.log('📊 [DOCX] Statistics - Words:', wordCount, 'Lines:', lineCount);

    if (result.messages && result.messages.length > 0) {
      console.log('📋 [DOCX] mammoth messages:', result.messages.length);
      result.messages.forEach((msg: any, idx: number) => {
        console.log(`  ${idx + 1}. ${msg.type}: ${msg.message}`);
      });
    }

    // Clean and validate the extracted text
    extractedText = cleanExtractedText(extractedText);

    if (extractedText.length === 0) {
      console.error('❌ [DOCX] Text is empty after cleaning');
      throw new Error('No readable text found in DOCX file after processing.');
    }

    // Assess text quality
    const quality = assessTextQuality(extractedText);
    console.log('📊 [DOCX] Text quality assessment:');
    console.log('  - Quality score:', quality.score, '/100');
    console.log('  - Word count:', quality.wordCount);
    console.log('  - Sentence count:', quality.sentenceCount);
    console.log('  - Avg words per sentence:', quality.avgWordsPerSentence);
    console.log('  - Unique words:', quality.uniqueWords);

    if (quality.warnings.length > 0) {
      console.warn('⚠️ [DOCX] Quality warnings:');
      quality.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }

    if (quality.score < 40) {
      throw new Error(`Text quality is too low (score: ${quality.score}/100). The document may not contain sufficient readable content for quiz generation. ${quality.warnings.join(' ')}`);
    }

    console.log('✅ [DOCX] DOCX extraction complete and validated');
    return extractedText;

  } catch (error) {
    console.error('💥 [DOCX] DOCX extraction failed');
    console.error('❌ [DOCX] Error name:', error.name);
    console.error('❌ [DOCX] Error message:', error.message);
    console.error('❌ [DOCX] Error stack:', error.stack);

    if (error.message?.includes('password')) {
      throw new Error('DOCX file is password protected. Please remove password protection and try again.');
    } else if (error.message?.includes('corrupt')) {
      throw new Error('DOCX file appears to be corrupted. Please try opening and re-saving the file.');
    } else if (error.message?.includes('format')) {
      throw new Error('DOCX file format is not supported. Please ensure it is a valid .docx file (not .doc).');
    }

    throw new Error(`Failed to extract text from DOCX: ${error.message || 'Unknown error'}`);
  }
}

function cleanExtractedText(text: string): string {
  let cleaned = text;

  // Normalize unicode characters (smart quotes, dashes, etc.)
  cleaned = cleaned
    .replace(/[\u2018\u2019]/g, "'")  // Smart single quotes
    .replace(/[\u201C\u201D]/g, '"')  // Smart double quotes
    .replace(/[\u2013\u2014]/g, '-')  // En/em dashes
    .replace(/\u2026/g, '...')        // Ellipsis
    .replace(/[\u00A0]/g, ' ')        // Non-breaking space
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '- '); // Bullet points

  // Remove excessive whitespace
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  cleaned = cleaned.replace(/\n\s*\n\s*\n+/g, '\n\n');

  // Remove XML artifacts that sometimes slip through
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  cleaned = cleaned.replace(/&[a-z]+;/gi, '');

  return cleaned.trim();
}

function assessTextQuality(text: string): {
  score: number;
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  uniqueWords: number;
  warnings: string[];
} {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceCount = sentences.length;
  const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0;

  // Calculate unique words
  const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;
  const uniqueRatio = wordCount > 0 ? uniqueWords / wordCount : 0;

  const warnings: string[] = [];
  let score = 100;

  // Check for sufficient content
  if (wordCount < 50) {
    warnings.push(`Very low word count (${wordCount} words)`);
    score -= 30;
  } else if (wordCount < 100) {
    warnings.push(`Low word count (${wordCount} words)`);
    score -= 15;
  }

  // Check for sentence structure
  if (sentenceCount < 5) {
    warnings.push(`Very few sentences (${sentenceCount})`);
    score -= 20;
  }

  if (avgWordsPerSentence < 3) {
    warnings.push('Sentences are too short - may be just headings or fragments');
    score -= 15;
  } else if (avgWordsPerSentence > 50) {
    warnings.push('Sentences are unusually long - may contain extraction errors');
    score -= 10;
  }

  // Check for vocabulary diversity
  if (uniqueRatio < 0.3) {
    warnings.push('Low vocabulary diversity - text may be repetitive or contain extraction errors');
    score -= 15;
  }

  // Check for meaningful content patterns
  const shortWords = words.filter(w => w.length <= 2).length;
  const shortWordRatio = wordCount > 0 ? shortWords / wordCount : 0;
  if (shortWordRatio > 0.6) {
    warnings.push('Too many very short words - may indicate extraction problems');
    score -= 20;
  }

  return {
    score: Math.max(0, score),
    wordCount,
    sentenceCount,
    avgWordsPerSentence: parseFloat(avgWordsPerSentence.toFixed(1)),
    uniqueWords,
    warnings
  };
}

async function extractTextFromPPTX(fileBuffer: ArrayBuffer): Promise<string> {
  console.log('📊 [PPTX] Starting PPTX text extraction...');
  console.log('📊 [PPTX] File buffer size:', fileBuffer.byteLength, 'bytes');

  try {
    console.log('📚 [PPTX] Importing JSZip library...');
    const JSZip = await import('npm:jszip@3.10.1');
    console.log('✅ [PPTX] JSZip library loaded successfully');

    if (!fileBuffer || fileBuffer.byteLength === 0) {
      console.error('❌ [PPTX] Invalid or empty file buffer');
      throw new Error('PPTX file buffer is empty or invalid');
    }

    console.log('📦 [PPTX] Creating JSZip instance...');
    const zip = new JSZip.default();

    console.log('📦 [PPTX] Loading ZIP contents...');
    const contents = await zip.loadAsync(fileBuffer);
    console.log('✅ [PPTX] ZIP contents loaded successfully');

    const fileCount = Object.keys(contents.files).length;
    console.log('📊 [PPTX] Total files in ZIP:', fileCount);

    if (fileCount === 0) {
      console.error('❌ [PPTX] ZIP archive is empty');
      throw new Error('PPTX file appears to be empty or corrupted');
    }

    let extractedText = '';
    const slideFiles: string[] = [];
    const notesFiles: string[] = [];

    console.log('🔍 [PPTX] Scanning for slide and notes files...');
    Object.keys(contents.files).forEach(filename => {
      if (filename.match(/^ppt\/slides\/slide\d+\.xml$/)) {
        slideFiles.push(filename);
      } else if (filename.match(/^ppt\/notesSlides\/notesSlide\d+\.xml$/)) {
        notesFiles.push(filename);
      }
    });

    console.log('📊 [PPTX] Found slide files:', slideFiles.length);
    console.log('📊 [PPTX] Found notes files:', notesFiles.length);

    if (slideFiles.length === 0) {
      console.error('❌ [PPTX] No slide files found in presentation');
      throw new Error('No slides found in PPTX file. File may be corrupted.');
    }

    slideFiles.sort((a, b) => {
      const aNum = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] || '0');
      const bNum = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] || '0');
      return aNum - bNum;
    });

    console.log('🔄 [PPTX] Processing', slideFiles.length, 'slides in order...');
    let processedSlides = 0;
    let emptySlides = 0;
    let errorSlides = 0;

    for (const slideFile of slideFiles) {
      try {
        const slideNum = slideFile.match(/slide(\d+)\.xml$/)?.[1];
        console.log(`📄 [PPTX] Processing slide ${slideNum}:`, slideFile);

        const slideXml = await contents.files[slideFile].async('text');
        console.log(`📊 [PPTX] Slide ${slideNum} XML length:`, slideXml.length, 'characters');

        let slideText = '';

        const textPatterns = [
          /<a:t[^>]*>(.*?)<\/a:t>/g,
          /<a:t>(.*?)<\/a:t>/g,
          /<t[^>]*>(.*?)<\/t>/g
        ];

        for (const pattern of textPatterns) {
          const matches = slideXml.match(pattern);
          if (matches && matches.length > 0) {
            console.log(`✅ [PPTX] Slide ${slideNum} - Found ${matches.length} text matches with pattern`);
            const texts = matches
              .map(match => {
                let text = match.replace(/<[^>]*>/g, '');
                // Decode HTML entities
                text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
                text = text.replace(/&quot;/g, '"').replace(/&apos;/g, "'");
                text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
                text = text.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
                return text.trim();
              })
              .filter(text => text.length > 0);

            if (texts.length > 0) {
              slideText = texts.join(' ');
              console.log(`📊 [PPTX] Slide ${slideNum} - Extracted ${texts.length} text segments`);
              break;
            }
          }
        }

        if (slideText.trim().length > 0) {
          extractedText += `Slide ${slideNum}:\n${slideText}\n\n`;
          console.log(`✅ [PPTX] Slide ${slideNum} processed: ${slideText.length} characters`);
          processedSlides++;
        } else {
          console.warn(`⚠️ [PPTX] Slide ${slideNum} has no extractable text (may contain only images/charts)`);
          emptySlides++;
        }

      } catch (slideError) {
        errorSlides++;
        console.error(`💥 [PPTX] Error processing slide ${slideFile}:`, slideError.message);
        console.error(`❌ [PPTX] Slide error stack:`, slideError.stack);
      }
    }

    console.log('📊 [PPTX] Extraction statistics:');
    console.log('  ✅ Successfully processed slides:', processedSlides);
    console.log('  ⚠️ Empty slides (no text):', emptySlides);
    console.log('  ❌ Error slides:', errorSlides);
    console.log('  📏 Total extracted text length:', extractedText.trim().length, 'characters');

    if (notesFiles.length > 0) {
      console.log('📝 [PPTX] Attempting to extract speaker notes...');
      let notesExtracted = 0;

      for (const notesFile of notesFiles) {
        try {
          const notesXml = await contents.files[notesFile].async('text');
          const notesMatches = notesXml.match(/<a:t[^>]*>(.*?)<\/a:t>/g);

          if (notesMatches && notesMatches.length > 0) {
            const notesText = notesMatches
              .map(match => {
                let text = match.replace(/<[^>]*>/g, '');
                text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
                text = text.replace(/&quot;/g, '"').replace(/&apos;/g, "'");
                return text.trim();
              })
              .filter(text => text.length > 0)
              .join(' ');

            if (notesText.length > 0) {
              extractedText += `Notes: ${notesText}\n\n`;
              notesExtracted++;
            }
          }
        } catch (notesError) {
          console.warn('⚠️ [PPTX] Failed to extract notes from', notesFile);
        }
      }

      console.log('📝 [PPTX] Extracted notes from', notesExtracted, 'slides');
    }

    // Clean and validate the extracted text
    let finalText = cleanExtractedText(extractedText);

    if (finalText.length === 0) {
      console.error('❌ [PPTX] No text could be extracted from any slides');
      console.error('❌ [PPTX] The presentation may contain only images, charts, or be corrupted');
      throw new Error('No readable text found in PPTX slides. The presentation may contain only visual content.');
    }

    // Assess text quality
    const quality = assessTextQuality(finalText);
    console.log('📊 [PPTX] Text quality assessment:');
    console.log('  - Quality score:', quality.score, '/100');
    console.log('  - Word count:', quality.wordCount);
    console.log('  - Sentence count:', quality.sentenceCount);
    console.log('  - Avg words per sentence:', quality.avgWordsPerSentence);
    console.log('  - Unique words:', quality.uniqueWords);

    if (quality.warnings.length > 0) {
      console.warn('⚠️ [PPTX] Quality warnings:');
      quality.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }

    if (quality.score < 40) {
      throw new Error(`Text quality is too low (score: ${quality.score}/100). The presentation may not contain sufficient readable content for quiz generation. ${quality.warnings.join(' ')}`);
    }

    console.log('📊 [PPTX] Final statistics - Characters:', finalText.length, 'Words:', quality.wordCount);
    console.log('✅ [PPTX] PPTX extraction complete and validated');

    return finalText;

  } catch (error) {
    console.error('💥 [PPTX] PPTX extraction failed');
    console.error('❌ [PPTX] Error name:', error.name);
    console.error('❌ [PPTX] Error message:', error.message);
    console.error('❌ [PPTX] Error stack:', error.stack);

    if (error.message?.includes('password')) {
      throw new Error('PPTX file is password protected. Please remove password protection and try again.');
    } else if (error.message?.includes('corrupt') || error.message?.includes('invalid zip')) {
      throw new Error('PPTX file appears to be corrupted. Please try opening and re-saving the file.');
    } else if (error.message?.includes('format')) {
      throw new Error('PPTX file format is not supported. Please ensure it is a valid .pptx file (not .ppt).');
    }

    throw new Error(`Failed to extract text from PPTX: ${error.message || 'Unknown error'}`);
  }
}

Deno.serve(async (req) => {
  console.log('🚀 Edge Function started, method:', req.method);

  if (req.method === 'OPTIONS') {
    console.log('📤 Returning CORS preflight response');
    return handleCorsPreflight();
  }

  const methodError = validateMethod(req, ['POST']);
  if (methodError) {
    console.log('❌ Method not allowed:', req.method);
    return methodError;
  }

  try {
    console.log('📝 Processing POST request...');
    const contentType = req.headers.get('content-type') || '';
    console.log('📋 Content-Type:', contentType);
    
    if (!contentType.includes('multipart/form-data')) {
      console.log('❌ Invalid content type, expected multipart/form-data');
      return jsonResponse({ error: 'Expected multipart/form-data' }, 400);
    }

    console.log('📦 Parsing form data...');
    const formData = await req.formData();
    const file = formData.get('file') as File;
    console.log('📁 File received:', file ? `${file.name} (${file.size} bytes, ${file.type})` : 'null');
    
    if (!file) {
      console.log('❌ No file in form data');
      return jsonResponse({ error: 'No file provided' }, 400);
    }

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      console.log('❌ Unsupported file type:', file.type);
      return errorResponse(
        'Unsupported file type. Please upload PDF, PPTX, or DOCX files.',
        400
      );
    }

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      console.log('❌ File too large:', file.size, 'bytes');
      return errorResponse(
        'File too large. Maximum size is 50MB.',
        400
      );
    }

    console.log('✅ File validation passed, converting to ArrayBuffer...');
    const fileBuffer = await file.arrayBuffer();
    console.log('📊 ArrayBuffer created, size:', fileBuffer.byteLength, 'bytes');
    let extractedText = '';

    console.log('🔍 Starting text extraction for type:', file.type);
    switch (file.type) {
      case 'application/pdf':
        console.log('📄 Processing PDF...');
        extractedText = await extractTextFromPDF(fileBuffer);
        console.log('✅ PDF processing complete, text length:', extractedText.length);
        break;
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        console.log('📝 Processing DOCX...');
        extractedText = await extractTextFromDOCX(fileBuffer);
        console.log('✅ DOCX processing complete, text length:', extractedText.length);
        break;
      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        console.log('📊 Processing PPTX...');
        extractedText = await extractTextFromPPTX(fileBuffer);
        console.log('✅ PPTX processing complete, text length:', extractedText.length);
        break;
      default:
        console.log('❌ Unsupported file type in switch:', file.type);
        return errorResponse('Unsupported file type', 400);
    }

    console.log('🔍 Validating extracted text quality...');
    const trimmedText = extractedText.trim();
    console.log('📊 Validation - Trimmed text length:', trimmedText.length, 'characters');

    if (!extractedText || trimmedText.length < 10) {
      console.error('❌ Insufficient text extracted:', trimmedText.length, 'characters');
      return errorResponse(
        'Unable to extract meaningful text from the file. The document may be corrupted or contain no readable text.',
        400
      );
    }

    if (trimmedText.length < 300) {
      console.warn('⚠️ Extracted text is below recommended minimum for quiz generation (300 chars)');
      console.warn('⚠️ Current length:', trimmedText.length, '- Quiz generation may produce limited results');
    }

    const wordCount = trimmedText.split(/\s+/).filter(w => w.length > 0).length;
    const sentenceCount = trimmedText.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    console.log('📊 Text quality metrics:');
    console.log('  - Characters:', trimmedText.length);
    console.log('  - Words:', wordCount);
    console.log('  - Sentences (approx):', sentenceCount);
    console.log('  - Avg words per sentence:', sentenceCount > 0 ? (wordCount / sentenceCount).toFixed(1) : 'N/A');

    if (wordCount < 50) {
      console.warn('⚠️ Low word count detected - may not be sufficient for quality quiz generation');
    }

    console.log('✅ Text validation passed');

    const estimatedPages = Math.max(1, Math.ceil(extractedText.length / 2000));
    console.log('📊 Estimated pages:', estimatedPages);

    const maxPages = 400;
    if (estimatedPages > maxPages) {
      console.log('❌ Too many pages:', estimatedPages, 'max allowed:', maxPages);
      return errorResponse(
        `Document exceeds ${maxPages} page limit. Estimated pages: ${estimatedPages}`,
        400
      );
    }

    console.log('✅ Extraction successful, returning response');
    
    // Validate extracted text before returning
    if (!extractedText || typeof extractedText !== 'string' || extractedText.trim().length === 0) {
      console.error('❌ Extracted text validation failed before response');
      return errorResponse(
        'Text extraction completed but no readable text was found. The file may contain only images or be corrupted.',
        400
      );
    }
    
    const responseData = {
      text: extractedText,
      pageCount: estimatedPages,
      fileType: file.type,
      fileName: file.name,
      fileSize: file.size,
      extractionMethod: getExtractionMethod(file.type)
    };
    
    console.log('📊 Response data prepared:', {
      textLength: responseData.text.length,
      pageCount: responseData.pageCount,
      fileType: responseData.fileType,
      fileName: responseData.fileName,
      fileSize: responseData.fileSize
    });
    
    return jsonResponse(responseData);

  } catch (error) {
    console.error('💥 Edge Function error:', error);
    console.error('Error name:', error instanceof Error ? error.name : 'Unknown');
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Text extraction error:', error);
    
    // Provide more specific error messages based on error type
    let errorMessage = 'Failed to extract text from file';
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Add helpful context for common errors
      if (error.message.includes('password')) {
        errorMessage = 'File is password protected. Please remove password protection and try again.';
      } else if (error.message.includes('corrupt') || error.message.includes('invalid')) {
        errorMessage = 'File appears to be corrupted. Please try opening and re-saving the file.';
      } else if (error.message.includes('format') || error.message.includes('unsupported')) {
        errorMessage = 'File format is not supported. Please ensure it is a valid PDF, DOCX, or PPTX file.';
      } else if (error.message.includes('No readable text') || error.message.includes('no text')) {
        errorMessage = 'No readable text found in the file. The document may contain only images or be corrupted.';
      }
    }
    
    return errorResponse(errorMessage, 500);
  }
});

function getExtractionMethod(mimeType: string): string {
  switch (mimeType) {
    case 'application/pdf':
      return 'PDF text extraction using pdf-parse';
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return 'PPTX slide extraction using JSZip';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'DOCX document extraction using mammoth';
    default:
      return 'Unknown extraction method';
  }
}