import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse } from '../_shared/response.ts';
import { validateMethod } from '../_shared/validation.ts';

function createTextBlock(text: string) {
  return [{ type: 'text', text }];
}

async function callAnthropic(prompt: string, model: string, maxTokens: number) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return { error: 'Missing ANTHROPIC_API_KEY environment variable' };
  }

  // Enforce 4096 token limit for Claude 3 Haiku
  const safeMaxTokens = Math.min(maxTokens, 4096);
  if (safeMaxTokens < maxTokens) {
    console.warn(`⚠️ Token limit capped from ${maxTokens} to ${safeMaxTokens} for Claude 3 Haiku`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: safeMaxTokens,
        messages: [{
          role: 'user',
          content: createTextBlock(prompt)
        }]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { 
        error: `Anthropic API error ${response.status}: ${errorText}` 
      };
    }

    const data = await response.json();
    const output = data?.content?.[0]?.text || '';
    const inputTokens = data?.usage?.input_tokens || 0;
    const outputTokens = data?.usage?.output_tokens || 0;
    const totalTokens = inputTokens + outputTokens;

    clearTimeout(timeoutId);
    return { output, tokens: { input: inputTokens, output: outputTokens, total: totalTokens } };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return { error: 'Request timeout - API took too long to respond' };
    }
    return {
      error: `Request failed: ${error.message}`
    };
  }
}

