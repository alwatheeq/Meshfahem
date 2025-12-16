import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.39.3';
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse, successResponse } from '../_shared/response.ts';
import { authenticateUser, getSupabaseClient } from '../_shared/auth.ts';
import { validateMethod, parseJsonBody, validateRequiredFields, validateNumberRange } from '../_shared/validation.ts';

const MODEL_TOKEN_LIMITS: { [key: string]: number } = {
  'claude-3-haiku-20240307': 4096,
};

const DEFAULT_MODEL = 'claude-3-haiku-20240307';
const DEFAULT_MAX_TOKENS = 4096;
const QUESTIONS_PER_CHUNK = 3;
const MAX_CHUNK_RETRIES = 3;

interface QuizRequest {
  text: string;
  questionCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
  sourceType: 'uploaded_document' | 'library_item';
  sourceId?: string;
  quizTitle: string;
  targetLanguage?: string;
}

interface Question {
  index: number;
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  topic: string;
  type: 'multiple_choice' | 'true_false';
}

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

function smartRepairJSON(text: string): string {
  console.log('🔧 Starting smart JSON repair...');
  let repaired = text;

  repaired = repaired.replace(/"\s*\n\s*"/g, '", "');
  repaired = repaired.replace(/"\s*\n\s*\{/g, '", {');
  repaired = repaired.replace(/\}\s*\n\s*\{/g, '}, {');
  repaired = repaired.replace(/"\s*\n\s*\[/g, '", [');
  repaired = repaired.replace(/\]\s*\n\s*\{/g, '], {');

  repaired = repaired.replace(/"(\w+)":\s*"([^"]*)"(\s+)"(\w+)":/g, '"$1": "$2", "$4":');
  repaired = repaired.replace(/"(\w+)":\s*"([^"]*)"(\s+)\}/g, '"$1": "$2" }');

  repaired = repaired.replace(/\}\s+\{/g, '}, {');
  repaired = repaired.replace(/\]\s+\[/g, '], [');

  repaired = repaired.replace(/,(\s*[\]}])/g, '$1');

  const quoteCount = (repaired.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    console.log('⚠️ Odd number of quotes, closing last string');
    const lastQuoteIndex = repaired.lastIndexOf('"');
    if (lastQuoteIndex !== -1) {
      const afterQuote = repaired.substring(lastQuoteIndex + 1);
      if (!afterQuote.match(/^\s*[,}\]]/)) {
        repaired = repaired + '"';
      }
    }
  }

  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) {
    console.log(`⚠️ Adding ${openBrackets - closeBrackets} closing bracket(s)`);
    repaired = repaired + ']'.repeat(openBrackets - closeBrackets);
  }

  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    console.log(`⚠️ Adding ${openBraces - closeBraces} closing brace(s)`);
    repaired = repaired + '}'.repeat(openBraces - closeBraces);
  }

  console.log('✅ Smart repair complete');
  return repaired;
}

function extractCompleteQuestions(text: string): string {
  console.log('✂️ Extracting complete questions from potentially truncated response...');

  const sanitized = advancedSanitizeJSON(text);

  let depth = 0;
  let inString = false;
  let escape = false;
  let result = '';
  let lastCompleteQuestionEnd = -1;
  let questionCount = 0;

  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i];

    if (escape) {
      result += char;
      escape = false;
      continue;
    }

    if (char === '\\' && inString) {
      escape = true;
      result += char;
      continue;
    }

    if (char === '"' && !escape) {
      inString = !inString;
      result += char;
      continue;
    }

    if (!inString) {
      if (char === '[') {
        depth++;
        result += char;
      } else if (char === '{') {
        depth++;
        result += char;
      } else if (char === '}') {
        depth--;
        result += char;
        if (depth === 1) {
          lastCompleteQuestionEnd = i;
          questionCount++;
        }
      } else if (char === ']') {
        depth--;
        result += char;
        if (depth === 0) {
          console.log(`✅ Found ${questionCount} complete questions`);
          return result;
        }
      } else {
        result += char;
      }
    } else {
      result += char;
    }
  }

  if (lastCompleteQuestionEnd > 0 && depth > 0) {
    const truncated = result.substring(0, lastCompleteQuestionEnd + 1) + ']';
    console.log(`✂️ Truncated to ${questionCount} complete questions (removed incomplete question)`);
    return truncated;
  }

  console.log('⚠️ Could not find complete questions boundary, returning sanitized text');
  return result;
}

