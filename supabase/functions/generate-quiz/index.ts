/// <reference path="../_shared/deno.d.ts" />
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.3';

const DEFAULT_MODEL = 'claude-3-haiku-20240307';
const QUESTIONS_PER_CHUNK = 3;
const MAX_CHUNK_RETRIES = 3;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface QuizRequest {
  text: string;
  questionCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
  sourceType: 'uploaded_document' | 'library_item';
  sourceId?: string;
  quizTitle: string;
  targetLanguage?: string;
  /** Subset of question types to generate (saves credits). Omitted = all types. */
  questionTypes?: string[];
}

type QuestionType = 'multiple_choice' | 'true_false' | 'fill_in_blank' | 'open_ended';

const ALL_QUESTION_TYPES: QuestionType[] = ['multiple_choice', 'true_false', 'fill_in_blank', 'open_ended'];

function parseQuestionTypes(raw: string[] | undefined): QuestionType[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [...ALL_QUESTION_TYPES];
  const allowed = new Set<string>(ALL_QUESTION_TYPES);
  const out = raw.filter((x): x is QuestionType => typeof x === 'string' && allowed.has(x));
  return out.length > 0 ? out : [...ALL_QUESTION_TYPES];
}

function sequenceTypesForChunk(allowed: QuestionType[], count: number): QuestionType[] {
  if (allowed.length === 0) return Array.from({ length: count }, () => 'multiple_choice' as QuestionType);
  return Array.from({ length: count }, (_, i) => allowed[i % allowed.length]);
}

interface Question {
  index: number;
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  topic: string;
  type: QuestionType;
}

// ─── Text segment interface ───────────────────────────────────────────────────
// Each chunk of the document gets its own text slice, which forces the model
// to focus on genuinely different content rather than re-reading the same passage.

interface DocumentSegment {
  text: string;
  segmentIndex: number;
  totalSegments: number;
}

// ─── String utilities ─────────────────────────────────────────────────────────

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

// ─── Document segmentation ────────────────────────────────────────────────────
// Split the source text into as many segments as there are chunks so that each
// chunk call receives a genuinely different slice of content.

function segmentDocument(text: string, totalChunks: number, targetLanguage: string): DocumentSegment[] {
  const maxCharsPerSegment = targetLanguage === 'en' ? 12000 : 10000;

  // If the document is short enough to fit in one segment, replicate it for all
  // chunks but rely on the question-history mechanism to ensure variety.
  if (text.length <= maxCharsPerSegment || totalChunks === 1) {
    return Array.from({ length: totalChunks }, (_, i) => ({
      text,
      segmentIndex: i,
      totalSegments: totalChunks,
    }));
  }

  // Split on paragraph boundaries where possible so we don't cut mid-sentence.
  const paragraphs = text.split(/\n\n+/);
  const segments: DocumentSegment[] = [];
  const targetSegmentLength = Math.ceil(text.length / totalChunks);

  let current = '';
  let segmentIndex = 0;

  for (const para of paragraphs) {
    if (
      current.length + para.length > targetSegmentLength &&
      current.length > 0 &&
      segmentIndex < totalChunks - 1
    ) {
      segments.push({ text: current.trim(), segmentIndex, totalSegments: totalChunks });
      segmentIndex++;
      current = para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }

  // Last segment gets whatever remains
  if (current.trim()) {
    segments.push({ text: current.trim(), segmentIndex, totalSegments: totalChunks });
  }

  // If we ended up with fewer segments than chunks (e.g. few paragraphs),
  // pad by reusing segments cyclically — at least different slices are attempted.
  while (segments.length < totalChunks) {
    const src = segments[segments.length % segments.length];
    segments.push({ ...src, segmentIndex: segments.length, totalSegments: totalChunks });
  }

  return segments.slice(0, totalChunks);
}

// ─── JSON parsing ─────────────────────────────────────────────────────────────

function smartRepairJSON(text: string): string {
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
    const lastQuoteIndex = repaired.lastIndexOf('"');
    if (lastQuoteIndex !== -1) {
      const afterQuote = repaired.substring(lastQuoteIndex + 1);
      if (!afterQuote.match(/^\s*[,}\]]/)) repaired = repaired + '"';
    }
  }

  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) repaired += ']'.repeat(openBrackets - closeBrackets);

  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  if (openBraces > closeBraces) repaired += '}'.repeat(openBraces - closeBraces);

  return repaired;
}

