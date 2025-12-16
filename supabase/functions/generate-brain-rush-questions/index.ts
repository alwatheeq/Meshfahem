import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse, successResponse } from '../_shared/response.ts';
import { authenticateUser, getSupabaseClient } from '../_shared/auth.ts';
import { validateMethod, parseJsonBody, validateRequiredFields, validateNumberRange, validateNonEmptyString } from '../_shared/validation.ts';

const MODEL_TOKEN_LIMITS: { [key: string]: number } = {
  'claude-3-haiku-20240307': 4096,
};

const DEFAULT_MODEL = 'claude-3-haiku-20240307';
const DEFAULT_MAX_TOKENS = 4096;
const QUESTIONS_PER_CHUNK = 5;
const MAX_CHUNK_RETRIES = 3;

interface GenerateQuestionsRequest {
  topic: string;
  questionCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
  subject?: string;
}

interface Question {
  question: string;
  options: string[];
  correct_answer: string;
  difficulty: string;
}

function normalizeString(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

function stripOptionPrefix(str: string): string {
  return str.replace(/^[A-Da-d][\).\]:]\s*/, '').replace(/^[1-4][\).\]:]\s*/, '').trim();
}

function findBestMatch(correctAnswer: string, options: string[]): string | null {
  const normalizedAnswer = normalizeString(correctAnswer);
  const strippedAnswer = stripOptionPrefix(normalizedAnswer);

  for (const option of options) {
    const normalizedOption = normalizeString(option);

    if (normalizedOption === normalizedAnswer || normalizedOption === strippedAnswer) {
      return option;
    }

    if (normalizedOption.toLowerCase() === normalizedAnswer.toLowerCase() ||
        normalizedOption.toLowerCase() === strippedAnswer.toLowerCase()) {
      return option;
    }
  }

  for (const option of options) {
    const normalizedOption = normalizeString(stripOptionPrefix(option));
    if (normalizedOption.toLowerCase() === stripOptionPrefix(normalizedAnswer).toLowerCase()) {
      return option;
    }
  }

  return null;
}

function validateAndNormalizeQuestion(q: any): Question | null {
  try {
    if (!q.question || typeof q.question !== 'string') {
      console.warn('Missing or invalid question text');
      return null;
    }

    if (!q.options || !Array.isArray(q.options) || q.options.length !== 4) {
      console.warn('Must have exactly 4 options');
      return null;
    }

    if (!q.correct_answer || typeof q.correct_answer !== 'string') {
      console.warn('Missing or invalid correct answer');
      return null;
    }

    const normalizedOptions = q.options.map((opt: any) => normalizeString(String(opt)));
    let normalizedCorrectAnswer = normalizeString(q.correct_answer);

    if (!normalizedOptions.includes(normalizedCorrectAnswer)) {
      const bestMatch = findBestMatch(normalizedCorrectAnswer, normalizedOptions);
      if (bestMatch) {
        normalizedCorrectAnswer = bestMatch;
      } else {
        console.warn('Could not match correct answer to options');
        return null;
      }
    }

    return {
      question: q.question.trim(),
      options: normalizedOptions,
      correct_answer: normalizedCorrectAnswer,
      difficulty: q.difficulty || 'medium'
    };
  } catch (error) {
    console.warn('Question validation error:', error);
    return null;
  }
}

function tryParseJSON(text: string): any {
  let cleaned = text.trim();

  cleaned = cleaned.replace(/```json\s*/gi, '');
  cleaned = cleaned.replace(/```javascript\s*/gi, '');
  cleaned = cleaned.replace(/```\s*/g, '');

  const jsonStart = Math.min(
    cleaned.indexOf('[') === -1 ? Infinity : cleaned.indexOf('['),
    cleaned.indexOf('{') === -1 ? Infinity : cleaned.indexOf('{')
  );
  if (jsonStart !== Infinity && jsonStart > 0) {
    cleaned = cleaned.substring(jsonStart);
  }

  cleaned = cleaned.replace(/,(\s*[\]}])/g, '$1');

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]);
    }
    throw error;
  }
}

function buildPrompt(
  topic: string,
  questionCount: number,
  difficulty: 'easy' | 'medium' | 'hard',
  subject?: string
): string {
  const difficultyInstructions = {
    easy: 'Create straightforward questions testing basic knowledge and recall. Use simple, clear language.',
    medium: 'Create questions requiring understanding and application of concepts. Mix recall with reasoning.',
    hard: 'Create challenging questions requiring analysis and critical thinking. Include complex scenarios.'
  };

  const subjectContext = subject ? `Focus on ${subject} related to: ${topic}` : `Topic: ${topic}`;

  return `You are an expert quiz creator for a fast-paced multiplayer game called Brain Rush. Generate EXACTLY ${questionCount} multiple-choice questions about the following topic.

${subjectContext}

DIFFICULTY: ${difficulty}
${difficultyInstructions[difficulty]}

REQUIREMENTS:

1. Generate EXACTLY ${questionCount} questions about: "${topic}"

2. Each question MUST have:
   - Clear, concise question text (1-2 sentences max)
   - EXACTLY 4 answer options
   - One correct answer
   - Fast-paced, engaging style suitable for competitive gameplay

3. JSON FORMAT RULES:
   a) Return ONLY a JSON array starting with [ and ending with ]
   b) NO text before [ or after ]
   c) Each question is a JSON object
   d) Separate questions with commas
   e) NO trailing comma after last question
   f) Use double quotes only
   g) Options: plain text, NO prefixes like "A)" or "1."
   h) "correct_answer" must EXACTLY match one option