function advancedSanitizeJSON(text: string): string {
  let cleaned = text.trim();

  console.log('🧹 Starting JSON sanitization, original length:', cleaned.length);

  cleaned = normalizeUnicode(cleaned);
  cleaned = cleaned.replace(/^\uFEFF/gm, '');
  cleaned = cleaned.replace(/\uFFFD/g, '');
  cleaned = cleaned.replace(/```json\s*/gi, '');
  cleaned = cleaned.replace(/```javascript\s*/gi, '');
  cleaned = cleaned.replace(/```\s*/g, '');

  const jsonStart = Math.min(
    cleaned.indexOf('[') === -1 ? Infinity : cleaned.indexOf('['),
    cleaned.indexOf('{') === -1 ? Infinity : cleaned.indexOf('{')
  );
  if (jsonStart !== Infinity && jsonStart > 0) {
    console.log(`✂️ Trimming ${jsonStart} characters from start`);
    cleaned = cleaned.substring(jsonStart);
  }

  const lastBracket = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
  if (lastBracket !== -1 && lastBracket < cleaned.length - 1) {
    const afterContent = cleaned.substring(lastBracket + 1).trim();
    if (afterContent.length > 0 && !afterContent.startsWith(',')) {
      const trimmed = cleaned.length - lastBracket - 1;
      console.log(`✂️ Trimming ${trimmed} characters from end`);
      cleaned = cleaned.substring(0, lastBracket + 1);
    }
  }

  cleaned = cleaned.replace(/,(\s*[\]}])/g, '$1');
  cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  cleaned = cleaned.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/\r/g, '\n');

  console.log('✨ Sanitization complete, final length:', cleaned.length);
  return cleaned;
}

function tryParseJSON(text: string): any {
  const strategies: Array<{name: string, fn: () => any}> = [
    {
      name: 'Direct Parse',
      fn: () => JSON.parse(text)
    },
    {
      name: 'Sanitized Parse',
      fn: () => {
        const sanitized = advancedSanitizeJSON(text);
        return JSON.parse(sanitized);
      }
    },
    {
      name: 'Smart Repair + Parse',
      fn: () => {
        const sanitized = advancedSanitizeJSON(text);
        const repaired = smartRepairJSON(sanitized);
        return JSON.parse(repaired);
      }
    },
    {
      name: 'Extract Complete Questions + Parse',
      fn: () => {
        const complete = extractCompleteQuestions(text);
        return JSON.parse(complete);
      }
    },
    {
      name: 'Extract Complete Questions + Smart Repair',
      fn: () => {
        const complete = extractCompleteQuestions(text);
        const repaired = smartRepairJSON(complete);
        return JSON.parse(repaired);
      }
    },
    {
      name: 'Array Extraction',
      fn: () => {
        const arrayMatch = text.match(/\[[\s\S]*\]/);
        if (!arrayMatch) throw new Error('No array found');
        return JSON.parse(arrayMatch[0]);
      }
    },
    {
      name: 'Array Extraction + Smart Repair',
      fn: () => {
        const arrayMatch = text.match(/\[[\s\S]*\]/);
        if (!arrayMatch) throw new Error('No array found');
        const repaired = smartRepairJSON(arrayMatch[0]);
        return JSON.parse(repaired);
      }
    },
    {
      name: 'Aggressive Complete Question Extraction',
      fn: () => {
        const sanitized = advancedSanitizeJSON(text);
        const complete = extractCompleteQuestions(sanitized);
        const repaired = smartRepairJSON(complete);
        return JSON.parse(repaired);
      }
    }
  ];

  const errors: Array<{strategy: string, error: string}> = [];

  for (const strategy of strategies) {
    try {
      console.log(`🔍 Trying strategy: ${strategy.name}`);
      const result = strategy.fn();
      console.log(`✅ Strategy "${strategy.name}" succeeded!`);
      return result;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.log(`❌ Strategy "${strategy.name}" failed:`, errorMsg.substring(0, 100));
      errors.push({ strategy: strategy.name, error: errorMsg });
    }
  }

  console.error('💥 All parsing strategies failed');
  console.error('📄 Text sample (first 500):', text.substring(0, 500));
  console.error('📄 Text sample (last 500):', text.substring(Math.max(0, text.length - 500)));

  throw new Error(`All JSON parsing strategies failed. Attempted ${strategies.length} strategies. First error: ${errors[0]?.error || 'Unknown'}`);
}

function stripOptionPrefix(str: string): string {
  return str.replace(/^[A-Da-d][\).\]:]\s*/, '').replace(/^[1-4][\).\]:]\s*/, '').trim();
}

function removePunctuation(str: string): string {
  return str.replace(/[.,;:!?'"()-]+$/g, '').replace(/^[.,;:!?'"()-]+/g, '').trim();
}

function fullyNormalize(str: string): string {
  let normalized = normalizeString(str);
  normalized = stripOptionPrefix(normalized);
  normalized = removePunctuation(normalized);
  return normalized;
}

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 1.0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(s1, s2);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

function findBestMatch(correctAnswer: string, options: string[]): string | null {
  const normalizedAnswer = normalizeString(correctAnswer);
  const strippedAnswer = stripOptionPrefix(normalizedAnswer);
  const fullyNormalizedAnswer = fullyNormalize(correctAnswer);

  console.log(`🔍 Finding match for: "${correctAnswer}"`);

  for (const option of options) {
    const normalizedOption = normalizeString(option);
    const fullyNormalizedOption = fullyNormalize(option);

    if (normalizedOption === normalizedAnswer) {
      console.log(`✅ Exact match found: "${option}"`);
      return option;
    }

    if (normalizedOption === strippedAnswer) {
      console.log(`✅ Stripped match found: "${option}"`);
      return option;
    }

    if (normalizedOption.toLowerCase() === normalizedAnswer.toLowerCase()) {
      console.log(`✅ Case-insensitive match found: "${option}"`);
      return option;
    }

    if (normalizedOption.toLowerCase() === strippedAnswer.toLowerCase()) {
      console.log(`✅ Case-insensitive stripped match found: "${option}"`);
      return option;
    }

    if (fullyNormalizedOption.toLowerCase() === fullyNormalizedAnswer.toLowerCase()) {
      console.log(`✅ Fully normalized match found: "${option}"`);
      return option;
    }
  }

  for (const option of options) {
    const normalizedOption = normalizeString(stripOptionPrefix(option));
    const normalizedAnswerStripped = stripOptionPrefix(normalizedAnswer);

    if (normalizedOption.toLowerCase() === normalizedAnswerStripped.toLowerCase()) {
      console.log(`✅ Double-stripped match found: "${option}"`);
      return option;
    }
  }

  for (const option of options) {
    const fullyNormalizedOption = fullyNormalize(option);

    if (fullyNormalizedOption.toLowerCase().includes(fullyNormalizedAnswer.toLowerCase()) ||
        fullyNormalizedAnswer.toLowerCase().includes(fullyNormalizedOption.toLowerCase())) {
      const longer = Math.max(fullyNormalizedOption.length, fullyNormalizedAnswer.length);
      const shorter = Math.min(fullyNormalizedOption.length, fullyNormalizedAnswer.length);

      if (shorter / longer >= 0.8) {
        console.log(`✅ Substring match found (80%+ overlap): "${option}"`);
        return option;
      }
    }
  }

  let bestMatch: { option: string; similarity: number } | null = null;

  for (const option of options) {
    const similarity = calculateSimilarity(fullyNormalize(option), fullyNormalizedAnswer);

    if (similarity >= 0.85) {
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { option, similarity };
      }
    }
  }

  if (bestMatch) {
    console.log(`✅ Fuzzy match found with ${(bestMatch.similarity * 100).toFixed(1)}% similarity: "${bestMatch.option}"`);
    return bestMatch.option;
  }

  console.log('❌ No match found after all strategies');
  return null;
}

function validateAndNormalizeQuestion(q: any, index: number): Question | null {
  try {
    if (!q.question || typeof q.question !== 'string') {
      console.warn(`⚠️ Question ${index + 1}: Missing or invalid question text`);
      return null;
    }

    if (!q.options || !Array.isArray(q.options)) {
      console.warn(`⚠️ Question ${index + 1}: Missing or invalid options array`);
      return null;
    }

    if (q.options.length < 2) {
      console.warn(`⚠️ Question ${index + 1}: Must have at least 2 options`);
      return null;
    }

    if (!q.correct_answer || typeof q.correct_answer !== 'string') {
      console.warn(`⚠️ Question ${index + 1}: Missing or invalid correct answer`);
      return null;
    }

    const normalizedOptions = q.options.map((opt: any) => normalizeString(String(opt)));
    let normalizedCorrectAnswer = normalizeString(q.correct_answer);

    if (!normalizedOptions.includes(normalizedCorrectAnswer)) {
      console.warn(`⚠️ Question ${index + 1}: Exact match failed, attempting smart matching...`);

      const bestMatch = findBestMatch(normalizedCorrectAnswer, normalizedOptions);

      if (bestMatch) {
        normalizedCorrectAnswer = bestMatch;
      } else {
        console.warn(`❌ Question ${index + 1}: Could not match correct answer, skipping question`);
        return null;
      }
    }

    return {
      index,
      question: q.question.trim(),
      options: normalizedOptions,
      correct_answer: normalizedCorrectAnswer,
      explanation: q.explanation ? String(q.explanation).trim() : '',
      topic: q.topic ? String(q.topic).trim() : '',
      type: q.type === 'true_false' ? 'true_false' : 'multiple_choice'
    };
  } catch (error) {
    console.warn(`⚠️ Question ${index + 1}: Validation error:`, error);
    return null;
  }
}

async function extractKeyTopics(text: string, targetLanguage: string, claudeApiKey: string): Promise<string> {
  console.log('🔍 Extracting key topics from large document...');

  const languageInstructions = {
    en: 'Respond in English.',
    ar: 'Respond in Arabic (العربية).',
    fr: 'Respond in French (Français).',
    tr: 'Respond in Turkish (Türkçe).'
  };

  const langInstruction = languageInstructions[targetLanguage as keyof typeof languageInstructions] || languageInstructions.en;

  const prompt = `You are analyzing a document to identify the most important topics for quiz generation. ${langInstruction}

CONTENT TO ANALYZE:
${text.substring(0, 15000)}

YOUR TASK:
Extract and summarize the 8-10 most important topics, concepts, or sections from this content. Focus on:
- Main themes and key concepts
- Important facts, definitions, and principles
- Significant processes, events, or examples
- Critical details that would make good quiz questions

Provide a comprehensive summary that covers diverse aspects of the content, ensuring questions can be generated from different sections. Write in ${targetLanguage === 'ar' ? 'Arabic' : targetLanguage === 'fr' ? 'French' : targetLanguage === 'tr' ? 'Turkish' : 'English'}.

=== REQUIREMENTS ===
- Extract 8-10 most important topics
- Cover diverse aspects of the content
- Focus on quiz-worthy concepts
- Be thorough but concise

=== VALIDATION CHECKLIST ===
Before responding, verify:
✓ 8-10 topics extracted
✓ Topics cover diverse aspects
✓ Topics are quiz-worthy
✓ Summary is comprehensive but concise
✓ Written in ${targetLanguage === 'ar' ? 'Arabic' : targetLanguage === 'fr' ? 'French' : targetLanguage === 'tr' ? 'Turkish' : 'English'}

Format: Return ONLY the extracted key topics and summaries as plain text. Be thorough but concise.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 2000,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    console.warn('⚠️ Topic extraction failed, using original text');
    return text;
  }

  const data = await response.json();
  const extractedTopics = data.content[0].text.trim();

  console.log('✅ Key topics extracted successfully');
  console.log('📊 Extracted topics length:', extractedTopics.length, 'characters');

  return extractedTopics;
}

