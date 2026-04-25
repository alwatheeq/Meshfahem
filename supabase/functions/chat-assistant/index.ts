/// <reference path="../_shared/deno.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse } from '../_shared/response.ts';
import { validateMethod } from '../_shared/validation.ts';

const DEFAULT_MODEL = 'claude-3-haiku-20240307';
const MAX_TOKENS = 4096;

async function callClaude(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  model: string,
  maxTokens: number
) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return { error: 'Missing ANTHROPIC_API_KEY environment variable' };
  }

  const safeMaxTokens = Math.min(maxTokens, MAX_TOKENS);
  if (safeMaxTokens < maxTokens) {
    console.warn(`⚠️ Token limit capped from ${maxTokens} to ${safeMaxTokens}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: safeMaxTokens,
        system: systemPrompt,
        // Claude requires alternating user/assistant roles; filter out any system entries
        messages: messages.filter(m => m.role === 'user' || m.role === 'assistant'),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `Anthropic API error ${response.status}: ${errorText}` };
    }

    const data = await response.json();

    if (!data?.content || !Array.isArray(data.content) || data.content.length === 0) {
      return { error: 'Anthropic API returned invalid response structure' };
    }

    const output = data.content[0]?.text || '';
    if (!output || output.trim().length === 0) {
      return { error: 'Anthropic API returned empty response' };
    }

    const inputTokens = data?.usage?.input_tokens || 0;
    const outputTokens = data?.usage?.output_tokens || 0;
    const totalTokens = inputTokens + outputTokens;

    return { output, tokens: { input: inputTokens, output: outputTokens, total: totalTokens } };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return { error: 'Request timeout - API took too long to respond' };
    }
    return { error: `Request failed: ${error.message}` };
  }
}

function buildSystemPrompt(summaryText: string, originalText: string | null, topics: string[], medicalMode: boolean): string {
  const isGeneralAssistant = summaryText.includes('General assistant');

  if (isGeneralAssistant) {
    return `You are an AI assistant helping students with their learning journey. You can help with:

CAPABILITIES:
1. Answer questions about the application and its features
2. Provide study tips and learning strategies
3. Help with general academic questions
4. Explain concepts and provide clarifications
5. Offer guidance on effective study techniques

GUIDELINES:
- Be friendly, helpful, and educational
- Provide clear, concise answers
- If you don't know something, admit it politely
- Focus on being helpful and supportive
- Use encouraging language

Respond naturally and helpfully.`;
  }

  const truncatedOriginalText = originalText && originalText.length > 10000
    ? originalText.substring(0, 10000) + '... (truncated)'
    : originalText;

  return `You are an AI assistant helping a student understand their study material. Your role is to provide clear, educational explanations and answer questions about the content.

CONTEXT:
- Summary: ${summaryText}
${truncatedOriginalText ? `- Original Text: ${truncatedOriginalText} (available if you need more details)` : ''}
- Topics: ${topics.length > 0 ? topics.join(', ') : 'General'}
${medicalMode ? '- Medical Mode: This content is optimized for medical education with emphasis on pathophysiology, clinical correlations, and board exam information.' : ''}

CAPABILITIES:
1. Answer questions about the summary content
2. Explain concepts in simpler terms
3. Provide clarifications on specific points
4. Connect ideas and show relationships
5. Reference the original text when the summary lacks detail
${medicalMode ? '6. Provide clinical context and board exam insights' : ''}

GUIDELINES:
- Be concise but thorough
- Use clear, educational language
- If the summary doesn't contain enough information, you can reference the original text
- Focus on helping the student understand and learn
${medicalMode ? '- Emphasize clinical relevance and high-yield information' : ''}
- If asked about something not in the content, politely say you can only help with the provided material

Respond naturally and helpfully.`;
}

Deno.serve(async (req) => {
  const startTime = Date.now();

  try {
    console.log(`[chat-assistant] ${req.method} request received at ${new Date().toISOString()}`);

    if (req.method === 'OPTIONS') {
      return handleCorsPreflight();
    }

    const methodError = validateMethod(req, ['POST']);
    if (methodError) {
      return methodError;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('[chat-assistant] Missing Supabase credentials');
      return errorResponse('Server configuration error: Missing Supabase credentials', 500);
    }

    if (!anthropicKey) {
      console.error('[chat-assistant] Missing Anthropic API key');
      return errorResponse('Server configuration error: Missing Anthropic API key', 500);
    }

    const { createClient } = await import('jsr:@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const requestBody = await req.json();
    const {
      message,
      conversation_id,
      summary_text,
      original_text,
      topics = [],
      medical_mode = false,
      context_type = 'summary',
      context_id = null,
      model = DEFAULT_MODEL,
      maxTokens = 2000,
      one_shot = false,
    } = requestBody;

    const authHeader = req.headers.get('Authorization');
    let userId = null;
    let isAdmin = false;

    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id;

        if (userId) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('user_role')
            .eq('id', userId)
            .single();

          isAdmin = profile?.user_role === 'admin';
        }
      } catch (error) {
        console.warn('Failed to extract user from token:', error);
      }
    }

    if (!userId) {
      return errorResponse('Authentication required', 401);
    }

    if (!message || typeof message !== 'string' || message.trim().length < 1) {
      return errorResponse('Message is required', 400);
    }

    if (message.length > 5000) {
      return errorResponse('Message is too long (max 5000 characters)', 400);
    }

    if (!summary_text || typeof summary_text !== 'string') {
      return errorResponse('Summary text is required', 400);
    }
    const isGeneralAssistant = summary_text.includes('General assistant');
    if (!isGeneralAssistant && summary_text.trim().length < 10) {
      return errorResponse('Summary text is required', 400);
    }

    if (!isAdmin) {
      try {
        const estimatedChatTokens = Math.min(8192, Math.max(256, (typeof maxTokens === 'number' ? maxTokens : 2000) * 2));
        const { data: tokenCheck, error: tokenCheckError } = await supabase.rpc(
          'check_sufficient_subscription_tokens',
          {
            p_user_id: userId,
            p_estimated_tokens: estimatedChatTokens,
          }
        );

        if (tokenCheckError) {
          console.error('Failed to check subscription tokens:', tokenCheckError);
          return errorResponse('Failed to check chat token balance', 500);
        }
        if (tokenCheck && tokenCheck.sufficient === false) {
          if (tokenCheck.reason === 'no_active_subscription') {
            return errorResponse('An active subscription is required to use the AI assistant chat.', 403);
          }
          const cycleEnd = tokenCheck.billing_cycle_end;
          const rem = tokenCheck.tokens_remaining ?? 0;
          const suffix = cycleEnd
            ? ` Your chat token allowance resets on ${new Date(cycleEnd).toLocaleDateString()}.`
            : '';
          return errorResponse(
            `Not enough AI chat tokens remaining (${rem} left).${suffix}`,
            429
          );
        }
      } catch (limitCheckError) {
        console.error('Token check error:', limitCheckError);
        return errorResponse('Failed to check chat token balance', 500);
      }
    }

    if (one_shot === true) {
      const systemPrompt = buildSystemPrompt(
        summary_text,
        typeof original_text === 'string' ? original_text : null,
        Array.isArray(topics) ? topics : [],
        medical_mode === true,
      );
      const result = await callClaude(
        systemPrompt,
        [{ role: 'user', content: message.trim() }],
        typeof model === 'string' ? model : DEFAULT_MODEL,
        typeof maxTokens === 'number' ? maxTokens : 2000,
      );

      if ('error' in result) {
        console.error('[chat-assistant] one_shot API error:', result.error);
        return errorResponse(result.error, 500);
      }

      if (!isAdmin && result.tokens) {
        const { data: usageResult, error: usageError } = await supabase.rpc('update_token_usage', {
          p_user_id: userId,
          p_tokens_used: result.tokens.total,
        });
        if (usageError) {
          console.error('Failed to record chat token usage (one_shot):', usageError);
        } else if (usageResult && usageResult.success === false) {
          return errorResponse(
            usageResult.error === 'Token budget exceeded'
              ? 'AI chat token limit reached for this billing cycle.'
              : 'Could not record chat token usage.',
            429
          );
        }
      }

      return jsonResponse({
        message: result.output,
        tokens: result.tokens,
      });
    }

    let conversationId = conversation_id;
    if (!conversationId) {
      let existingConv = null;
      if (context_id) {
        const { data: existing, error: findError } = await supabase
          .from('chatbot_conversations')
          .select('id')
          .eq('user_id', userId)
          .eq('context_type', context_type)
          .eq('context_id', context_id)
          .maybeSingle();

        if (findError) {
          console.error('Failed to check for existing conversation:', findError);
        } else if (existing) {
          existingConv = existing;
        }
      }

      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        const { data: newConversation, error: convError } = await supabase
          .from('chatbot_conversations')
          .insert({
            user_id: userId,
            context_type: context_type,
            context_id: context_id,
            summary_text: summary_text,
            original_text: original_text || null,
            topics: topics || [],
            medical_mode: medical_mode || false,
          })
          .select()
          .single();

        if (convError) {
          const ce = convError as { message?: string; code?: string; details?: string; hint?: string };
          console.error('Failed to create conversation:', {
            message: ce.message,
            code: ce.code,
            details: ce.details,
            hint: ce.hint,
            raw: convError,
          });
          return errorResponse('Failed to create conversation', 500);
        }

        conversationId = newConversation.id;
      }
    } else {
      const { data: existingConv, error: convCheckError } = await supabase
        .from('chatbot_conversations')
        .select('id, user_id')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .single();

      if (convCheckError || !existingConv) {
        return errorResponse('Conversation not found or access denied', 404);
      }
    }

    const { data: previousMessages, error: historyError } = await supabase
      .from('chatbot_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(10);

    if (historyError) {
      console.error('Failed to fetch conversation history:', historyError);
    }

    const { data: conversation, error: convError } = await supabase
      .from('chatbot_conversations')
      .select('summary_text, original_text, topics, medical_mode')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return errorResponse('Failed to load conversation context', 500);
    }

    const systemPrompt = buildSystemPrompt(
      conversation.summary_text,
      conversation.original_text,
      conversation.topics || [],
      conversation.medical_mode || false
    );

    // Build messages array — Claude requires only user/assistant roles
    const messages: Array<{ role: string; content: string }> = [];

    if (previousMessages && previousMessages.length > 0) {
      previousMessages.forEach(msg => {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      });
    }

    messages.push({ role: 'user', content: message });

    const { error: userMsgError } = await supabase
      .from('chatbot_messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: message,
        tokens_used: 0,
      });

    if (userMsgError) {
      console.error('Failed to save user message:', userMsgError);
    }

    console.log(`[chat-assistant] Calling Claude API with ${messages.length} messages (model: ${model})`);
    const result = await callClaude(systemPrompt, messages, model, maxTokens);

    if ('error' in result) {
      console.error('[chat-assistant] API error:', result.error);
      return errorResponse(result.error, 500);
    }

    if (!isAdmin && result.tokens) {
      const { data: usageResult, error: usageError } = await supabase.rpc('update_token_usage', {
        p_user_id: userId,
        p_tokens_used: result.tokens.total,
      });
      if (usageError) {
        console.error('Failed to record chat token usage:', usageError);
      } else if (usageResult && usageResult.success === false) {
        return errorResponse(
          usageResult.error === 'Token budget exceeded'
            ? 'AI chat token limit reached for this billing cycle.'
            : 'Could not record chat token usage.',
          429
        );
      } else if (usageResult?.tokens_remaining !== undefined) {
        console.log(`✅ Chat tokens used: ${result.tokens.total}, remaining: ${usageResult.tokens_remaining}`);
      }
    }

    const { data: assistantMessage, error: assistantMsgError } = await supabase
      .from('chatbot_messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: result.output,
        tokens_used: result.tokens.total,
      })
      .select()
      .single();

    if (assistantMsgError) {
      console.error('Failed to save assistant message:', assistantMsgError);
    }

    if (result.tokens) {
      const estimatedUserTokens = Math.ceil(message.length / 4);
      const { data: userMessages } = await supabase
        .from('chatbot_messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (userMessages) {
        await supabase
          .from('chatbot_messages')
          .update({ tokens_used: estimatedUserTokens })
          .eq('id', userMessages.id);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[chat-assistant] Request completed in ${duration}ms, tokens: ${result.tokens?.total || 0}`);

    return jsonResponse({
      message: result.output,
      conversation_id: conversationId,
      tokens: result.tokens,
      message_id: assistantMessage?.id,
    });

  } catch (error) {
    console.error('[chat-assistant] Unexpected error:', error);
    return errorResponse(`Internal server error: ${error.message}`, 500);
  }
});
