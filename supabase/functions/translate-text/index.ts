/// <reference path="../_shared/deno.d.ts" />
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse } from '../_shared/response.ts';
import { validateMethod, parseJsonBody, validateNonEmptyString } from '../_shared/validation.ts';

async function translateWithOpenAI(text: string, targetLanguage: string, openaiApiKey: string) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Using the more cost-effective model
        messages: [
          {
            role: 'system',
            content: `Translate to ${targetLanguage}. Preserve formatting, structure, and meaning. Return only the translation, no explanations.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        max_tokens: 2000,
        temperature: 0.1 // Lower temperature for more consistent translations
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { 
        error: `OpenAI API error ${response.status}: ${errorText}` 
      };
    }

    const data = await response.json();
    const translatedText = data?.choices?.[0]?.message?.content?.trim();
    
    if (!translatedText) {
      return { error: 'No translation received from OpenAI API' };
    }

    return { translatedText };
  } catch (error) {
    return { 
      error: `Translation request failed: ${error.message}` 
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
    const bodyResult = await parseJsonBody<{ text: string; targetLanguage: string }>(req);
    if (bodyResult.error) {
      return bodyResult.error;
    }

    const { text, targetLanguage } = bodyResult.data;

    // Validate input
    const textError = validateNonEmptyString(text, 'text');
    if (textError) {
      return errorResponse(textError, 400);
    }

    const languageError = validateNonEmptyString(targetLanguage, 'targetLanguage');
    if (languageError) {
      return errorResponse(languageError, 400);
    }

    // Get OpenAI API key from environment variables
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return errorResponse('OpenAI API key not configured', 500);
    }

    // Translate the text
    const result = await translateWithOpenAI(text, targetLanguage, openaiApiKey);
    
    if ('error' in result) {
      return errorResponse(result.error, 500);
    }

    return jsonResponse({ 
      translatedText: result.translatedText,
      originalText: text,
      targetLanguage: targetLanguage
    });

  } catch (error) {
    console.error('Translation function error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Server error',
      500
    );
  }
});