4. TEMPLATE:
[
  {
    "question": "Your question here?",
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "correct_answer": "Option 2",
    "difficulty": "${difficulty}"
  }
]

5. IMPORTANT:
   - Questions should be engaging and fun
   - Mix different aspects of the topic
   - Ensure variety in difficulty within the level
   - Make all options plausible but only one correct
   - Keep questions concise for fast gameplay

RESPOND WITH PURE JSON ONLY - NO MARKDOWN, NO EXPLANATIONS.
Begin with [ and end with ]`;
}

async function generateQuestions(
  topic: string,
  questionCount: number,
  difficulty: 'easy' | 'medium' | 'hard',
  subject: string | undefined,
  claudeApiKey: string
): Promise<Question[]> {
  console.log(`🤖 Generating ${questionCount} questions about: ${topic}`);

  const prompt = buildPrompt(topic, questionCount, difficulty, subject);

  const calculatedMaxTokens = Math.min(
    Math.ceil(questionCount * 200),
    4096
  );

  console.log(`📊 Calling Claude API with max tokens: ${calculatedMaxTokens}`);

  const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: calculatedMaxTokens,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!claudeResponse.ok) {
    const errorText = await claudeResponse.text();
    throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText}`);
  }

  const claudeData = await claudeResponse.json();
  const responseText = claudeData.content[0].text.trim();

  console.log(`📊 Response received (${responseText.length} chars)`);

  const rawQuestions = tryParseJSON(responseText);
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new Error('Invalid quiz format returned by AI');
  }

  const validatedQuestions: Question[] = [];

  for (const q of rawQuestions) {
    const validated = validateAndNormalizeQuestion(q);
    if (validated) {
      validatedQuestions.push(validated);
    }
  }

  console.log(`✅ Validated ${validatedQuestions.length}/${questionCount} questions`);

  if (validatedQuestions.length === 0) {
    throw new Error('No valid questions could be generated');
  }

  return validatedQuestions;
}

