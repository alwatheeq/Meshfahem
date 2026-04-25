/// <reference path="../_shared/deno.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.54.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.54.0';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'claude-3-haiku-20240307';
const MAX_TOKENS_HARD_LIMIT = 4096;
const ANTHROPIC_TIMEOUT_MS = 45000;
const MAX_RETRIES = 3;

/** Aligns with app `CONFIG.CHARS_PER_CHUNK` — max cleaned chars sent to the model per summary request. */
const SUMMARY_MAX_INPUT_CHARS = 14000;

const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English',
  ar: 'Arabic (العربية)',
  fr: 'French (Français)',
  tr: 'Turkish (Türkçe)',
};

// ─── CORS ─────────────────────────────────────────────────────────────────────

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? '*';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// ─── Text cleaning ────────────────────────────────────────────────────────────

function cleanText(text: string): string {
  let s = text;

  s = s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0]/g, ' ')
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '- ');

  s = s.replace(/(\w)-\n(\w)/g, '$1$2');
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/\n\s*\n\s*\n+/g, '\n\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");

  return s.trim();
}

// ─── Navigation slide stripping ───────────────────────────────────────────────
// PPTX files extracted via markitdown contain slide markers:
//   <!-- Slide number: N -->
//
// Section-divider and table-of-contents slides have almost no words — they
// are titles and bullet-point topic labels with no explanatory content.
// Sending these to the model causes it to anchor its summary on the overview
// slide rather than the actual content slides (which is exactly what produced
// the 11-bullet surface-level summary from a 33-slide deck).
//
// This function removes any slide block whose meaningful word count is below
// MIN_CONTENT_WORDS. For PDFs and DOCX there are no slide markers so the
// function returns the text unchanged.

const MIN_CONTENT_WORDS = 40;

function stripNavigationSlides(text: string): { cleaned: string; removedCount: number } {
  if (!text.includes('<!-- Slide number:')) {
    return { cleaned: text, removedCount: 0 };
  }

  // Split on slide markers, preserving the marker with each block
  const slideBlocks = text.split(/(<!-- Slide number: \d+ -->)/);

  const kept: string[] = [];
  let removedCount = 0;
  let i = 0;

  while (i < slideBlocks.length) {
    const block = slideBlocks[i];

    if (/^<!-- Slide number: \d+ -->$/.test(block.trim())) {
      const marker = block;
      const content = slideBlocks[i + 1] ?? '';
      i += 2;

      // Strip image refs and nested comments before counting words
      const textOnly = content
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/<!--.*?-->/g, '')
        .replace(/### Notes:.*/gs, '');

      const wordCount = textOnly.trim().split(/\s+/).filter(Boolean).length;

      if (wordCount >= MIN_CONTENT_WORDS) {
        kept.push(marker + content);
      } else {
        removedCount++;
      }
    } else {
      if (block.trim()) kept.push(block);
      i++;
    }
  }

  return { cleaned: kept.join(''), removedCount };
}

// ─── Speaker notes stripping ──────────────────────────────────────────────────
// markitdown includes "### Notes:" sections per slide. These are presenter
// cue text — not academic content — and waste tokens. Strip before sending.

