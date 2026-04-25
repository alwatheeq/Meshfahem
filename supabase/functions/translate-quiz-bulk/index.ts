/// <reference path="../_shared/deno.d.ts" />
import { handleCorsPreflight } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { authenticateUser, getSupabaseClient } from '../_shared/auth.ts';
import { validateMethod, parseJsonBody, validateRequiredFields } from '../_shared/validation.ts';

interface Question {
  index: number;
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
  topic?: string;
  type: 'multiple_choice' | 'true_false';
}

interface TranslateQuizRequest {
  quizSessionId: string;
  targetLanguages: string[];
  sourceLanguage?: string;
}

const LANGUAGE_NAMES = {
  en: 'English',
  ar: 'Arabic (العربية)',
  fr: 'French (Français)',
  tr: 'Turkish (Türkçe)'
};

function buildTranslationPrompt(questions: Question[], sourceLanguage: string, targetLanguage: string): string {
  const sourceLangName = LANGUAGE_NAMES[sourceLanguage as keyof typeof LANGUAGE_NAMES] || sourceLanguage;
  const targetLangName = LANGUAGE_NAMES[targetLanguage as keyof typeof LANGUAGE_NAMES] || targetLanguage;

  return `You are a professional translator specializing in educational content. Translate this entire quiz from ${sourceLangName} to ${targetLangName}.

CRITICAL TRANSLATION REQUIREMENTS:

1. STRUCTURE: Maintain the EXACT JSON structure. Do not add or remove any fields.

2. WHAT TO TRANSLATE:
   - "question" field - translate the question text
   - "options" array - translate each option
   - "correct_answer" - translate this to match the translated option EXACTLY
   - "explanation" field - translate the explanation
   - "topic" field - translate the topic name

3. WHAT NOT TO CHANGE:
   - "index" field - keep the same number
   - "type" field - keep as "multiple_choice" or "true_false"
   - Array order - keep questions and options in the same order
   - JSON structure - must be valid JSON

4. ACCURACY REQUIREMENTS:
   - The "correct_answer" MUST match one of the translated options EXACTLY
   - Pay attention to capitalization, punctuation, and spacing
   - Ensure the correct answer maintains the same meaning after translation

5. QUALITY REQUIREMENTS:
   - Use natural, fluent ${targetLangName}
   - Maintain educational clarity and precision
   - Preserve technical terms appropriately
   - Keep the same level of difficulty

SOURCE QUIZ IN ${sourceLangName.toUpperCase()}:
${JSON.stringify(questions, null, 2)}

RESPOND WITH ONLY THE TRANSLATED JSON ARRAY. NO EXPLANATIONS. NO MARKDOWN. NO CODE BLOCKS.
Start with [ and end with ]`;
}

async function translateQuizWithOpenAI(
  questions: Question[],
  sourceLanguage: string,
  targetLanguage: string,
  openaiApiKey: string
): Promise<{ success: boolean; translatedQuestions?: Question[]; error?: string }> {
  try {
    console.log(`🌐 Translating ${questions.length} questions from ${sourceLanguage} to ${targetLanguage}`);

    const prompt = buildTranslationPrompt(questions, sourceLanguage, targetLanguage);

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
            content: 'You are a professional translator. You translate educational quiz content accurately while maintaining JSON structure. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 4000,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI API error:', errorText);
      return { success: false, error: `Translation API error: ${response.status}` };
    }

    const data = await response.json();
    const translatedText = data?.choices?.[0]?.message?.content?.trim();

    if (!translatedText) {
      return { success: false, error: 'No translation received from API' };
    }

    console.log('📝 Parsing translated JSON...');
    let translatedQuestions: Question[];

    try {
      const cleanedText = translatedText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

      translatedQuestions = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      console.error('📄 Response text:', translatedText.substring(0, 500));
      return { success: false, error: 'Failed to parse translated content' };
    }

    if (!Array.isArray(translatedQuestions)) {
      return { success: false, error: 'Translation did not return an array' };
    }

    console.log('✅ Validating translated questions...');
    for (let i = 0; i < translatedQuestions.length; i++) {
      const q = translatedQuestions[i];

      if (!q.question || !q.options || !Array.isArray(q.options) || !q.correct_answer) {
        console.error(`❌ Invalid question at index ${i}:`, q);
        return { success: false, error: `Question ${i + 1} is invalid after translation` };
      }

      const normalizedAnswer = q.correct_answer.trim();
      const normalizedOptions = q.options.map(opt => opt.trim());

      if (!normalizedOptions.includes(normalizedAnswer)) {
        console.warn(`⚠️ Question ${i + 1}: Correct answer doesn't match options exactly`);
        console.warn('Answer:', normalizedAnswer);
        console.warn('Options:', normalizedOptions);

        const similarOption = normalizedOptions.find(opt =>
          opt.toLowerCase() === normalizedAnswer.toLowerCase()
        );

        if (similarOption) {
          console.log('✅ Found case-insensitive match, correcting...');
          q.correct_answer = similarOption;
        } else {
          return {
            success: false,
            error: `Question ${i + 1}: Correct answer "${normalizedAnswer}" does not match any option`
          };
        }
      }
    }

    console.log(`✅ Successfully translated ${translatedQuestions.length} questions`);
    return { success: true, translatedQuestions };

  } catch (error) {
    console.error('💥 Translation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown translation error'
    };
  }
}

