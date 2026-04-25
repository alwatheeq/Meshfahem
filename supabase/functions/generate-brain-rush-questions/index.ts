/// <reference path="../_shared/deno.d.ts" />
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const MODEL_TOKEN_LIMITS: { [key: string]: number } = {
  'claude-3-haiku-20240307': 4096,
};

const DEFAULT_MODEL = 'claude-3-haiku-20240307';
const QUESTIONS_PER_CHUNK = 3; // ✅ as requested
const MAX_CHUNK_RETRIES = 3;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

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

type TokenUsage = { input: number; output: number; total: number };

function normalizeString(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

function normalizeUnicode(str: string): string {
  return str
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0]/g, ' ')
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '-');
}

function stripOptionPrefix(str: string): string {
  return str.replace(/^[A-Da-d][).\]:]\s*/, '').replace(/^[1-4][).\]:]\s*/, '').trim();
}

function normalizeForDedup(s: string): string {
  return normalizeString(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '') // unicode-safe punctuation removal
    .replace(/\s+/g, ' ')
    .trim();
}

function optionsAreUnique(options: string[]): boolean {
  const seen = new Set<string>();
  for (const opt of options) {
    const key = normalizeForDedup(opt);
    if (!key) continue;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function findBestMatch(correctAnswer: string, options: string[]): string | null {
  const normalizedAnswer = normalizeString(correctAnswer);
  const strippedAnswer = stripOptionPrefix(normalizedAnswer);

  for (const option of options) {
    const normalizedOption = normalizeString(option);

    if (normalizedOption === normalizedAnswer || normalizedOption === strippedAnswer) return option;

    if (
      normalizedOption.toLowerCase() === normalizedAnswer.toLowerCase() ||
      normalizedOption.toLowerCase() === strippedAnswer.toLowerCase()
    ) return option;
  }

  for (const option of options) {
    const normalizedOption = normalizeString(stripOptionPrefix(option));
    if (normalizedOption.toLowerCase() === stripOptionPrefix(normalizedAnswer).toLowerCase()) return option;
  }

  return null;
}

function validateAndNormalizeQuestion(q: unknown): Question | null {
  try {
    if (typeof q !== 'object' || q === null) return null;
    const o = q as Record<string, unknown>;
    if (!o.question || typeof o.question !== 'string') return null;

    if (!Array.isArray(o.options) || o.options.length !== 4) return null;

    if (!o.correct_answer || typeof o.correct_answer !== 'string') return null;

    const normalizedOptions = o.options.map((opt) => normalizeString(String(opt)));

    // ✅ Ensure options are unique (common failure)
    if (!optionsAreUnique(normalizedOptions)) return null;

    let normalizedCorrectAnswer = normalizeString(o.correct_answer);

    if (!normalizedOptions.includes(normalizedCorrectAnswer)) {
      const bestMatch = findBestMatch(normalizedCorrectAnswer, normalizedOptions);
      if (bestMatch) normalizedCorrectAnswer = bestMatch;
      else return null;
    }

    const diff = o.difficulty;
    return {
      question: o.question.trim(),
      options: normalizedOptions,
      correct_answer: normalizedCorrectAnswer,
      difficulty: typeof diff === 'string' ? diff : 'medium'
    };
  } catch {
    return null;
  }
}

// --- Stronger JSON parsing (sanitization + repair) ---
function advancedSanitizeJSON(text: string): string {
  let cleaned = normalizeUnicode((text || '').trim());

  cleaned = cleaned.replace(/```json\s*/gi, '');
  cleaned = cleaned.replace(/```javascript\s*/gi, '');
  cleaned = cleaned.replace(/```\s*/g, '');

  const jsonStart = Math.min(
    cleaned.indexOf('[') === -1 ? Infinity : cleaned.indexOf('['),
    cleaned.indexOf('{') === -1 ? Infinity : cleaned.indexOf('{')
  );
  if (jsonStart !== Infinity && jsonStart > 0) cleaned = cleaned.substring(jsonStart);

  cleaned = cleaned.replace(/,(\s*[\]}])/g, '$1');
  // Strip C0 control characters from model output (intentional ASCII control class)
  // eslint-disable-next-line no-control-regex -- sanitize non-printable chars before JSON.parse
  cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  return cleaned.trim();
}

function smartRepairJSON(text: string): string {
  let repaired = text;

  // common join fixes
  repaired = repaired.replace(/"\s*\n\s*"/g, '", "');
  repaired = repaired.replace(/\}\s*\n\s*\{/g, '}, {');
  repaired = repaired.replace(/,(\s*[\]}])/g, '$1');

  // close brackets/braces if missing
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) repaired += ']'.repeat(openBrackets - closeBrackets);

  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  if (openBraces > closeBraces) repaired += '}'.repeat(openBraces - closeBraces);

  return repaired.trim();
}

function tryParseJSON(text: string): unknown {
  const sanitized = advancedSanitizeJSON(text);

  // strategy 1
  try {
    return JSON.parse(sanitized);
  } catch {
    // strategy 2: repair
    const repaired = smartRepairJSON(sanitized);
    try {
      return JSON.parse(repaired);
    } catch {
      // strategy 3: extract array
      const arrayMatch = repaired.match(/\[[\s\S]*\]/);
      if (arrayMatch) return JSON.parse(arrayMatch[0]);
      throw new Error('Failed to parse JSON');
    }
  }
}

// Token-aware error to charge even when JSON parsing/validation fails after a model call
class TokenError extends Error {
  tokensUsed: number;
  constructor(message: string, tokensUsed: number) {
    super(message);
    this.tokensUsed = tokensUsed;
  }
}

// --- Prompt builder with anti-duplication hook ---
function buildPrompt(
  topic: string,
  questionCount: number,
  difficulty: 'easy' | 'medium' | 'hard',
  subject?: string,
  avoidQuestions?: string[]
): string {
  const difficultyInstructions = {
    easy: 'Create straightforward questions testing basic knowledge and recall. Use simple, clear language.',
    medium: 'Create questions requiring understanding and application of concepts. Mix recall with reasoning.',
    hard: 'Create challenging questions requiring analysis and critical thinking. Include complex scenarios.'
  };

  const subjectContext = subject
    ? `Focus on ${subject} related to: ${topic}`
    : `Topic: ${topic}`;

  const avoidBlock =
    avoidQuestions && avoidQuestions.length > 0
      ? `\nAVOID DUPLICATES:\nDo NOT repeat or closely paraphrase any of these questions:\n- ${avoidQuestions.slice(0, 25).join('\n- ')}\n`
      : '';

  return `You are an expert quiz creator for a fast-paced multiplayer game called Brain Rush. Generate EXACTLY ${questionCount} multiple-choice questions about the following topic.

${subjectContext}

DIFFICULTY: ${difficulty}
${difficultyInstructions[difficulty]}

${avoidBlock}
REQUIREMENTS:
1) Generate EXACTLY ${questionCount} questions about: "${topic}"
2) Each question MUST have:
   - Clear, concise question text (1-2 sentences max)
   - EXACTLY 4 answer options (all distinct)
   - One correct answer
   - Fast-paced, engaging style suitable for competitive gameplay
3) JSON FORMAT RULES:
   a) Return ONLY a JSON array starting with [ and ending with ]
   b) NO text before [ or after ]
   c) Each question is a JSON object
   d) Separate questions with commas
   e) NO trailing comma after last question
   f) Use double quotes only
   g) Options: plain text, NO prefixes like "A)" or "1."
   h) "correct_answer" must EXACTLY match one option
   i) Do NOT put newline characters inside JSON string values