function stripSpeakerNotes(text: string): string {
  return text.replace(/### Notes:[\s\S]*?(?=<!-- Slide number:|$)/g, '');
}

// ─── Text quality assessment ──────────────────────────────────────────────────

interface QualityReport {
  score: number;
  wordCount: number;
  warnings: string[];
}

function assessTextQuality(text: string): QualityReport {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentenceCount = sentences.length;
  const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0;
  const uniqueWords = new Set(words.map((w) => w.toLowerCase())).size;
  const uniqueRatio = wordCount > 0 ? uniqueWords / wordCount : 0;

  const warnings: string[] = [];
  let score = 100;

  if (wordCount < 50) { warnings.push(`Very low word count (${wordCount})`); score -= 30; }
  else if (wordCount < 100) { warnings.push(`Low word count (${wordCount})`); score -= 15; }
  if (sentenceCount < 5) { warnings.push(`Very few sentences (${sentenceCount})`); score -= 20; }
  if (avgWordsPerSentence < 3) { warnings.push('Sentences too short — likely headings or fragments'); score -= 15; }
  if (uniqueRatio < 0.3) { warnings.push('Low vocabulary diversity'); score -= 15; }

  const shortWordRatio = wordCount > 0 ? words.filter((w) => w.length <= 2).length / wordCount : 0;
  if (shortWordRatio > 0.6) { warnings.push('Too many very short words'); score -= 20; }

  return { score: Math.max(0, score), wordCount, warnings };
}

// ─── Content hash ─────────────────────────────────────────────────────────────

async function hashContent(text: string, action: string, language: string): Promise<string> {
  const input = `${action}:${language}:${text.trim()}`;
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Anthropic client ─────────────────────────────────────────────────────────

interface AnthropicSuccess {
  output: string;
  tokens: { input: number; output: number; total: number };
}

interface AnthropicError {
  error: string;
  /** When set (4xx from Anthropic), handlers may return this HTTP status instead of 500. */
  statusCode?: number;
}

type AnthropicResult = AnthropicSuccess | AnthropicError;

function getAnthropicApiKey(usageChannel: string | undefined): string | null {
  const primary = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
  if (usageChannel === 'academics') {
    const dedicated = Deno.env.get('ANTHROPIC_API_KEY_ACADEMICS')?.trim();
    return dedicated || primary || null;
  }
  return primary || null;
}

function anthropicErrorHttpStatus(result: AnthropicResult): number {
  if (!('error' in result)) return 500;
  const sc = result.statusCode;
  if (typeof sc === 'number' && sc >= 400 && sc < 500) return sc;
  return 500;
}

async function callAnthropic(
  prompt: string,
  model: string,
  maxTokens: number,
  usageChannel?: string
): Promise<AnthropicResult> {
  const apiKey = getAnthropicApiKey(usageChannel);
  if (!apiKey) return { error: 'Missing ANTHROPIC_API_KEY environment variable' };

  const safeMaxTokens = Math.min(maxTokens, MAX_TOKENS_HARD_LIMIT);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: safeMaxTokens,
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 529 || response.status >= 500) {
        const waitMs = 1000 * Math.pow(2, attempt);
        console.warn(`Anthropic ${response.status} on attempt ${attempt + 1}, retrying in ${waitMs}ms`);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        const errorText = await response.text();
        return { error: `Anthropic API error ${response.status} after ${MAX_RETRIES} attempts: ${errorText}` };
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status >= 400 && response.status < 500) {
          return {
            error: `Anthropic API error ${response.status}: ${errorText}`,
            statusCode: response.status,
          };
        }
        return { error: `Anthropic API error ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      const output = data?.content?.[0]?.text || '';
      const inputTokens = data?.usage?.input_tokens || 0;
      const outputTokens = data?.usage?.output_tokens || 0;

      return { output, tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens } };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof Error && err.name === 'AbortError') return { error: 'Request timeout — Anthropic API took too long to respond' };
      if (attempt < MAX_RETRIES - 1) {
        const waitMs = 1000 * Math.pow(2, attempt);
        console.warn(`Request error on attempt ${attempt + 1}, retrying in ${waitMs}ms: ${msg}`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      return { error: `Request failed after ${MAX_RETRIES} attempts: ${msg}` };
    }
  }

  return { error: 'Exhausted all retry attempts' };
}

// ─── Credit helpers ───────────────────────────────────────────────────────────

async function checkCredits(
  supabase: SupabaseClient,
  userId: string,
  estimatedCredits: number
): Promise<{ sufficient: boolean; message?: string }> {
  const { data, error } = await supabase.rpc('check_sufficient_credits', {
    p_user_id: userId,
    p_estimated_credits: estimatedCredits,
  });

  if (error) {
    console.error('Credit check error:', error);
    return { sufficient: true };
  }

  if (data && !data.sufficient) {
    return {
      sufficient: false,
      message: `You don't have enough credits. Your credits will refresh on ${new Date(data.cycle_end).toLocaleDateString()}.`,
    };
  }

  return { sufficient: true };
}