Deno.serve(async (req: Request) => {
  console.log('🚀 Translate Quiz Bulk function started');
  console.log('📅 Timestamp:', new Date().toISOString());

  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const methodError = validateMethod(req, ['POST']);
  if (methodError) {
    return methodError;
  }

  try {
    console.log('🔐 Step 1: Authorization check');
    const authResult = await authenticateUser(req, true);
    if (authResult.error || !authResult.user) {
      return errorResponse(authResult.error || 'Unauthorized', 401);
    }

    const supabase = getSupabaseClient();
    console.log('✅ User authenticated:', authResult.user.id);

    console.log('📥 Step 3: Parse request data');
    const bodyResult = await parseJsonBody<TranslateQuizRequest>(req);
    if (bodyResult.error) {
      return bodyResult.error;
    }

    const { quizSessionId, targetLanguages, sourceLanguage = 'en' } = bodyResult.data;

    const missingFields = validateRequiredFields(
      { quizSessionId, targetLanguages },
      ['quizSessionId', 'targetLanguages']
    );
    if (missingFields) {
      return errorResponse(missingFields, 400);
    }

    if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
      return errorResponse('targetLanguages must be a non-empty array', 400);
    }

    console.log('📊 Request parameters:');
    console.log('   - Quiz ID:', quizSessionId);
    console.log('   - Target languages:', targetLanguages);
    console.log('   - Source language:', sourceLanguage);

    console.log('🔍 Step 4: Fetch quiz session');
    const { data: quizSession, error: fetchError } = await supabase
      .from('quiz_sessions')
      .select('*')
      .eq('id', quizSessionId)
      .eq('user_id', authResult.user.id)
      .single();

    if (fetchError || !quizSession) {
      return errorResponse('Quiz not found or access denied', 404);
    }

    const questions: Question[] = quizSession.questions_json;
    if (!questions || questions.length === 0) {
      throw new Error('Quiz has no questions to translate');
    }

    console.log('✅ Quiz loaded with', questions.length, 'questions');

    console.log('🔑 Step 5: API key validation');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    console.log('🌐 Step 6: Translate to each target language');
    const translatedQuestionsJson = quizSession.translated_questions_json || {};
    const availableLanguages = new Set(quizSession.available_languages || [sourceLanguage]);
    const translationResults: { [key: string]: { success: boolean; error?: string } } = {};

    for (const targetLang of targetLanguages) {
      if (targetLang === sourceLanguage) {
        console.log(`⏭️ Skipping ${targetLang} (source language)`);
        continue;
      }

      if (!['en', 'ar', 'fr', 'tr'].includes(targetLang)) {
        console.warn(`⚠️ Unsupported language: ${targetLang}`);
        translationResults[targetLang] = {
          success: false,
          error: 'Unsupported language'
        };
        continue;
      }

      console.log(`📝 Translating to ${targetLang}...`);
      const result = await translateQuizWithOpenAI(
        questions,
        sourceLanguage,
        targetLang,
        openaiApiKey
      );

      if (result.success && result.translatedQuestions) {
        translatedQuestionsJson[targetLang] = result.translatedQuestions;
        availableLanguages.add(targetLang);
        translationResults[targetLang] = { success: true };
        console.log(`✅ Successfully translated to ${targetLang}`);
      } else {
        translationResults[targetLang] = {
          success: false,
          error: result.error
        };
        console.error(`❌ Failed to translate to ${targetLang}:`, result.error);
      }
    }

    console.log('💾 Step 7: Update quiz session with translations');
    const { error: updateError } = await supabase
      .from('quiz_sessions')
      .update({
        translated_questions_json: translatedQuestionsJson,
        available_languages: Array.from(availableLanguages)
      })
      .eq('id', quizSessionId);

    if (updateError) {
      console.error('❌ Database update error:', updateError);
      throw new Error(`Failed to save translations: ${updateError.message}`);
    }

    const successCount = Object.values(translationResults).filter(r => r.success).length;
    const failureCount = Object.values(translationResults).filter(r => !r.success).length;

    console.log('✅ Translation complete!');
    console.log(`   - Successful: ${successCount}`);
    console.log(`   - Failed: ${failureCount}`);

    return successResponse({
      quizSessionId,
      translationResults,
      availableLanguages: Array.from(availableLanguages),
      successCount,
      failureCount
    });

  } catch (error) {
    console.error('💥 Fatal error in translate-quiz-bulk:', error);

    return errorResponse(
      error instanceof Error ? error.message : 'Failed to translate quiz',
      500
    );
  }
});