TEMPLATE:
[
  {
    "question": "Your question here?",
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "correct_answer": "Option 2",
    "difficulty": "${difficulty}"
  }
]

RESPOND WITH PURE JSON ONLY - NO MARKDOWN, NO EXPLANATIONS.
Begin with [ and end with ]`;
}

// --- Claude call with timeout + usage extraction ---
async function callClaude(prompt: string, claudeApiKey: string, maxTokens: number, temperature: number): Promise<{ text: string; tokens: TokenUsage }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: Math.min(maxTokens, MODEL_TOKEN_LIMITS[DEFAULT_MODEL] || 4096),
        temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Claude API error: ${resp.status} - ${errorText}`);
    }

    const data = await resp.json();
    const responseText = (data?.content?.[0]?.text || '').trim();
    const inputTokens = data?.usage?.input_tokens || 0;
    const outputTokens = data?.usage?.output_tokens || 0;

    return { text: responseText, tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens } };
  } catch (e: unknown) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === 'AbortError') throw new Error('Claude request timed out');
    throw e;
  }
}

async function generateQuestions(
  topic: string,
  questionCount: number,
  difficulty: 'easy' | 'medium' | 'hard',
  subject: string | undefined,
  claudeApiKey: string,
  avoidQuestions: string[]
): Promise<{ questions: Question[]; tokensUsed: number }> {
  const prompt = buildPrompt(topic, questionCount, difficulty, subject, avoidQuestions);

  // conservative token budget per question for JSON safety
  const calculatedMaxTokens = Math.min(Math.ceil(questionCount * 240), 4096);

  // ✅ lower temperature: still fun, much fewer JSON errors
  const temperature = 0.4;

  const { text: responseText, tokens } = await callClaude(prompt, claudeApiKey, calculatedMaxTokens, temperature);

  let rawQuestions: unknown;
  try {
    rawQuestions = tryParseJSON(responseText);
  } catch (_err) {
    // ✅ charge tokens even if parse fails
    throw new TokenError(`Failed to parse AI response as JSON`, tokens.total);
  }

  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new TokenError('Invalid quiz format returned by AI', tokens.total);
  }

  const validatedQuestions: Question[] = [];
  for (const q of rawQuestions) {
    const validated = validateAndNormalizeQuestion(q);
    if (validated) validatedQuestions.push(validated);
  }

  if (validatedQuestions.length === 0) {
    throw new TokenError('No valid questions could be generated', tokens.total);
  }

  return { questions: validatedQuestions, tokensUsed: tokens.total };
}

