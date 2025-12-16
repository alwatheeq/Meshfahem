import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse } from '../_shared/response.ts';
import { validateMethod } from '../_shared/validation.ts';

const DEFAULT_MODEL = 'claude-3-haiku-20240307';
const MAX_TOKENS = 4096;

function createTextBlock(text: string) {
  return [{ type: 'text', text }];
}

async function callAnthropic(messages: Array<{ role: string; content: any }>, model: string, maxTokens: number) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return { error: 'Missing ANTHROPIC_API_KEY environment variable' };
  }

  // Enforce 4096 token limit for Claude 3 Haiku
  const safeMaxTokens = Math.min(maxTokens, MAX_TOKENS);
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
        messages: messages
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

function buildSystemPrompt(summaryText: string, originalText: string | null, topics: string[], medicalMode: boolean): string {
  // Check if this is a general assistant query (no specific content)
  const isGeneralAssistant = summaryText.includes('General assistant') || summaryText.length < 100;

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

  // Truncate original text if too long (max 10,000 chars)
  const truncatedOriginalText = originalText && originalText.length > 10000 
    ? originalText.substring(0, 10000) + '... (truncated)'
    : originalText;

  let prompt = `You are an AI assistant helping a student understand their study material. Your role is to provide clear, educational explanations and answer questions about the content.

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

  return prompt;
}

Deno.serve(async (req) => {
  const startTime = Date.now();

  try {
    console.log(`[chat-assistant] ${req.method} request received at ${new Date().toISOString()}`);

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
        persistSession: false
      }
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
      maxTokens = 2000
    } = requestBody;

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

    if (!userId) {
      return errorResponse('Authentication required', 401);
    }

    // Validate message input
    if (!message || typeof message !== 'string' || message.trim().length < 1) {
      return errorResponse('Message is required', 400);
    }

    if (message.length > 5000) {
      return errorResponse('Message is too long (max 5000 characters)', 400);
    }

    // Validate summary text
    if (!summary_text || typeof summary_text !== 'string' || summary_text.trim().length < 10) {
      return errorResponse('Summary text is required', 400);
    }

    // Check credit balance for non-admin users before processing
    if (!isAdmin) {
      try {
        const { data: creditCheck, error: creditError } = await supabase
          .rpc('check_sufficient_credits', {
            p_user_id: userId,
            p_estimated_credits: 3 // Estimate minimum credits needed for chat
          });

        if (creditError) {
          console.error('Failed to check credits:', creditError);
          return errorResponse('Failed to check credit balance', 500);
        } else if (creditCheck && !creditCheck.sufficient) {
          const cycleEnd = creditCheck.cycle_end;
          return errorResponse(
            `You don't have enough credits to complete this action. Your credits will refresh on ${new Date(cycleEnd).toLocaleDateString()}.`,
            429
          );
        }
      } catch (limitCheckError) {
        console.error('Credit check error:', limitCheckError);
        return errorResponse('Failed to check credit balance', 500);
      }
    }

    // Get or create conversation
    let conversationId = conversation_id;
    if (!conversationId) {
      // Check if conversation already exists for this context
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
        // Use existing conversation
        conversationId = existingConv.id;
      } else {
        // Create new conversation
        const { data: newConversation, error: convError } = await supabase
          .from('chatbot_conversations')
          .insert({
            user_id: userId,
            context_type: context_type,
            context_id: context_id,
            summary_text: summary_text,
            original_text: original_text || null,
            topics: topics || [],
            medical_mode: medical_mode || false
          })
          .select()
          .single();

        if (convError) {
          console.error('Failed to create conversation:', convError);
          return errorResponse('Failed to create conversation', 500);
        }

        conversationId = newConversation.id;
      }
    } else {
      // Verify conversation belongs to user
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

    // Get conversation history (last 10 messages for context)
    const { data: previousMessages, error: historyError } = await supabase
      .from('chatbot_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(10);

    if (historyError) {
      console.error('Failed to fetch conversation history:', historyError);
    }

    // Get conversation context
    const { data: conversation, error: convError } = await supabase
      .from('chatbot_conversations')
      .select('summary_text, original_text, topics, medical_mode')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return errorResponse('Failed to load conversation context', 500);
    }

    // Build messages array for API
    const messages: Array<{ role: string; content: any }> = [];

    // Add system prompt with context
    const systemPrompt = buildSystemPrompt(
      conversation.summary_text,
      conversation.original_text,
      conversation.topics || [],
      conversation.medical_mode || false
    );
    messages.push({
      role: 'user',
      content: createTextBlock(systemPrompt)
    });

    // Add previous messages for context
    if (previousMessages && previousMessages.length > 0) {
      previousMessages.forEach(msg => {
        messages.push({
          role: msg.role,
          content: createTextBlock(msg.content)
        });
      });
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: createTextBlock(message)
    });

    // Save user message to database
    const { error: userMsgError } = await supabase
      .from('chatbot_messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: message,
        tokens_used: 0 // Will be updated after API call
      });

    if (userMsgError) {
      console.error('Failed to save user message:', userMsgError);
    }

    // Call Anthropic API
    console.log(`[chat-assistant] Calling Anthropic API with ${messages.length} messages`);
    const result = await callAnthropic(messages, model, maxTokens);

    if ('error' in result) {
      console.error('[chat-assistant] API error:', result.error);
      return errorResponse(result.error, 500);
    }

    // Deduct credits for authenticated non-admin users
    if (!isAdmin && result.tokens) {
      try {
        const { data: deductResult, error: deductError } = await supabase
          .rpc('deduct_credits_atomic', {
            p_user_id: userId,
            p_tokens_used: result.tokens.total,
            p_operation_type: 'chat_assistant'
          });

        if (deductError) {
          console.error('Failed to deduct credits:', deductError);
        } else if (deductResult) {
          console.log(`✅ Credits deducted: ${deductResult.credits_deducted}, remaining: ${deductResult.credits_remaining}`);
          
          // Check if warning thresholds were hit
          if (deductResult.notify_at_1000 || deductResult.notify_at_500 || deductResult.notify_at_250) {
            const percentage = Math.round((deductResult.credits_remaining / 2700) * 100);
            const message = `You have ${deductResult.credits_remaining} credits remaining (${percentage}% left). They will refresh on ${new Date(deductResult.cycle_end).toLocaleDateString()}.`;
            
            // Insert notification (you may want to handle this differently)
            console.log('⚠️ Low credits warning:', message);
          }
        }
      } catch (usageError) {
        console.error('⚠️ Failed to deduct credits:', usageError);
      }
    }

    // Save assistant message to database
    const { data: assistantMessage, error: assistantMsgError } = await supabase
      .from('chatbot_messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: result.output,
        tokens_used: result.tokens.total
      })
      .select()
      .single();

    if (assistantMsgError) {
      console.error('Failed to save assistant message:', assistantMsgError);
    }

    // Update user message with token count (approximate)
    // Find the most recent user message for this conversation
    if (result.tokens) {
      const estimatedUserTokens = Math.ceil(message.length / 4); // Rough estimate
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
      message_id: assistantMessage?.id
    });

  } catch (error) {
    console.error('[chat-assistant] Unexpected error:', error);
    return errorResponse(`Internal server error: ${error.message}`, 500);
  }
});