function buildChunkedPrompt(
  text: string,
  chunkNumber: number,
  totalChunks: number,
  questionsInChunk: number,
  difficulty: 'easy' | 'medium' | 'hard',
  targetLanguage: string,
  usedTopics: string[]
): string {
  const difficultyInstructions = {
    easy: 'Create straightforward questions testing basic recall and understanding. Use simple language.',
    medium: 'Create questions requiring comprehension and application of concepts. Mix recall with reasoning.',
    hard: 'Create challenging questions requiring analysis, synthesis, and critical thinking. Include complex scenarios.'
  };

  const languageInstructions = {
    en: 'Generate all questions, options, explanations, and topics in English.',
    ar: 'Generate all questions, options, explanations, and topics in Arabic (العربية). Use proper Arabic grammar, vocabulary, and sentence structure. Write naturally and fluently in Arabic.',
    fr: 'Generate all questions, options, explanations, and topics in French (Français). Use proper French grammar, vocabulary, and sentence structure. Write naturally and fluently in French.',
    tr: 'Generate all questions, options, explanations, and topics in Turkish (Türkçe). Use proper Turkish grammar, vocabulary, and sentence structure. Write naturally and fluently in Turkish.'
  };

  const langInstruction = languageInstructions[targetLanguage as keyof typeof languageInstructions] || languageInstructions.en;
  const maxTextLength = targetLanguage === 'en' ? 12000 : 10000;

  let topicGuidance = '';
  if (usedTopics.length > 0) {
    topicGuidance = `\nIMPORTANT: This is chunk ${chunkNumber} of ${totalChunks}. Previous chunks covered these topics: ${usedTopics.join(', ')}.
Try to focus on DIFFERENT topics or aspects to ensure variety across all questions. Avoid repeating the same topics.`;
  }

  return `You are an expert quiz creator. Generate EXACTLY ${questionsInChunk} multiple-choice questions.

LANGUAGE: ${langInstruction} - All content must be in ${targetLanguage === 'ar' ? 'Arabic' : targetLanguage === 'fr' ? 'French' : targetLanguage === 'tr' ? 'Turkish' : 'English'}.

DIFFICULTY: ${difficulty}
${difficultyInstructions[difficulty]}

CONTENT:
${text.substring(0, maxTextLength)}
${topicGuidance}

=== REQUIREMENTS ===
1. Generate EXACTLY ${questionsInChunk} questions
2. Each question: clear text, exactly 4 options, one correct answer, brief explanation (1-2 sentences), topic identifier
3. Question quality: test understanding, not just recall. Avoid trivial questions.
4. Options: Make all options plausible. The correct answer should be clearly best, not just technically correct.

=== QUALITY METRICS ===
A good quiz question:
✓ Tests understanding or application, not just recall
✓ Has clear, unambiguous question text
✓ All 4 options are plausible (not obviously wrong)
✓ Correct answer is clearly the best choice
✓ Explanation clarifies why the answer is correct
✓ Topic identifier accurately categorizes the question
✓ Appropriate difficulty level for ${difficulty}
✓ Question is answerable from the provided content

=== JSON FORMAT (CRITICAL) ===
- Start with [ and end with ]
- NO text before [ or after ]
- NO markdown code blocks (no \`\`\`json)
- Use double quotes only
- Escape quotes in strings with \\"
- NO trailing comma after last question
- Options: plain text, NO prefixes like "A)" or "1."
- "correct_answer" must EXACTLY match one option (case-sensitive, character-for-character)

=== EXAMPLE FORMAT ===
[
  {
    "index": 0,
    "question": "What is the primary function of mitochondria?",
    "options": ["Protein synthesis", "Energy production", "DNA replication", "Waste removal"],
    "correct_answer": "Energy production",
    "explanation": "Mitochondria are the powerhouses of the cell, producing ATP through cellular respiration.",
    "topic": "Cell Biology",
    "type": "multiple_choice"
  }
]

=== DO NOT ===
- DO NOT use markdown code blocks (\`\`\`json)
- DO NOT add text before [ or after ]
- DO NOT use "A)", "B)" prefixes in options
- DO NOT add trailing comma after last question
- DO NOT repeat topics from previous chunks: ${usedTopics.join(', ') || 'none'}
- DO NOT create trivial or obvious questions
- DO NOT make correct_answer ambiguous

=== VALIDATION CHECKLIST ===
Before responding, verify:
✓ Exactly ${questionsInChunk} questions
✓ Each correct_answer exactly matches an option
✓ Response starts with [ and ends with ]
✓ No text outside the JSON array
✓ No markdown formatting
✓ Topics are diverse (different from: ${usedTopics.join(', ') || 'none'})
✓ All options are plausible
✓ Questions test understanding, not just recall

RESPOND WITH PURE JSON ONLY - NO MARKDOWN, NO EXPLANATIONS, NO CODE BLOCKS.`;
}

