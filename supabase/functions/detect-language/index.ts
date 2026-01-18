import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse } from '../_shared/response.ts';
import { validateMethod, parseJsonBody, validateRequiredFields, validateNonEmptyString } from '../_shared/validation.ts';

async function detectLanguageWithOpenAI(text: string, openaiApiKey: string) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Detect the primary language of this text. Respond with only the ISO 639-1 code (en, ar, fr, tr) or "unknown".'
          },
          {
            role: 'user',
            content: text
          }
        ],
        max_tokens: 10, // Very short response needed
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { 
        error: `OpenAI API error ${response.status}: ${errorText}` 
      };
    }

    const data = await response.json();
    const detectedLanguage = data?.choices?.[0]?.message?.content?.trim().toLowerCase();
    
    if (!detectedLanguage) {
      return { error: 'No language detected from OpenAI API' };
    }

    return { language: detectedLanguage };
  } catch (error) {
    return { 
      error: `Language detection failed: ${error.message}` 
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const methodError = validateMethod(req, ['POST']);
  if (methodError) {
    return methodError;
  }

  try {
    const bodyResult = await parseJsonBody<{ text: string }>(req);
    if (bodyResult.error) {
      return bodyResult.error;
    }

    const { text } = bodyResult.data;

    // Validate input
    const textError = validateNonEmptyString(text, 'text');
    if (textError) {
      return errorResponse(textError, 400);
    }

    // Minimum length check for reliable detection
    if (text.trim().length < 50) {
      return jsonResponse({ 
        language: 'original',
        confidence: 'low',
        reason: 'Text too short for reliable detection'
      });
    }

    // Get OpenAI API key from environment variables
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return errorResponse('OpenAI API key not configured', 500);
    }

    // Use first 1000 characters for efficiency
    const textSample = text.substring(0, 1000);

    // Detect the language
    const result = await detectLanguageWithOpenAI(textSample, openaiApiKey);
    
    if ('error' in result) {
      return errorResponse(result.error, 500);
    }

    // Map detected language to our codes
    const languageMap: Record<string, string> = {
      'en': 'en',
      'english': 'en',
      'ar': 'ar',
      'arabic': 'ar',
      'fr': 'fr',
      'french': 'fr',
      'français': 'fr',
      'tr': 'tr',
      'turkish': 'tr',
      'türkçe': 'tr'
    };

    const detectedCode = result.language?.toLowerCase() || 'unknown';
    const mappedLanguage = languageMap[detectedCode] || 'original';

    return jsonResponse({ 
      language: mappedLanguage,
      detectedCode: detectedCode,
      confidence: mappedLanguage !== 'original' ? 'high' : 'low'
    });

  } catch (error) {
    console.error('Language detection function error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Server error',
      500
    );
  }
});