Deno.serve(async (req) => {
  const startTime = Date.now();

  try {
    console.log(`[generate-summary-and-flashcards] ${req.method} request received at ${new Date().toISOString()}`);

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return handleCorsPreflight();
    }

    const methodError = validateMethod(req, ['POST']);
    if (methodError) {
      return methodError;
    }

    // Verify environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('[generate-summary-and-flashcards] Missing Supabase credentials');
      return errorResponse('Server configuration error: Missing Supabase credentials', 500);
    }

    if (!anthropicKey) {
      console.error('[generate-summary-and-flashcards] Missing Anthropic API key');
      return errorResponse('Server configuration error: Missing Anthropic API key', 500);
    }

    // Initialize Supabase client for database operations
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
      },
    });

    try {
    const requestBody = await req.json();
    const { action, model, text, count, mode, chunkIndex, totalChunks, pageCount } = requestBody;

    // Extract user ID from the request
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    let isAdmin = false;

    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id;

        // Check if user is admin
        if (userId) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', userId)
            .single();

          isAdmin = profile?.role === 'admin';
        }
      } catch (error) {
        console.warn('Failed to extract user from token:', error);
      }
    }

    // Handle ping action for API validation
    if (action === 'ping') {
      return jsonResponse({ ok: true });
    }

    // Validate text input
    if (!text || typeof text !== 'string' || text.trim().length < 30) {
      return errorResponse('Invalid or insufficient text content', 400);
    }

    // Check credit balance for non-admin users before processing
    if (userId && !isAdmin && action !== 'topics') {
      try {
        const { data: creditCheck, error: creditError } = await supabase
          .rpc('check_sufficient_credits', {
            p_user_id: userId,
            p_estimated_credits: 5 // Estimate minimum credits needed
          });

        if (creditError) {
          console.error('Failed to check credits:', creditError);
        } else if (creditCheck && !creditCheck.sufficient) {
          const cycleEnd = creditCheck.cycle_end;
          return errorResponse(
            `You don't have enough credits to complete this action. Your credits will refresh on ${new Date(cycleEnd).toLocaleDateString()}.`,
            429
          );
        }
      } catch (limitCheckError) {
        console.error('Credit check error:', limitCheckError);
      }
    }

    // Handle summary generation
    if (action === 'summary') {
      const chunkLength = text.length;
      const safeText = text.slice(0, 14000);

      // Calculate dynamic bullet count target: approximately 1 bullet per 500 characters
      const perChunkTarget = Math.max(10, Math.min(30, Math.floor(safeText.length / 500)));

      // Calculate appropriate max tokens based on chunk size
      const maxTokens = chunkLength < 8000 ? 2000 : 2800;

      // Build chunk context message
      const chunkContext = totalChunks > 1
        ? 'This is part of a larger document. Focus on the content provided while maintaining continuity with the overall document theme.'
        : '';

      const prompt = `You are an academic assistant for students.

Your task: Create a comprehensive, detailed summary for study purposes.

=== SUMMARY RULES ===
- Start EVERY bullet with "- " and keep ONE bullet on ONE line (no line breaks inside a bullet).
- Each bullet 30-100 words (minimum 30, maximum 100). Use simple language but keep technical terms exactly as written.
- Explain what it is, why it matters, and key consequences.
- Aim for about ${perChunkTarget} bullets for this content; cover all major ideas.
- Include concrete examples, mechanisms, steps, and practical applications when present.
- Group related concepts into logical sections with section headers (format: === SECTION NAME ===).
- Do NOT output headings like "SUMMARY:", numbering, or filler text.
- Output section headers (if used) and bullets (each starting with "- "), nothing else. Start immediately with the first section header or bullet.

=== QUALITY STANDARDS ===
- Each bullet should be independently understandable (don't rely on previous bullets for context)
- Prioritize information density: pack maximum value into each bullet
- Use active voice when possible for clarity
- If technical terms appear, briefly explain them in context
- Maintain logical flow: introduce concepts before explaining mechanisms, then show applications

=== EXAMPLE FORMAT ===
- [Concept/term] is [definition]. It matters because [significance]. Key consequences include [impact 1], [impact 2], and [impact 3]. For example, [concrete example].

=== EDGE CASE HANDLING ===
- If content is very short: focus on key concepts and their relationships
- If content is very technical: simplify explanations while preserving accuracy
- If content is fragmented: connect related ideas across fragments
- If content lacks examples: create illustrative examples based on the concepts

${chunkContext}

=== DOCUMENT TEXT ===
${safeText}

=== ORGANIZATION REQUIREMENTS ===
- Group related concepts into logical sections
- Use section headers in format: === SECTION NAME ===
- Each section should contain 3-10 related bullet points
- Sections should flow logically (introduce concepts before explaining mechanisms)
- If content is too short for sections, use single section or no headers

=== VALIDATION CHECKLIST ===
Before responding, verify:
✓ Each bullet starts with "- " and is on a single line
✓ Each bullet is 30-100 words
✓ Related concepts are grouped into sections (if content is substantial)
✓ Section headers use format: === SECTION NAME ===
✓ No headings like "SUMMARY:", numbering, or filler text
✓ All major ideas from the content are covered
✓ Each bullet is independently understandable

Generate ${perChunkTarget} bullet points now, organized into logical sections with headers (if applicable), starting with the first section header or "- ":`;

      const result = await callAnthropic(prompt, model || 'claude-3-haiku-20240307', maxTokens);

      if ('error' in result) {
        return errorResponse(result.error, 500);
      }

      // Extract the summary content, preserving section headers but cleaning up unwanted formatting
      let summaryText = result.output.trim();

      // Remove common unwanted header patterns (but preserve section headers with ===)
      // Section headers use format: === SECTION NAME ===, so we preserve those
      const headerPatterns = [
        /^summary:\s*/i,
        /^here\s+(are|is)\s+the\s+bullet\s+points?:?\s*/i,
        /^bullet\s+points?:?\s*/i,
        /^here\s+(are|is)\s+the\s+summaries?:?\s*/i
      ];

      for (const pattern of headerPatterns) {
        if (pattern.test(summaryText)) {
          summaryText = summaryText.replace(pattern, '').trim();
        }
      }

      // Preserve section headers (lines starting with ===) - they are part of the organized structure
      // No need to remove them as they are intentionally included in the output

      // Ensure we have some content
      if (!summaryText || summaryText.length < 10) {
        console.error('[generate-summary-and-flashcards] Summary is empty or too short after extraction');
        return jsonResponse({ error: 'Failed to generate valid summary content' }, 500);
      }

      console.log(`[generate-summary-and-flashcards] Extracted summary: ${summaryText.length} chars, starts with: ${summaryText.substring(0, 50)}`);

      // Deduct credits for authenticated non-admin users
      if (userId && !isAdmin && result.tokens && result.tokens.total > 0) {
        try {
          const { data: deductResult, error: deductError } = await supabase
            .rpc('deduct_credits_atomic', {
              p_user_id: userId,
              p_tokens_used: result.tokens.total,
              p_operation_type: 'deduction'
            });

          if (deductError) {
            console.error('Failed to deduct credits:', deductError);
          } else if (deductResult && deductResult.success) {
            console.log('Credits deducted:', deductResult.credits_deducted);

            // Handle notifications
            if (deductResult.notify_30_percent || deductResult.notify_10_percent) {
              const percentage = deductResult.notify_10_percent ? 10 : 30;
              const message = `You have ${deductResult.credits_remaining} credits remaining (${percentage}% left). They will refresh on ${new Date(deductResult.cycle_end).toLocaleDateString()}.`;

              await supabase.from('notifications').insert({
                user_id: userId,
                notification_type: 'admin_notification',
                message: message,
                is_read: false
              });
            }
          }
        } catch (trackingError) {
          console.error('Credit deduction error:', trackingError);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[generate-summary-and-flashcards] Summary generated in ${duration}ms`);

      return jsonResponse({
        summary: summaryText,
        tokens: result.tokens || { input: 0, output: 0, total: 0 }
      });
    }

    // Handle flashcard generation
    if (action === 'flashcards') {
      const cardCount = Math.max(1, Math.min(Number(count) || 10, 50));

      const prompt = `Create ${cardCount} study flashcards from this text.

=== FLASHCARD FORMAT ===
Format each as:
Q: [question]
A: [answer in max 25 words]

=== REQUIREMENTS ===
- Test comprehension and key concepts
- Avoid yes/no questions
- Make questions unique and specific
- Cover different topics and question types (definition, explanation, application, comparison)
- Distribute question types: ~40% definition/recall, ~35% explanation/understanding, ~25% application/analysis
- Prevent duplicate questions (each question should be unique)

=== ANSWER QUALITY ===
- Answers should be 25 words or less
- Answers must be accurate and complete
- Include key details needed to understand the concept
- Use clear, concise language

=== TEXT CONTENT ===
${text.slice(0, 10000)}

=== VALIDATION CHECKLIST ===
Before responding, verify:
✓ Exactly ${cardCount} unique flashcards
✓ Each answer is ≤ 25 words
✓ Questions test different aspects (not just recall)
✓ No duplicate questions
✓ Questions cover various topics from the text

Generate ${cardCount} flashcards now:`;

      const result = await callAnthropic(prompt, model || 'claude-3-haiku-20240307', 1500);
      
      if ('error' in result) {
        return errorResponse(result.error, 500);
      }

      // Parse Q/A pairs from the response
      const lines = result.output.split('\n');
      const cards: { front: string; back: string }[] = [];
      let currentQuestion = '';
      let currentAnswer = '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('Q:')) {
          // Save previous card if both question and answer exist
          if (currentQuestion && currentAnswer) {
            cards.push({ 
              front: currentQuestion, 
              back: currentAnswer 
            });
          }
          
          // Start new question
          currentQuestion = trimmedLine.replace(/^Q:\s*/, '').trim();
          currentAnswer = '';
        } else if (trimmedLine.startsWith('A:')) {
          // Start new answer
          currentAnswer = trimmedLine.replace(/^A:\s*/, '').trim();
        } else if (currentAnswer && trimmedLine) {
          // Continue multi-line answer
          currentAnswer += ' ' + trimmedLine;
        }
      }

      // Don't forget the last card
      if (currentQuestion && currentAnswer) {
        cards.push({ 
          front: currentQuestion, 
          back: currentAnswer 
        });
      }

      // Remove duplicates and limit to requested count
      const uniqueCards = [];
      const seenCards = new Set();
      
      for (const card of cards) {
        const cardKey = (card.front + '|' + card.back).toLowerCase();
        if (!seenCards.has(cardKey) && card.front && card.back) {
          uniqueCards.push(card);
          seenCards.add(cardKey);
        }
        if (uniqueCards.length >= cardCount) break;
      }

      if (uniqueCards.length === 0) {
        return errorResponse('No valid flashcards could be parsed from the response', 502);
      }

      // Deduct credits for authenticated non-admin users
      if (userId && !isAdmin && result.tokens && result.tokens.total > 0) {
        try {
          const { data: deductResult, error: deductError } = await supabase
            .rpc('deduct_credits_atomic', {
              p_user_id: userId,
              p_tokens_used: result.tokens.total,
              p_operation_type: 'deduction'
            });

          if (deductError) {
            console.error('Failed to deduct credits:', deductError);
          } else if (deductResult && deductResult.success) {
            console.log('Credits deducted:', deductResult.credits_deducted);

            // Handle notifications
            if (deductResult.notify_30_percent || deductResult.notify_10_percent) {
              const percentage = deductResult.notify_10_percent ? 10 : 30;
              const message = `You have ${deductResult.credits_remaining} credits remaining (${percentage}% left). They will refresh on ${new Date(deductResult.cycle_end).toLocaleDateString()}.`;

              await supabase.from('notifications').insert({
                user_id: userId,
                notification_type: 'admin_notification',
                message: message,
                is_read: false
              });
            }
          }
        } catch (trackingError) {
          console.error('Credit deduction error:', trackingError);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[generate-summary-and-flashcards] ${uniqueCards.length} flashcards generated in ${duration}ms`);

      return jsonResponse({
        flashcards: uniqueCards,
        tokens: result.tokens || { input: 0, output: 0, total: 0 }
      });
    }

    // Handle topic detection
    if (action === 'topics') {
      const prompt = `Extract 3-8 key topics from this text. List only topic names (1-3 words each), one per line. No numbers or bullets.

Text:
${text.slice(0, 8000)}

Topics:`;

      const result = await callAnthropic(prompt, model || 'claude-3-haiku-20240307', 300);
      
      if ('error' in result) {
        return errorResponse(result.error, 500);
      }

      // Parse topics from the response - simpler parsing
      const lines = result.output.split('\n');
      const topics: string[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim()
          .replace(/^\d+[\.\)]\s*/, '')  // Remove numbering
          .replace(/^[-•]\s*/, '');       // Remove bullets

        if (trimmedLine &&
            !trimmedLine.toLowerCase().includes('topics:') &&
            trimmedLine.length <= 50) {  // Reasonable topic length
          topics.push(trimmedLine);
        }

        if (topics.length >= 8) break;
      }

      // Ensure we have at least some topics
      if (topics.length === 0) {
        console.warn('No topics parsed, providing fallback');
        topics.push('General Content');
      }

      const duration = Date.now() - startTime;
      console.log(`[generate-summary-and-flashcards] ${topics.length} topics detected in ${duration}ms`);

      return jsonResponse({ topics: topics.slice(0, 8) });
    }

    return errorResponse('Unknown action. Supported actions: ping, summary, flashcards', 400);

    } catch (error) {
      console.error('[generate-summary-and-flashcards] Function error:', error);
      return errorResponse(
        error instanceof Error ? error.message : 'Server error',
        500
      );
    }
  } catch (outerError) {
    console.error('[generate-summary-and-flashcards] Fatal error:', outerError);
    return errorResponse(
      outerError instanceof Error ? outerError.message : 'Fatal server error',
      500
    );
  }
});