async function generateQuestionsInChunks(
  topic: string,
  totalQuestions: number,
  difficulty: 'easy' | 'medium' | 'hard',
  subject: string | undefined,
  claudeApiKey: string
): Promise<Question[]> {
  console.log('🚀 Starting chunked question generation');
  console.log(`📊 Target: ${totalQuestions} questions in chunks of ${QUESTIONS_PER_CHUNK}`);

  const allQuestions: Question[] = [];
  const totalChunks = Math.ceil(totalQuestions / QUESTIONS_PER_CHUNK);

  for (let chunkNum = 1; chunkNum <= totalChunks; chunkNum++) {
    const remainingQuestions = totalQuestions - allQuestions.length;
    const questionsInThisChunk = Math.min(QUESTIONS_PER_CHUNK, remainingQuestions);

    let chunkSuccess = false;
    let lastError: Error | null = null;

    for (let retry = 1; retry <= MAX_CHUNK_RETRIES; retry++) {
      try {
        console.log(`📦 Chunk ${chunkNum}/${totalChunks}: Generating ${questionsInThisChunk} questions...`);

        const questions = await generateQuestions(
          topic,
          questionsInThisChunk,
          difficulty,
          subject,
          claudeApiKey
        );

        if (questions.length > 0) {
          allQuestions.push(...questions);
          console.log(`✅ Chunk ${chunkNum}/${totalChunks} completed: ${allQuestions.length}/${totalQuestions} questions generated`);
          chunkSuccess = true;
          break;
        } else {
          throw new Error(`Chunk ${chunkNum}: No valid questions generated`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.error(`❌ Chunk ${chunkNum} attempt ${retry}/${MAX_CHUNK_RETRIES} failed:`, lastError.message);

        if (retry === MAX_CHUNK_RETRIES) {
          throw new Error(`Chunk ${chunkNum} failed after ${MAX_CHUNK_RETRIES} attempts: ${lastError.message}`);
        }

        await new Promise(resolve => setTimeout(resolve, 1000 * retry));
      }
    }

    if (!chunkSuccess) {
      throw new Error(`Failed to generate chunk ${chunkNum}/${totalChunks}`);
    }

    if (allQuestions.length >= totalQuestions) {
      break;
    }
  }

  console.log('🎉 Chunked generation complete!');
  console.log(`📊 Final count: ${allQuestions.length} questions`);

  return allQuestions.slice(0, totalQuestions);
}

Deno.serve(async (req: Request) => {
  console.log('🚀 Generate Brain Rush Questions function started');
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

    let isAdmin = false;
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', authResult.user.id)
      .maybeSingle();

    isAdmin = profile?.role === 'admin';

    if (!isAdmin) {
      console.log('🔍 Step 2.5: Check credit balance');
      const { data: creditCheck, error: creditError } = await supabase
        .rpc('check_sufficient_credits', {
          p_user_id: authResult.user.id,
          p_estimated_credits: 3 // Estimate minimum credits needed for brain rush
        });

      if (creditError) {
        console.error('Failed to check credits:', creditError);
      } else if (creditCheck && !creditCheck.sufficient) {
        const cycleEnd = creditCheck.cycle_end;
        throw new Error(`You don't have enough credits to complete this action. Your credits will refresh on ${new Date(cycleEnd).toLocaleDateString()}.`);
      }

      console.log(`📊 Current balance: ${creditCheck?.credits_remaining || 0} credits`);
    }

    console.log('📥 Step 3: Parse request data');
    const bodyResult = await parseJsonBody<GenerateQuestionsRequest>(req);
    if (bodyResult.error) {
      return bodyResult.error;
    }

    const { topic, questionCount, difficulty, subject } = bodyResult.data;

    console.log('📊 Request parameters:');
    console.log('   - Topic:', topic);
    console.log('   - Question count:', questionCount);
    console.log('   - Difficulty:', difficulty);
    console.log('   - Subject:', subject || 'Not specified');

    const topicError = validateNonEmptyString(topic, 'topic');
    if (topicError || (typeof topic === 'string' && topic.trim().length < 3)) {
      return errorResponse('Topic must be at least 3 characters', 400);
    }

    const questionCountError = validateNumberRange(questionCount, 5, 50, 'questionCount');
    if (questionCountError) {
      return errorResponse(questionCountError, 400);
    }

    console.log('🔑 Step 4: API key validation');
    const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!claudeApiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    console.log('🤖 Step 5: Generate questions');
    const questions = await generateQuestionsInChunks(
      topic,
      questionCount,
      difficulty,
      subject,
      claudeApiKey
    );

    console.log('📊 Step 6: Deduct credits');
    if (!isAdmin) {
      try {
        const estimatedTokens = Math.ceil(topic.length * 3 + questionCount * 150);

        console.log(`📊 Usage calculation: ${estimatedTokens} tokens`);

        const { data: deductResult, error: deductError } = await supabase
          .rpc('deduct_credits_atomic', {
            p_user_id: authResult.user.id,
            p_tokens_used: estimatedTokens,
            p_operation_type: 'deduction'
          });

        if (deductError) {
          console.error('⚠️ Failed to deduct credits:', deductError);
        } else if (deductResult && deductResult.success) {
          console.log(`✅ Credits deducted: ${deductResult.credits_deducted}, remaining: ${deductResult.credits_remaining}`);

          // Handle notifications
          if (deductResult.notify_30_percent || deductResult.notify_10_percent) {
            const percentage = deductResult.notify_10_percent ? 10 : 30;
            const message = `You have ${deductResult.credits_remaining} credits remaining (${percentage}% left). They will refresh on ${new Date(deductResult.cycle_end).toLocaleDateString()}.`;

            await supabase.from('notifications').insert({
              user_id: authResult.user.id,
              notification_type: 'admin_notification',
              message: message,
              is_read: false
            });
          }
        }
      } catch (usageError) {
        console.error('⚠️ Failed to deduct credits:', usageError);
      }
    }

    console.log('🎉 Question generation complete!');

    return successResponse({
      questionCount: questions.length,
      questions: questions,
    });
  } catch (error) {
    console.error('💥 Fatal error in generate-brain-rush-questions:', error);

    return errorResponse(
      error instanceof Error ? error.message : 'Failed to generate questions',
      500
    );
  }
});