async function generateChunk(
  text: string,
  chunkNumber: number,
  totalChunks: number,
  questionsInChunk: number,
  difficulty: 'easy' | 'medium' | 'hard',
  targetLanguage: string,
  claudeApiKey: string,
  usedTopics: string[]
): Promise<{ questions: Question[], topics: string[] }> {
  console.log(`📦 Chunk ${chunkNumber}/${totalChunks}: Generating ${questionsInChunk} questions...`);

  const prompt = buildChunkedPrompt(text, chunkNumber, totalChunks, questionsInChunk, difficulty, targetLanguage, usedTopics);

  const languageMultipliers: { [key: string]: number } = {
    'en': 1.0,
    'ar': 2.0,
    'fr': 1.5,
    'tr': 1.5
  };
  const langMultiplier = languageMultipliers[targetLanguage] || 1.0;
  const calculatedMaxTokens = Math.min(
    Math.ceil(questionsInChunk * 250 * langMultiplier),
    4096
  );

  console.log(`🤖 Chunk ${chunkNumber}: Calling Claude API`);
  console.log(`   - Model: ${DEFAULT_MODEL}`);
  console.log(`   - Max tokens: ${calculatedMaxTokens}`);
  console.log(`   - Language: ${targetLanguage}`);

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
      temperature: 0.5,
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

  console.log(`📊 Chunk ${chunkNumber}: Response received (${responseText.length} chars)`);

  const rawQuestions = tryParseJSON(responseText);
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new Error(`Chunk ${chunkNumber}: Invalid quiz format returned by AI`);
  }

  const validatedQuestions: Question[] = [];
  const chunkTopics: string[] = [];

  for (let i = 0; i < rawQuestions.length; i++) {
    const validated = validateAndNormalizeQuestion(rawQuestions[i], i);
    if (validated) {
      validatedQuestions.push(validated);
      if (validated.topic && !chunkTopics.includes(validated.topic)) {
        chunkTopics.push(validated.topic);
      }
    }
  }

  console.log(`✅ Chunk ${chunkNumber}: Validated ${validatedQuestions.length}/${questionsInChunk} questions`);
  console.log(`📚 Chunk ${chunkNumber}: Topics covered: ${chunkTopics.join(', ')}`);

  return { questions: validatedQuestions, topics: chunkTopics };
}