function extractCompleteQuestions(text: string): string {
  const sanitized = advancedSanitizeJSON(text);
  let depth = 0, inString = false, escape = false;
  let result = '', lastCompleteQuestionEnd = -1;

  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i];

    if (escape) { result += char; escape = false; continue; }
    if (char === '\\' && inString) { escape = true; result += char; continue; }
    if (char === '"' && !escape) { inString = !inString; result += char; continue; }

    if (!inString) {
      if (char === '[' || char === '{') { depth++; result += char; }
      else if (char === '}') {
        depth--; result += char;
        if (depth === 1) { lastCompleteQuestionEnd = i; }
      } else if (char === ']') {
        depth--; result += char;
        if (depth === 0) return result;
      } else { result += char; }
    } else { result += char; }
  }

  if (lastCompleteQuestionEnd > 0 && depth > 0) {
    return result.substring(0, lastCompleteQuestionEnd + 1) + ']';
  }
  return result;
}

function advancedSanitizeJSON(text: string): string {
  let cleaned = text.trim();
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
  if (jsonStart !== Infinity && jsonStart > 0) cleaned = cleaned.substring(jsonStart);

  const lastBracket = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
  if (lastBracket !== -1 && lastBracket < cleaned.length - 1) {
    const afterContent = cleaned.substring(lastBracket + 1).trim();
    if (afterContent.length > 0 && !afterContent.startsWith(',')) {
      cleaned = cleaned.substring(0, lastBracket + 1);
    }
  }

  cleaned = cleaned.replace(/,(\s*[\]}])/g, '$1');
  // Strip C0 control characters from model output (intentional ASCII control class)
  // eslint-disable-next-line no-control-regex -- sanitize non-printable chars before JSON.parse
  cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  return cleaned;
}

function tryParseJSON(text: string): unknown {
  const strategies: Array<{ name: string; fn: () => unknown }> = [
    { name: 'Direct Parse', fn: () => JSON.parse(text) },
    { name: 'Sanitized Parse', fn: () => JSON.parse(advancedSanitizeJSON(text)) },
    {
      name: 'Smart Repair + Parse',
      fn: () => JSON.parse(smartRepairJSON(advancedSanitizeJSON(text))),
    },
    {
      name: 'Extract Complete Questions + Parse',
      fn: () => JSON.parse(extractCompleteQuestions(text)),
    },
    {
      name: 'Extract Complete Questions + Smart Repair',
      fn: () => JSON.parse(smartRepairJSON(extractCompleteQuestions(text))),
    },
    {
      name: 'Array Extraction',
      fn: () => {
        const m = text.match(/\[[\s\S]*\]/);
        if (!m) throw new Error('No array found');
        return JSON.parse(m[0]);
      },
    },
    {
      name: 'Array Extraction + Smart Repair',
      fn: () => {
        const m = text.match(/\[[\s\S]*\]/);
        if (!m) throw new Error('No array found');
        return JSON.parse(smartRepairJSON(m[0]));
      },
    },
    {
      name: 'Aggressive Complete Question Extraction',
      fn: () =>
        JSON.parse(smartRepairJSON(extractCompleteQuestions(advancedSanitizeJSON(text)))),
    },
  ];

  const errors: Array<{ strategy: string; error: string }> = [];
  for (const strategy of strategies) {
    try {
      return strategy.fn();
    } catch (e) {
      errors.push({ strategy: strategy.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  throw new Error(
    `All JSON parsing strategies failed. First error: ${errors[0]?.error || 'Unknown'}`
  );
}

// ─── Answer matching ──────────────────────────────────────────────────────────

function stripOptionPrefix(str: string): string {
  return str.replace(/^[A-Da-d][).\]:]\s*/, '').replace(/^[1-4][).\]:]\s*/, '').trim();
}