async function deductCredits(supabase: SupabaseClient, userId: string, tokensUsed: number): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('deduct_credits_atomic', {
      p_user_id: userId,
      p_tokens_used: tokensUsed,
      p_operation_type: 'deduction',
    });

    if (error) { console.error('Credit deduction error:', error); return; }

    if (data?.success) {
      console.log(`Credits deducted: ${data.credits_deducted}, remaining: ${data.credits_remaining}`);

      if (data.notify_30_percent || data.notify_10_percent) {
        const percentage = data.notify_10_percent ? 10 : 30;
        await supabase.from('notifications').insert({
          user_id: userId,
          notification_type: 'admin_notification',
          message: `You have ${data.credits_remaining} credits remaining (${percentage}% left). They will refresh on ${new Date(data.cycle_end).toLocaleDateString()}.`,
          is_read: false,
        });
      }
    }
  } catch (err) {
    console.error('Credit deduction threw unexpectedly:', err);
  }
}

function estimateCredits(textLength: number, expectedOutputTokens: number): number {
  const estimatedInputTokens = Math.ceil(textLength / 4);
  return Math.max(10, Math.ceil((estimatedInputTokens + expectedOutputTokens) / 1000));
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

type CachedContentRow = { summary?: string | null; flashcards?: unknown };

async function readCache(supabase: SupabaseClient, hash: string): Promise<CachedContentRow | null> {
  const { data, error } = await supabase
    .from('cached_content')
    .select('summary, flashcards')
    .eq('content_hash', hash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) { console.warn('Cache read error:', error); return null; }
  return data ?? null;
}

async function writeCache(
  supabase: SupabaseClient,
  hash: string,
  payload: { summary?: string; flashcards?: unknown[] }
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const { error } = await supabase.from('cached_content').upsert(
    { content_hash: hash, ...payload, expires_at: expiresAt.toISOString() },
    { onConflict: 'content_hash' }
  );

  if (error) console.warn('Cache write error:', error);
}

// ─── Action: summary ──────────────────────────────────────────────────────────

async function handleSummary(
  params: {
    text: string;
    model: string;
    chunkIndex?: number;
    totalChunks?: number;
    targetLanguage: string;
    usageChannel?: string;
  },
  userId: string | null,
  isAdmin: boolean,
  supabase: SupabaseClient
): Promise<Response> {
  const { text, model, chunkIndex, totalChunks, targetLanguage, usageChannel } = params;

  // 1. Strip speaker notes — presenter cues, not academic content
  const withoutNotes = stripSpeakerNotes(text);

  // 2. Strip navigation/section-divider/TOC slides.
  //    Without this, the model anchors its summary on the overview slide
  //    and produces bullets that mirror the table of contents rather than
  //    the actual slide content (the root cause of the 11-bullet problem).
  const { cleaned: strippedText, removedCount } = stripNavigationSlides(withoutNotes);
  if (removedCount > 0) {
    console.log(`Stripped ${removedCount} navigation/section slides before summarising`);
  }

  // 3. Standard unicode and HTML entity cleaning
  const cleanedText = cleanText(strippedText);

  let textForModel = cleanedText;
  if (textForModel.length > SUMMARY_MAX_INPUT_CHARS) {
    console.warn(
      `[generate-summary-and-flashcards] summary input truncated from ${textForModel.length} to ${SUMMARY_MAX_INPUT_CHARS} chars`,
    );
    textForModel = textForModel.slice(0, SUMMARY_MAX_INPUT_CHARS);
  }

  const quality = assessTextQuality(textForModel);

  const hash = await hashContent(textForModel, 'summary', targetLanguage);
  const cached = await readCache(supabase, hash);
  if (cached?.summary) {
    console.log('Cache hit for summary');
    return jsonResponse({ summary: cached.summary, quality, cached: true, tokens: { input: 0, output: 0, total: 0 } });
  }

  if (userId && !isAdmin) {
    const credits = estimateCredits(textForModel.length, 2800);
    const check = await checkCredits(supabase, userId, credits);
    if (!check.sufficient) return jsonResponse({ error: 'insufficient_credits', message: check.message }, 429);
  }

  const langName = SUPPORTED_LANGUAGES[targetLanguage] || SUPPORTED_LANGUAGES.en;
  const maxTokens = textForModel.length < 8000 ? 2800 : 4096;

  const chunkNote =
    typeof chunkIndex === 'number' && typeof totalChunks === 'number' && totalChunks > 1
      ? `This is section ${chunkIndex + 1} of ${totalChunks} of the document. Focus only on the content below; do not repeat context from other sections.\n`
      : '';

  const prompt = `You are an academic study assistant. Generate a high-quality study summary in ${langName}.

=== DOCUMENT HANDLING ===
- Input may come from PDFs or presentation slides. It may contain noise: headers, footers, page numbers, figure captions, image references, broken sentences.
- Ignore non-content text: page numbers, repeated headers/footers, reference lists, index entries, image placeholders (e.g. lines starting with "![]").
- If the text contains a table of contents, agenda, or overview slide that only lists topic names without explanation, ignore it — summarize only slides that define, explain, or demonstrate those topics.
- Reconstruct meaning from broken or fragmented sentences before summarizing.
- Prioritize content with definitions, equations, algorithms, step-by-step processes, and comparisons.

=== OUTPUT RULES ===
- Output ONLY bullet points.
- Start EVERY bullet with "- " on its own line. No line breaks inside a bullet.
- Do NOT include headings, numbering, introductions, or conclusions.
- Do NOT invent content — summarize only what is clearly present.
- Write in ${langName}. All bullet text must be in ${langName}.

=== BULLET QUALITY ===
- Each bullet must cover: what the concept is, why it matters, and key mechanisms/steps/consequences where present.
- Keep technical terms, variable names, compound names, and equation components exactly as written in the source.
- Use as many words as the concept requires — up to 200 words per bullet. Do not pad with filler, but do not truncate a concept just to stay short. A simple definition may need only 30 words; a multi-step mechanism or comparison may need 150–200 words. Use judgment.
- For equations or formulas: name the equation, describe what each variable/term represents, and state its practical effect.
- For algorithms or step-by-step processes: include the key steps and their purpose — not just the algorithm name.
- For comparison tables (e.g. L1 vs L2, Bagging vs Boosting): produce one bullet per comparison axis, not one bullet for the entire table.
- For data tables with numeric values (e.g. surface atom percentages by shell count): include the key data points that illustrate the trend, not just a description of the table.
- For historical timelines: include the specific dates, names, and discoveries — not just "there was a timeline."
- For named examples (specific compounds, materials, experiments): include the name and what makes that example significant.
- Include concrete examples or applications only if they appear in the source text.
- No redundancy between bullets — merge closely related points.

${chunkNote}
=== TEXT ===
${textForModel}

Start immediately with "- ".`;

  const result = await callAnthropic(prompt, model, maxTokens, usageChannel);

  if ('error' in result) return jsonResponse({ error: result.error }, anthropicErrorHttpStatus(result));

  let summaryText = result.output.trim();

  const firstBullet = summaryText.indexOf('- ');
  if (firstBullet > 0) summaryText = summaryText.substring(firstBullet);

  const bulletLines = summaryText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '));

  summaryText = bulletLines.join('\n');

  if (!summaryText || summaryText.length < 10) {
    return jsonResponse({ error: 'Failed to generate valid summary content' }, 500);
  }

  await writeCache(supabase, hash, { summary: summaryText });
  if (userId && !isAdmin) await deductCredits(supabase, userId, result.tokens.total);

  return jsonResponse({ summary: summaryText, quality, cached: false, tokens: result.tokens });
}

// ─── Action: flashcards ───────────────────────────────────────────────────────

async function handleFlashcards(
  params: {
    text: string;
    summaryText?: string;
    count: number;
    model: string;
    targetLanguage: string;
    usageChannel?: string;
  },
  userId: string | null,
  isAdmin: boolean,
  supabase: SupabaseClient
): Promise<Response> {
  const { text, summaryText, count, model, targetLanguage, usageChannel } = params;
  const cardCount = Math.max(1, Math.min(count, 50));

  // Prefer summary if provided — already distilled, fewer tokens, better cards.
  // If using raw text, strip navigation slides for the same reason as summary.
  let sourceText: string;
  if (summaryText?.trim()) {
    sourceText = cleanText(summaryText).slice(0, 10000);
  } else {
    const withoutNotes = stripSpeakerNotes(text);
    const { cleaned } = stripNavigationSlides(withoutNotes);
    sourceText = cleanText(cleaned).slice(0, 10000);
  }

  const hash = await hashContent(sourceText + cardCount, 'flashcards', targetLanguage);
  const cached = await readCache(supabase, hash);
  if (cached?.flashcards) {
    console.log('Cache hit for flashcards');
    return jsonResponse({ flashcards: cached.flashcards, cached: true, tokens: { input: 0, output: 0, total: 0 } });
  }

  if (userId && !isAdmin) {
    const credits = estimateCredits(sourceText.length, 1500);
    const check = await checkCredits(supabase, userId, credits);
    if (!check.sufficient) return jsonResponse({ error: 'insufficient_credits', message: check.message }, 429);
  }

  const langName = SUPPORTED_LANGUAGES[targetLanguage] || SUPPORTED_LANGUAGES.en;

  const prompt = `Create exactly ${cardCount} study flashcards in ${langName} from the text below.

Format each card strictly as:
Q: [question]
A: [answer — maximum 20 words]

Rules:
- One Q: line and one A: line per card, nothing else between them.
- Test comprehension and key concepts — not trivial recall or yes/no questions.
- For content with equations or algorithms: ask about what a variable represents, what a step achieves, or what the practical effect is — not just the name of the formula.
- Each question must test a different concept.
- All text must be in ${langName}.

Text:
${sourceText}

Flashcards:`;

  const result = await callAnthropic(prompt, model, 1500, usageChannel);

  if ('error' in result) return jsonResponse({ error: result.error }, anthropicErrorHttpStatus(result));

  // Strict single-line Q/A parser — no stray-line accumulation
  const cards: { front: string; back: string }[] = [];
  const lines = result.output.split('\n').map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].startsWith('Q:') && lines[i + 1].startsWith('A:')) {
      const front = lines[i].replace(/^Q:\s*/, '').trim();
      const back = lines[i + 1].replace(/^A:\s*/, '').trim();
      if (front && back) cards.push({ front, back });
      i++;
    }
  }

  const uniqueCards: { front: string; back: string }[] = [];
  const seenKeys = new Set<string>();

  for (const card of cards) {
    const key = (card.front + '|' + card.back).toLowerCase();
    if (seenKeys.has(key)) continue;

    const isDuplicate = uniqueCards.some((existing) => {
      const s1 = existing.front.toLowerCase();
      const s2 = card.front.toLowerCase();
      const longer = Math.max(s1.length, s2.length);
      if (longer === 0) return false;
      const common = [...s2].filter((c) => s1.includes(c)).length;
      return common / longer >= 0.75;
    });

    if (!isDuplicate) {
      uniqueCards.push(card);
      seenKeys.add(key);
    }

    if (uniqueCards.length >= cardCount) break;
  }

  if (uniqueCards.length === 0) {
    return jsonResponse({ error: 'No valid flashcards could be parsed from the response' }, 502);
  }

  await writeCache(supabase, hash, { flashcards: uniqueCards });
  if (userId && !isAdmin) await deductCredits(supabase, userId, result.tokens.total);

  return jsonResponse({ flashcards: uniqueCards, cached: false, tokens: result.tokens });
}