async function generateQuizInChunks(
  text: string,
  totalQuestions: number,
  difficulty: 'easy' | 'medium' | 'hard',
  targetLanguage: string,
  claudeApiKey: string,
  userId: string,
  sourceType: string,
  supabase: SupabaseClient
): Promise<Question[]> {
  console.log('🚀 Starting chunked quiz generation');
  console.log(`📊 Target: ${totalQuestions} questions in chunks of ${QUESTIONS_PER_CHUNK}`);

  let processedText = text;

  if (text.length > 10000 && totalQuestions <= 15) {
    console.log('📚 Large document detected, extracting key topics first...');
    processedText = await extractKeyTopics(text, targetLanguage, claudeApiKey);
  }

  const allQuestions: Question[] = [];
  const usedTopics: string[] = [];
  const totalChunks = Math.ceil(totalQuestions / QUESTIONS_PER_CHUNK);

  for (let chunkNum = 1; chunkNum <= totalChunks; chunkNum++) {
    const remainingQuestions = totalQuestions - allQuestions.length;
    const questionsInThisChunk = Math.min(QUESTIONS_PER_CHUNK, remainingQuestions);

    let chunkSuccess = false;
    let lastError: Error | null = null;

    for (let retry = 1; retry <= MAX_CHUNK_RETRIES; retry++) {
      try {
        const { questions, topics } = await generateChunk(
          processedText,
          chunkNum,
          totalChunks,
          questionsInThisChunk,
          difficulty,
          targetLanguage,
          claudeApiKey,
          usedTopics
        );

        if (questions.length > 0) {
          allQuestions.push(...questions);
          usedTopics.push(...topics);
          console.log(`✅ Chunk ${chunkNum}/${totalChunks} completed: ${allQuestions.length}/${totalQuestions} questions generated`);
          chunkSuccess = true;
          break;
        } else {
          throw new Error(`Chunk ${chunkNum}: No valid questions generated`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.error(`❌ Chunk ${chunkNum} attempt ${retry}/${MAX_CHUNK_RETRIES} failed:`, lastError.message);

        try {
          await supabase.from('quiz_generation_errors').insert({
            user_id: userId,
            error_type: 'chunk_generation_failed',
            error_message: lastError.message,
            error_details: {
              chunkNumber: chunkNum,
              totalChunks,
              retryAttempt: retry,
              questionsGenerated: allQuestions.length,
              targetQuestions: totalQuestions,
              targetLanguage,
            },
            source_type: sourceType,
            file_type: null,
            ai_response: null,
            question_count: totalQuestions,
            difficulty: difficulty
          });
        } catch (logError) {
          console.error('⚠️ Failed to log chunk error:', logError);
        }

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

  const finalQuestions = allQuestions.slice(0, totalQuestions).map((q, idx) => ({
    ...q,
    index: idx
  }));

  console.log('🎉 Chunked generation complete!');
  console.log(`📊 Final count: ${finalQuestions.length} questions`);

  return finalQuestions;
}

Deno.serve(async (req: Request) => {
  console.log('🚀 Generate Quiz function started');
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

    // Check if user is admin
    let isAdmin = false;
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', authResult.user.id)
      .maybeSingle();

    isAdmin = profile?.role === 'admin';

    // Check credit balance for non-admin users before processing
    if (!isAdmin) {
      console.log('🔍 Step 2.5: Check credit balance');
      const { data: creditCheck, error: creditError } = await supabase
        .rpc('check_sufficient_credits', {
          p_user_id: authResult.user.id,
          p_estimated_credits: 10 // Estimate minimum credits needed for quiz
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
    const bodyResult = await parseJsonBody<QuizRequest>(req);
    if (bodyResult.error) {
      return bodyResult.error;
    }

    const { text, questionCount, difficulty, sourceType, sourceId, quizTitle, targetLanguage = 'en' } = bodyResult.data;

    console.log('📊 Request parameters:');
    console.log('   - Text length:', text?.length || 0, 'characters');
    console.log('   - Question count:', questionCount);
    console.log('   - Difficulty:', difficulty);
    console.log('   - Target language:', targetLanguage);

    if (!text || text.length < 300) {
      return errorResponse('Text content must be at least 300 characters', 400);
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

    console.log('🤖 Step 5: Generate quiz using chunked approach');
    const questions = await generateQuizInChunks(
      text,
      questionCount,
      difficulty,
      targetLanguage,
      claudeApiKey,
      authResult.user.id,
      sourceType,
      supabase
    );

    console.log('💾 Step 6: Save to database');
    const { data: quizSession, error: insertError } = await supabase
      .from('quiz_sessions')
      .insert({
        user_id: authResult.user.id,
        quiz_title: quizTitle,
        source_type: sourceType,
        source_id: sourceId || null,
        question_count: questions.length,
        time_limit_minutes: null,
        difficulty_level: difficulty,
        questions_json: questions,
        quiz_language: targetLanguage,
        available_languages: [targetLanguage],
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Database error:', insertError);
      return errorResponse(`Failed to save quiz: ${insertError.message}`, 500);
    }

    console.log('✅ Quiz saved successfully, ID:', quizSession.id);

    console.log('📊 Step 7: Deduct credits');
    if (!isAdmin) {
      try {
        const textLength = text.length;
        const estimatedTokens = Math.ceil(textLength / 4);

        console.log(`📊 Usage calculation: ${textLength} chars ≈ ${estimatedTokens} tokens`);

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
        console.error('⚠️ Failed to deduct credits, but quiz was saved:', usageError);
      }
    }

    console.log('🎉 Quiz generation complete!');

    return successResponse({
      quizSessionId: quizSession.id,
      questionCount: questions.length,
      questions: questions,
    });
  } catch (error) {
    console.error('💥 Fatal error in generate-quiz:', error);

    return errorResponse(
      error instanceof Error ? error.message : 'Failed to generate quiz',
      500
    );
  }
});