async function generateQuestionsInChunks(
  topic: string,
  totalQuestions: number,
  difficulty: 'easy' | 'medium' | 'hard',
  subject: string | undefined,
  claudeApiKey: string
): Promise<{ questions: Question[]; tokensUsedTotal: number }> {
  console.log('🚀 Starting chunked question generation');
  console.log(`📊 Target: ${totalQuestions} questions in chunks of ${QUESTIONS_PER_CHUNK}`);

  const allQuestions: Question[] = [];
  const totalChunks = Math.ceil(totalQuestions / QUESTIONS_PER_CHUNK);

  // ✅ avoid duplicates across chunks
  const usedQuestionKeys = new Set<string>();

  let tokensUsedTotal = 0;

  for (let chunkNum = 1; chunkNum <= totalChunks; chunkNum++) {
    const remainingQuestions = totalQuestions - allQuestions.length;
    const questionsInThisChunk = Math.min(QUESTIONS_PER_CHUNK, remainingQuestions);

    let chunkSuccess = false;
    let lastError: Error | null = null;

    for (let retry = 1; retry <= MAX_CHUNK_RETRIES; retry++) {
      try {
        const avoidList = Array.from(usedQuestionKeys).slice(0, 25);

        console.log(`📦 Chunk ${chunkNum}/${totalChunks}: Generating ${questionsInThisChunk} questions...`);

        const result = await generateQuestions(
          topic,
          questionsInThisChunk,
          difficulty,
          subject,
          claudeApiKey,
          avoidList
        );

        tokensUsedTotal += result.tokensUsed;

        // Filter duplicates against already used
        const newOnes: Question[] = [];
        for (const q of result.questions) {
          const key = normalizeForDedup(q.question);
          if (!key) continue;
          if (usedQuestionKeys.has(key)) continue;
          usedQuestionKeys.add(key);
          newOnes.push(q);
        }

        if (newOnes.length > 0) {
          allQuestions.push(...newOnes);
          console.log(`✅ Chunk ${chunkNum}/${totalChunks} completed: ${allQuestions.length}/${totalQuestions} questions generated`);
          chunkSuccess = true;
          break;
        } else {
          throw new Error(`Chunk ${chunkNum}: Only duplicates produced`);
        }
      } catch (error: unknown) {
        // If tokens were consumed but parsing/validation failed, count them
        if (error instanceof TokenError) {
          tokensUsedTotal += error.tokensUsed;
        }

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

    if (allQuestions.length >= totalQuestions) break;
  }

  // If we still have fewer than requested due to duplicate filtering, return what we have
  return { questions: allQuestions.slice(0, totalQuestions), tokensUsedTotal };
}

Deno.serve(async (req: Request) => {
  console.log('🚀 Generate Brain Rush Questions function started');
  console.log('📅 Timestamp:', new Date().toISOString());

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    console.log('🔐 Step 1: Authorization check');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('👤 Step 2: User authentication');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error('Unauthorized: Invalid or expired token');

    console.log('✅ User authenticated:', user.id);

    let isAdmin = false;
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    isAdmin = profile?.role === 'admin';

    if (!isAdmin) {
      console.log('🔍 Step 2.5: Check credit balance');
      const { data: creditCheck, error: creditError } = await supabase.rpc('check_sufficient_credits', {
        p_user_id: user.id,
        p_estimated_credits: 3
      });

      if (creditError) console.error('Failed to check credits:', creditError);
      else if (creditCheck && !creditCheck.sufficient) {
        const cycleEnd = creditCheck.cycle_end;
        throw new Error(`You don't have enough credits to complete this action. Your credits will refresh on ${new Date(cycleEnd).toLocaleDateString()}.`);
      }
    }

    console.log('📥 Step 3: Parse request data');
    const requestData: GenerateQuestionsRequest = await req.json();
    const { topic, questionCount, difficulty, subject } = requestData;

    if (!topic || topic.trim().length < 3) throw new Error('Topic must be at least 3 characters');
    if (questionCount < 5 || questionCount > 50) throw new Error('Question count must be between 5 and 50');

    console.log('🔑 Step 4: API key validation');
    const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!claudeApiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

    console.log('🤖 Step 5: Generate questions');
    const { questions, tokensUsedTotal } = await generateQuestionsInChunks(
      topic,
      questionCount,
      difficulty,
      subject,
      claudeApiKey
    );

    console.log(`📊 Tokens used total: ${tokensUsedTotal}`);

    console.log('📊 Step 6: Deduct credits (REAL token usage)');
    if (!isAdmin && tokensUsedTotal > 0) {
      try {
        const { data: deductResult, error: deductError } = await supabase.rpc('deduct_credits_atomic', {
          p_user_id: user.id,
          p_tokens_used: tokensUsedTotal,
          p_operation_type: 'deduction'
        });

        if (deductError) {
          console.error('⚠️ Failed to deduct credits:', deductError);
        } else if (deductResult?.success) {
          console.log(`✅ Credits deducted: ${deductResult.credits_deducted}, remaining: ${deductResult.credits_remaining}`);

          if (deductResult.notify_30_percent || deductResult.notify_10_percent) {
            const percentage = deductResult.notify_10_percent ? 10 : 30;
            const message = `You have ${deductResult.credits_remaining} credits remaining (${percentage}% left). They will refresh on ${new Date(deductResult.cycle_end).toLocaleDateString()}.`;

            await supabase.from('notifications').insert({
              user_id: user.id,
              notification_type: 'admin_notification',
              message,
              is_read: false
            });
          }
        }
      } catch (usageError) {
        console.error('⚠️ Failed to deduct credits:', usageError);
      }
    }

    console.log('🎉 Question generation complete!');

    return new Response(
      JSON.stringify({
        success: true,
        questionCount: questions.length,
        questions
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error: unknown) {
    console.error('💥 Fatal error in generate-brain-rush-questions:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate questions',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