// ─── Action: topics ───────────────────────────────────────────────────────────

async function handleTopics(
  params: { text: string; model: string; targetLanguage: string; usageChannel?: string },
  userId: string | null,
  isAdmin: boolean,
  supabase: SupabaseClient
): Promise<Response> {
  const { text, model, targetLanguage, usageChannel } = params;

  // Strip navigation slides before topic detection — detecting topics from a
  // TOC slide returns the TOC items verbatim, not the actual content topics.
  const withoutNotes = stripSpeakerNotes(text);
  const { cleaned } = stripNavigationSlides(withoutNotes);
  const cleanedText = cleanText(cleaned).slice(0, 8000);

  const langName = SUPPORTED_LANGUAGES[targetLanguage] || SUPPORTED_LANGUAGES.en;

  const hash = await hashContent(cleanedText, 'topics', targetLanguage);
  const cached = await readCache(supabase, hash);
  if (cached?.summary) {
    try {
      const topics = JSON.parse(cached.summary);
      if (Array.isArray(topics)) return jsonResponse({ topics, cached: true });
    } catch { /* fall through to regenerate */ }
  }

  if (userId && !isAdmin) {
    const credits = estimateCredits(cleanedText.length, 300);
    const check = await checkCredits(supabase, userId, credits);
    if (!check.sufficient) return jsonResponse({ error: 'insufficient_credits', message: check.message }, 429);
  }

  const prompt = `Extract 3–8 key topics from the text below. List only topic names (1–3 words each), one per line, in ${langName}. No numbers, no bullets, no explanations.

Text:
${cleanedText}

Topics:`;

  const result = await callAnthropic(prompt, model, 300, usageChannel);

  if ('error' in result) return jsonResponse({ error: result.error }, anthropicErrorHttpStatus(result));

  const topics: string[] = result.output
    .split('\n')
    .map((l) =>
      l.trim()
        .replace(/^\d+[.)]\s*/, '')
        .replace(/^[-•]\s*/, '')
    )
    .filter((l) => l && !l.toLowerCase().includes('topics:') && l.length <= 50)
    .slice(0, 8);

  if (topics.length === 0) topics.push('General Content');

  await writeCache(supabase, hash, { summary: JSON.stringify(topics) });
  if (userId && !isAdmin) await deductCredits(supabase, userId, result.tokens.total);

  return jsonResponse({ topics, cached: false });
}

