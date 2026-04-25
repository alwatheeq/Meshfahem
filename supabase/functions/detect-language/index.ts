/// <reference path="../_shared/deno.d.ts" />
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse } from '../_shared/response.ts';
import {
  validateMethod,
  validateJsonContentType,
  parseJsonBody,
  validateNonEmptyString
} from '../_shared/validation.ts';

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
            content:
              'Detect the primary language of this text. Respond with only one of: ISO 639-1 code (en, ar, fr, tr), the language name (English/Arabic/French/Turkish), or "unknown". No extra words.'
          },
          {
            role: 'user',
            content: text
          }
        ],
        max_tokens: 10,
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
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      error: `Language detection failed: ${msg}`
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const methodError = validateMethod(req, ['POST']);
  if (methodError) {
    return methodError;
  }

  // ✅ Added: enforce JSON content type
  const contentTypeError = validateJsonContentType(req);
  if (contentTypeError) {
    return contentTypeError;
  }

  try {
    const bodyResult = await parseJsonBody<{ text: string }>(req);
    if (bodyResult.error) {
      return bodyResult.error;
    }

    const { text } = bodyResult.data;

    const textError = validateNonEmptyString(text, 'text');
    if (textError) {
      return errorResponse(textError, 400);
    }

    // ✅ Updated: do NOT "pretend-detect" language when too short.
    // Return original + detectedCode unknown + reason.
    if (text.trim().length < 50) {
      return jsonResponse({
        language: 'original',
        detectedCode: 'unknown',
        confidence: 'low',
        reason: 'Text too short for reliable detection'
      });
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return errorResponse('OpenAI API key not configured', 500);
    }

    const textSample = text.substring(0, 1000);

    // ✅ Added: deterministic Arabic detection (skip OpenAI)
    const arabicChars = (textSample.match(/[\u0600-\u06FF]/g) || []).length;
    const latinChars = (textSample.match(/[A-Za-z]/g) || []).length;

    // Threshold tuned to avoid false positives on tiny Arabic fragments
    if (arabicChars >= 20 && arabicChars > latinChars) {
      return jsonResponse({
        language: 'ar',
        detectedCode: 'ar',
        confidence: 'high',
        method: 'regex'
      });
    }

    const result = await detectLanguageWithOpenAI(textSample, openaiApiKey);

    if ('error' in result) {
      return errorResponse(result.error, 500);
    }

    // Variant-tolerant mapping (as you prefer)
    const languageMap: Record<string, string> = {
      en: 'en',
      english: 'en',

      ar: 'ar',
      arabic: 'ar',
      'العربية': 'ar',

      fr: 'fr',
      french: 'fr',
      'français': 'fr',

      tr: 'tr',
      turkish: 'tr',
      'türkçe': 'tr',

      unknown: 'original'
    };

    const detectedCode = result.language?.toLowerCase() || 'unknown';
    const mappedLanguage = languageMap[detectedCode] || 'original';

    // ✅ Preserve your preference:
    // - If unknown => language "original" (no user-facing error)
    // - But still signal unknown in detectedCode + confidence low
    const isUnknown = mappedLanguage === 'original';

    return jsonResponse({
      language: mappedLanguage,
      detectedCode,
      confidence: isUnknown ? 'low' : 'high',
      ...(isUnknown ? { reason: 'Language could not be reliably detected' } : {})
    });

  } catch (error) {
    console.error('Language detection function error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Server error',
      500
    );
  }
});