function removePunctuation(str: string): string {
  return str.replace(/[.,;:!?'"()-]+$/g, '').replace(/^[.,;:!?'"()-]+/g, '').trim();
}

function fullyNormalize(str: string): string {
  return removePunctuation(stripOptionPrefix(normalizeString(str)));
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
  for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      matrix[i][j] =
        str2[i - 1] === str1[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[str2.length][str1.length];
}

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase(), s2 = str2.toLowerCase();
  if (s1 === s2) return 1.0;
  const longer = s1.length > s2.length ? s1 : s2;
  if (longer.length === 0) return 1.0;
  return (longer.length - levenshteinDistance(s1, s2)) / longer.length;
}

function findBestMatch(correctAnswer: string, options: string[]): string | null {
  const norm = normalizeString(correctAnswer);
  const stripped = stripOptionPrefix(norm);
  const full = fullyNormalize(correctAnswer);

  for (const option of options) {
    const o = normalizeString(option);
    if (o === norm || o === stripped || o.toLowerCase() === norm.toLowerCase() ||
        o.toLowerCase() === stripped.toLowerCase() || fullyNormalize(option).toLowerCase() === full.toLowerCase()) {
      return option;
    }
  }

  for (const option of options) {
    const o = normalizeString(stripOptionPrefix(option));
    if (o.toLowerCase() === stripOptionPrefix(norm).toLowerCase()) return option;
  }

  for (const option of options) {
    const fo = fullyNormalize(option);
    if (fo.toLowerCase().includes(full.toLowerCase()) || full.toLowerCase().includes(fo.toLowerCase())) {
      const longer = Math.max(fo.length, full.length);
      const shorter = Math.min(fo.length, full.length);
      if (shorter / longer >= 0.8) return option;
    }
  }

  let bestMatch: { option: string; similarity: number } | null = null;
  for (const option of options) {
    const similarity = calculateSimilarity(fullyNormalize(option), full);
    if (similarity >= 0.85 && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { option, similarity };
    }
  }

  return bestMatch?.option ?? null;
}

// ─── Question validation ──────────────────────────────────────────────────────

function coerceQuestionType(raw: unknown): QuestionType {
  if (raw === 'true_false') return 'true_false';
  if (raw === 'fill_in_blank') return 'fill_in_blank';
  if (raw === 'open_ended') return 'open_ended';
  return 'multiple_choice';
}

function validateAndNormalizeQuestion(q: unknown, index: number): Question | null {
  try {
    if (typeof q !== 'object' || q === null) return null;
    const o = q as Record<string, unknown>;
    if (!o.question || typeof o.question !== 'string') return null;
    if (!o.correct_answer || typeof o.correct_answer !== 'string') return null;

    const declared = coerceQuestionType(o.type);
    const topic = o.topic != null ? String(o.topic).trim() : '';
    const explanation = o.explanation != null ? String(o.explanation).trim() : '';

    if (declared === 'fill_in_blank' || declared === 'open_ended') {
      const optsRaw = Array.isArray(o.options) ? o.options.map((opt) => normalizeString(String(opt))) : [];
      const question = o.question.trim();
      const correct = normalizeString(o.correct_answer);
      if (!question || !correct) return null;
      return {
        index,
        question,
        options: optsRaw,
        correct_answer: correct,
        explanation,
        topic,
        type: declared,
      };
    }

    if (!Array.isArray(o.options) || o.options.length < 2) return null;

    const normalizedOptions = o.options.map((opt) => normalizeString(String(opt)));
    let normalizedCorrectAnswer = normalizeString(o.correct_answer);

    if (!normalizedOptions.includes(normalizedCorrectAnswer)) {
      const bestMatch = findBestMatch(normalizedCorrectAnswer, normalizedOptions);
      if (bestMatch) normalizedCorrectAnswer = bestMatch;
      else return null;
    }

    const type: QuestionType = declared === 'true_false' ? 'true_false' : 'multiple_choice';

    return {
      index,
      question: o.question.trim(),
      options: normalizedOptions,
      correct_answer: normalizedCorrectAnswer,
      explanation,
      topic,
      type,
    };
  } catch {
    return null;
  }
}

// ─── Duplicate detection ──────────────────────────────────────────────────────
// Prevents semantically equivalent questions from appearing across chunks.

function isDuplicateQuestion(newQuestion: string, existingQuestions: Question[]): boolean {
  const normalizedNew = fullyNormalize(newQuestion).toLowerCase();
  for (const existing of existingQuestions) {
    const normalizedExisting = fullyNormalize(existing.question).toLowerCase();
    if (calculateSimilarity(normalizedNew, normalizedExisting) >= 0.75) return true;
  }
  return false;
}

// ─── Topic extraction ─────────────────────────────────────────────────────────
// For large documents only. Returns an array of distinct topic summaries,
// one per planned chunk, so each chunk prompt targets a different section.

async function extractTopicSegments(
  text: string,
  totalChunks: number,
  targetLanguage: string,
  claudeApiKey: string
): Promise<string[]> {
  console.log('Extracting topic segments from large document...');

  const langName =
    targetLanguage === 'ar' ? 'Arabic' :
    targetLanguage === 'fr' ? 'French' :
    targetLanguage === 'tr' ? 'Turkish' : 'English';

  const prompt = `You are analyzing a document to plan quiz generation. Respond in ${langName}.

CONTENT:
${text.substring(0, 15000)}

YOUR TASK:
Divide the content into exactly ${totalChunks} distinct topic areas. For each topic area:
- Give it a clear label
- Write 2-3 sentences summarizing the key facts and concepts in that area
- Make sure each area covers DIFFERENT content from the others

Return ONLY a JSON array of ${totalChunks} strings, each string being the topic label and summary.
Example format: ["Topic 1: summary...", "Topic 2: summary...", ...]

No markdown, no code blocks, just the JSON array.`;

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
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    console.warn('Topic segment extraction failed, falling back to text slicing');
    return [];
  }

  const data = await response.json();
  const raw = (data?.content?.[0]?.text || '').trim();

  try {
    const parsed = tryParseJSON(raw);
    if (Array.isArray(parsed) && parsed.length >= totalChunks) {
      console.log(`Extracted ${parsed.length} topic segments`);
      return parsed.slice(0, totalChunks).map(String);
    }
  } catch {
    console.warn('Could not parse topic segments, falling back to text slicing');
  }

  return [];
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildChunkedPrompt(
  segment: DocumentSegment,
  questionsInChunk: number,
  difficulty: 'easy' | 'medium' | 'hard',
  targetLanguage: string,
  previousQuestions: Question[],   // Full question objects so we can show exact text
  topicFocus: string,               // From topic segment extraction, may be empty
  typesSequence: QuestionType[]
): string {
  const difficultyInstructions = {
    easy: 'Create straightforward questions testing basic recall and understanding. Use simple language.',
    medium: 'Create questions requiring comprehension and application of concepts. Mix recall with reasoning.',
    hard: 'Create challenging questions requiring analysis, synthesis, and critical thinking. Include complex scenarios.',
  };

  const languageInstructions: Record<string, string> = {
    en: 'Generate all questions, options, explanations, and topics in English.',
    ar: 'Generate all questions, options, explanations, and topics in Arabic (العربية). Use proper Arabic grammar and vocabulary.',
    fr: 'Generate all questions, options, explanations, and topics in French (Français). Use proper French grammar and vocabulary.',
    tr: 'Generate all questions, options, explanations, and topics in Turkish (Türkçe). Use proper Turkish grammar and vocabulary.',
  };

  const langInstruction = languageInstructions[targetLanguage] || languageInstructions.en;
  const langName = targetLanguage === 'ar' ? 'Arabic' : targetLanguage === 'fr' ? 'French' : targetLanguage === 'tr' ? 'Turkish' : 'English';

  // Build a list of already-asked questions to give the model precise context.
  const alreadyAsked = previousQuestions.length > 0
    ? previousQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')
    : 'None yet.';

  const topicFocusSection = topicFocus
    ? `\nFOCUS AREA FOR THIS SECTION:\n${topicFocus}\nBase your questions primarily on this focus area and the content below.\n`
    : `\nThis is section ${segment.segmentIndex + 1} of ${segment.totalSegments}. Focus on content unique to this section.\n`;

  const typePlan = typesSequence
    .map((t, i) => `  Question ${i + 1}: type MUST be "${t}"`)
    .join('\n');

  const typeRules = `
=== QUESTION TYPES (STRICT ORDER) ===
${typePlan}

Per-type rules:
- "multiple_choice": exactly 4 options in "options", "correct_answer" must exactly equal one option string.
- "true_false": exactly 2 options (e.g. "True" and "False"), "correct_answer" must equal one of them.
- "fill_in_blank": "question" must contain ____ as the blank; "correct_answer" is the short text that fills the blank; "options" may be [].
- "open_ended": "options" must be []; "correct_answer" is a concise ideal / rubric answer (1-3 sentences) for grading; "question" asks for a short written response.
`;

  return `You are an expert quiz creator. Generate EXACTLY ${questionsInChunk} questions following the type plan below.

LANGUAGE: ${langInstruction}
DIFFICULTY: ${difficulty} — ${difficultyInstructions[difficulty]}
${topicFocusSection}
CONTENT FOR THIS SECTION:
${segment.text}

QUESTIONS ALREADY GENERATED (DO NOT repeat or closely rephrase any of these):
${alreadyAsked}
${typeRules}

=== STRICT DIVERSITY RULES ===
- Your questions MUST test different facts, concepts, or ideas than the ones already generated above
- Do NOT ask about anything already covered by the questions listed above
- If the content overlap is unavoidable, choose the least-tested angle or specific detail
- Each of your ${questionsInChunk} questions must also test a different thing from each other

=== JSON FORMAT (CRITICAL) ===
- Start with [ and end with ]
- NO text before [ or after ]
- NO markdown code blocks
- Use double quotes only
- Escape internal quotes with \\"
- NO trailing comma after last item
- For MCQ/TF: options plain text, NO prefixes like "A)" or "1."
- For MCQ/TF: "correct_answer" must EXACTLY match one option (case-sensitive)

=== EXAMPLE (shape only; your types must follow the plan above) ===
[
  {
    "index": 0,
    "question": "What is the primary function of mitochondria?",
    "options": ["Protein synthesis", "Energy production", "DNA replication", "Waste removal"],
    "correct_answer": "Energy production",
    "explanation": "Mitochondria produce ATP through cellular respiration.",
    "topic": "Cell Biology",
    "type": "multiple_choice"
  }
]

=== VALIDATION CHECKLIST ===
✓ Exactly ${questionsInChunk} questions
✓ Each item's "type" matches the type plan order for that index
✓ None repeat or closely rephrase the already-generated questions listed above
✓ Response starts with [ and ends with ]
✓ No markdown formatting
✓ All content in ${langName}

RESPOND WITH PURE JSON ONLY.`;
}

// ─── Chunk generation ─────────────────────────────────────────────────────────

async function generateChunk(
  segment: DocumentSegment,
  chunkNumber: number,
  totalChunks: number,
  questionsInChunk: number,
  difficulty: 'easy' | 'medium' | 'hard',
  targetLanguage: string,
  claudeApiKey: string,
  previousQuestions: Question[],
  topicFocus: string,
  allowedQuestionTypes: QuestionType[]
): Promise<{ questions: Question[]; tokens: { input: number; output: number; total: number } }> {
  console.log(`Chunk ${chunkNumber}/${totalChunks}: generating ${questionsInChunk} questions (${segment.text.length} chars of content)`);

  const typesSequence = sequenceTypesForChunk(allowedQuestionTypes, questionsInChunk);
  const prompt = buildChunkedPrompt(
    segment,
    questionsInChunk,
    difficulty,
    targetLanguage,
    previousQuestions,
    topicFocus,
    typesSequence
  );

  const languageMultipliers: Record<string, number> = { en: 1.0, ar: 2.0, fr: 1.5, tr: 1.5 };
  const langMultiplier = languageMultipliers[targetLanguage] || 1.0;
  const calculatedMaxTokens = Math.min(Math.ceil(questionsInChunk * 250 * langMultiplier), 4096);

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
      temperature: 0.7, // Slightly higher temperature encourages more varied output
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!claudeResponse.ok) {
    const errorText = await claudeResponse.text();
    throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText}`);
  }

  const claudeData = await claudeResponse.json();
  const responseText = (claudeData?.content?.[0]?.text || '').trim();
  const inputTokens = claudeData?.usage?.input_tokens || 0;
  const outputTokens = claudeData?.usage?.output_tokens || 0;
  const tokens = { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens };

  const rawQuestions = tryParseJSON(responseText);
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new Error(`Chunk ${chunkNumber}: Invalid quiz format returned by AI`);
  }

  const validatedQuestions: Question[] = [];

  for (let i = 0; i < rawQuestions.length; i++) {
    const validated = validateAndNormalizeQuestion(rawQuestions[i], i);
    if (!validated) continue;

    // Reject questions that are semantically too close to ones we already have
    if (isDuplicateQuestion(validated.question, previousQuestions)) {
      console.warn(`Chunk ${chunkNumber}: Rejected duplicate question — "${validated.question.substring(0, 60)}..."`);
      continue;
    }

    validatedQuestions.push(validated);
  }

  console.log(`Chunk ${chunkNumber}: accepted ${validatedQuestions.length}/${questionsInChunk} questions`);

  return { questions: validatedQuestions, tokens };
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

async function generateQuizInChunks(
  text: string,
  totalQuestions: number,
  difficulty: 'easy' | 'medium' | 'hard',
  targetLanguage: string,
  claudeApiKey: string,
  userId: string,
  sourceType: string,
  supabase: SupabaseClient,
  allowedQuestionTypes: QuestionType[]
): Promise<{ questions: Question[]; tokensUsed: number }> {
  console.log(`Starting quiz generation: ${totalQuestions} questions, difficulty=${difficulty}, lang=${targetLanguage}`);

  const totalChunks = Math.ceil(totalQuestions / QUESTIONS_PER_CHUNK);

  // Step 1: Split the document into per-chunk segments
  const segments = segmentDocument(text, totalChunks, targetLanguage);
  console.log(`Document split into ${segments.length} segments`);

  // Step 2: For large documents, extract distinct topic focuses per segment
  let topicFocuses: string[] = [];
  if (text.length > 8000 && totalChunks > 1) {
    topicFocuses = await extractTopicSegments(text, totalChunks, targetLanguage, claudeApiKey);
  }

  const allQuestions: Question[] = [];
  let tokensUsedTotal = 0;

  for (let chunkNum = 1; chunkNum <= totalChunks; chunkNum++) {
    const segment = segments[chunkNum - 1];
    const topicFocus = topicFocuses[chunkNum - 1] || '';
    const remainingQuestions = totalQuestions - allQuestions.length;
    if (remainingQuestions <= 0) break;

    const questionsInThisChunk = Math.min(QUESTIONS_PER_CHUNK, remainingQuestions);
    let chunkSuccess = false;

    for (let retry = 1; retry <= MAX_CHUNK_RETRIES; retry++) {
      try {
        const { questions, tokens } = await generateChunk(
          segment,
          chunkNum,
          totalChunks,
          questionsInThisChunk,
          difficulty,
          targetLanguage,
          claudeApiKey,
          allQuestions,      // Pass full question list for duplicate checking
          topicFocus,
          allowedQuestionTypes
        );

        tokensUsedTotal += tokens.total;

        if (questions.length > 0) {
          allQuestions.push(...questions);
          console.log(`Chunk ${chunkNum}/${totalChunks} complete: ${allQuestions.length}/${totalQuestions} total`);
          chunkSuccess = true;
          break;
        } else {
          throw new Error(`Chunk ${chunkNum}: No valid non-duplicate questions generated`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Chunk ${chunkNum} attempt ${retry}/${MAX_CHUNK_RETRIES} failed: ${msg}`);

        try {
          await supabase.from('quiz_generation_errors').insert({
            user_id: userId,
            error_type: 'chunk_generation_failed',
            error_message: msg,
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
            difficulty,
          });
        } catch (logError) {
          console.error('Failed to log chunk error:', logError);
        }

        if (retry === MAX_CHUNK_RETRIES) {
          throw new Error(`Chunk ${chunkNum} failed after ${MAX_CHUNK_RETRIES} attempts: ${msg}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 1000 * retry));
      }
    }

    if (!chunkSuccess) {
      throw new Error(`Failed to generate chunk ${chunkNum}/${totalChunks}`);
    }
  }

  const finalQuestions = allQuestions.slice(0, totalQuestions).map((q, idx) => ({ ...q, index: idx }));

  console.log(`Generation complete: ${finalQuestions.length} questions, ${tokensUsedTotal} tokens`);

  return { questions: finalQuestions, tokensUsed: tokensUsedTotal };
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  console.log('Generate Quiz function started:', new Date().toISOString());

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error('Unauthorized: Invalid or expired token');

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const isAdmin = profile?.role === 'admin';

    const requestData: QuizRequest = await req.json();
    const {
      text,
      questionCount,
      difficulty,
      sourceType,
      sourceId,
      quizTitle,
      targetLanguage = 'en',
      questionTypes: questionTypesRaw,
    } = requestData;
    const allowedQuestionTypes = parseQuestionTypes(questionTypesRaw);

    if (!text || text.length < 300) throw new Error('Text content must be at least 300 characters');
    if (questionCount < 5 || questionCount > 50) throw new Error('Question count must be between 5 and 50');

    const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!claudeApiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

    if (!isAdmin) {
      const languageMultipliers: Record<string, number> = { en: 1.0, ar: 2.0, fr: 1.5, tr: 1.5 };
      const langMult = languageMultipliers[targetLanguage] || 1.0;
      const estimatedTokens = Math.ceil(questionCount * 900 * langMult);
      const estimatedCredits = Math.ceil(estimatedTokens / 1000);

      const { data: creditCheck, error: creditError } = await supabase.rpc('check_sufficient_credits', {
        p_user_id: user.id,
        p_estimated_credits: Math.max(10, estimatedCredits),
      });

      if (creditError) console.error('Failed to check credits:', creditError);
      else if (creditCheck && !creditCheck.sufficient) {
        const cycleEnd = creditCheck.cycle_end;
        throw new Error(
          `You don't have enough credits to complete this action. Your credits will refresh on ${new Date(cycleEnd).toLocaleDateString()}.`
        );
      }
    }

    const { questions, tokensUsed } = await generateQuizInChunks(
      text,
      questionCount,
      difficulty,
      targetLanguage,
      claudeApiKey,
      user.id,
      sourceType,
      supabase,
      allowedQuestionTypes
    );

    const { data: quizSession, error: insertError } = await supabase
      .from('quiz_sessions')
      .insert({
        user_id: user.id,
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

    if (insertError) throw new Error(`Failed to save quiz: ${insertError.message}`);

    if (!isAdmin) {
      try {
        const { data: deductResult, error: deductError } = await supabase.rpc('deduct_credits_atomic', {
          p_user_id: user.id,
          p_tokens_used: tokensUsed,
          p_operation_type: 'deduction',
        });

        if (deductError) {
          console.error('Failed to deduct credits:', deductError);
        } else if (deductResult?.success) {
          console.log(`Credits deducted: ${deductResult.credits_deducted}, remaining: ${deductResult.credits_remaining}`);

          if (deductResult.notify_30_percent || deductResult.notify_10_percent) {
            const percentage = deductResult.notify_10_percent ? 10 : 30;
            const message = `You have ${deductResult.credits_remaining} credits remaining (${percentage}% left). They will refresh on ${new Date(deductResult.cycle_end).toLocaleDateString()}.`;
            await supabase.from('notifications').insert({
              user_id: user.id,
              notification_type: 'admin_notification',
              message,
              is_read: false,
            });
          }
        }
      } catch (usageError) {
        console.error('Failed to deduct credits, but quiz was saved:', usageError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, quizSessionId: quizSession.id, questionCount: questions.length, questions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Fatal error in generate-quiz:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to generate quiz' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});