type SummaryFlashcardsRequestBody = {
  action?: string;
  model?: string;
  text?: string;
  count?: number;
  chunkIndex?: number;
  totalChunks?: number;
  summaryText?: string;
  targetLanguage?: string;
  /** When `academics`, uses `ANTHROPIC_API_KEY_ACADEMICS` if set, else primary key. */
  usageChannel?: string;
};

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const startTime = Date.now();

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse({ error: 'Server configuration error: Missing Supabase credentials' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    // ── Auth ───────────────────────────────────────────────────────────────
    let userId: string | null = null;
    let isAdmin = false;

    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id ?? null;

        if (userId) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle();

          isAdmin = profile?.role === 'admin';
        }
      } catch (err) {
        console.warn('Failed to extract user from token:', err);
      }
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    let body: SummaryFlashcardsRequestBody;
    try {
      body = (await req.json()) as SummaryFlashcardsRequestBody;
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const {
      action,
      model = DEFAULT_MODEL,
      text,
      count,
      chunkIndex,
      totalChunks,
      summaryText,
      targetLanguage = 'en',
    } = body;

    const usageChannel = body.usageChannel === 'academics' ? 'academics' : undefined;

    if (action === 'ping') return jsonResponse({ ok: true });

    if (!text || typeof text !== 'string' || text.trim().length < 30) {
      return jsonResponse({ error: 'Invalid or insufficient text content (minimum 30 characters)' }, 400);
    }

    const lang = SUPPORTED_LANGUAGES[targetLanguage] ? targetLanguage : 'en';

    // ── Route ──────────────────────────────────────────────────────────────
    let response: Response;

    switch (action) {
      case 'summary':
        response = await handleSummary(
          { text, model, chunkIndex, totalChunks, targetLanguage: lang, usageChannel },
          userId, isAdmin, supabase
        );
        break;

      case 'flashcards':
        response = await handleFlashcards(
          { text, summaryText, count: Number(count) || 10, model, targetLanguage: lang, usageChannel },
          userId, isAdmin, supabase
        );
        break;

      case 'topics':
        response = await handleTopics(
          { text, model, targetLanguage: lang, usageChannel },
          userId, isAdmin, supabase
        );
        break;

      default:
        return jsonResponse(
          { error: 'Unknown action. Supported actions: ping, summary, flashcards, topics' },
          400
        );
    }

    const duration = Date.now() - startTime;
    console.log(`[generate-summary-and-flashcards] action=${action} duration=${duration}ms userId=${userId ?? 'anonymous'}`);

    return response;
  } catch (err: unknown) {
    console.error('[generate-summary-and-flashcards] Fatal error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `Server error: ${msg}` }, 500);
  }
});