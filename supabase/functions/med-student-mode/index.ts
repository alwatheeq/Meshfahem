import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse, successResponse } from '../_shared/response.ts';
import { authenticateUser, getSupabaseClient } from '../_shared/auth.ts';
import { validateMethod, parseJsonBody, validateRequiredFields, validateNonEmptyString } from '../_shared/validation.ts';

// Enhanced medical content validation
function validateMedicalContent(text: string): { isValid: boolean; score: number; feedback: string } {
  if (!text || typeof text !== 'string') {
    return { isValid: false, score: 0, feedback: 'No text content provided' };
  }

  const trimmedText = text.trim();
  
  // Basic length validation
  if (trimmedText.length < 100) {
    return { isValid: false, score: 0, feedback: 'Text too short for meaningful medical analysis' };
  }

  if (trimmedText.length > 50000) {
    return { isValid: false, score: 0, feedback: 'Text too long - please break into smaller sections' };
  }

  // Medical terminology detection
  const medicalTerms = [
    // Basic medical terms
    'diagnosis', 'treatment', 'symptom', 'patient', 'disease', 'condition', 'therapy',
    'clinical', 'medical', 'pathology', 'etiology', 'prognosis', 'syndrome',
    // Body systems
    'cardiovascular', 'respiratory', 'neurological', 'gastrointestinal', 'renal',
    'hepatic', 'cardiac', 'pulmonary', 'dermatology', 'oncology',
    // Medical procedures
    'surgery', 'procedure', 'intervention', 'examination', 'assessment',
    // Medications
    'medication', 'drug', 'pharmacology', 'dosage', 'administration',
    // Anatomy
    'anatomy', 'physiology', 'organ', 'tissue', 'cell', 'muscle', 'bone'
  ];

  const lowerText = trimmedText.toLowerCase();
  const foundTerms = medicalTerms.filter(term => lowerText.includes(term));
  const medicalScore = (foundTerms.length / medicalTerms.length) * 100;

  let score = 50; // Base score
  score += Math.min(medicalScore, 40); // Add up to 40 points for medical content
  
  // Bonus points for clinical indicators
  if (lowerText.includes('patient') || lowerText.includes('clinical')) score += 10;
  if (lowerText.includes('diagnosis') || lowerText.includes('treatment')) score += 10;
  if (lowerText.includes('pathophysiology') || lowerText.includes('mechanism')) score += 10;

  const isValid = score >= 60;
  
  return {
    isValid,
    score: Math.round(score),
    feedback: isValid 
      ? `Medical content detected (${Math.round(medicalScore)}% medical terminology)`
      : 'Content may not be medical-focused enough for optimal results'
  };
}

// Enhanced flashcard parsing with medical focus
function parseMedicalFlashcards(aiOutput: string, expectedCount: number): Array<{ front: string; back: string }> {
  const lines = aiOutput.split('\n');
  const cards: { front: string; back: string }[] = [];
  let currentQuestion = '';
  let currentAnswer = '';
  let inAnswerMode = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines and headers
    if (!trimmedLine || trimmedLine.toUpperCase().includes('FLASHCARDS:')) {
      continue;
    }
    
    if (trimmedLine.match(/^Q\d*[:.]?\s*/i)) {
      // Save previous card if both question and answer exist
      if (currentQuestion && currentAnswer) {
        cards.push({ 
          front: sanitizeMedicalText(currentQuestion), 
          back: sanitizeMedicalText(currentAnswer)
        });
      }
      
      // Start new question
      currentQuestion = trimmedLine.replace(/^Q\d*[:.]?\s*/i, '').trim();
      currentAnswer = '';
      inAnswerMode = false;
    } else if (trimmedLine.match(/^A\d*[:.]?\s*/i)) {
      // Start new answer
      currentAnswer = trimmedLine.replace(/^A\d*[:.]?\s*/i, '').trim();
      inAnswerMode = true;
    } else if (inAnswerMode && trimmedLine && !trimmedLine.match(/^Q\d*[:.]?\s*/i)) {
      // Continue multi-line answer
      currentAnswer += ' ' + trimmedLine;
    } else if (!inAnswerMode && currentQuestion && trimmedLine && !trimmedLine.match(/^A\d*[:.]?\s*/i)) {
      // Continue multi-line question
      currentQuestion += ' ' + trimmedLine;
    }
  }

  // Don't forget the last card
  if (currentQuestion && currentAnswer) {
    cards.push({ 
      front: sanitizeMedicalText(currentQuestion), 
      back: sanitizeMedicalText(currentAnswer)
    });
  }

  // Enhanced deduplication for medical content
  const uniqueCards = deduplicateMedicalCards(cards);
  
  // Validate medical flashcards
  const validCards = uniqueCards.filter(card => validateMedicalFlashcard(card));
  
  console.log(`Parsed ${cards.length} raw cards, ${uniqueCards.length} unique, ${validCards.length} valid medical cards`);
  
  return validCards.slice(0, expectedCount);
}

// Sanitize medical text while preserving important terminology
function sanitizeMedicalText(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/\s+/g, ' ')
    .replace(/^\W+|\W+$/g, '')
    .trim();
}

// Enhanced deduplication specifically for medical flashcards
function deduplicateMedicalCards(cards: Array<{ front: string; back: string }>): Array<{ front: string; back: string }> {
  const unique: Array<{ front: string; back: string }> = [];
  const seenQuestions = new Set<string>();
  const seenAnswers = new Set<string>();
  
  for (const card of cards) {
    if (!card.front || !card.back) continue;
    
    const normalizedQuestion = card.front.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const normalizedAnswer = card.back.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    // Check for exact duplicates
    const questionKey = normalizedQuestion;
    const answerKey = normalizedAnswer;
    
    if (seenQuestions.has(questionKey) || seenAnswers.has(answerKey)) {
      continue;
    }
    
    // Check for similarity (medical concepts might be rephrased)
    let isSimilar = false;
    for (const existingCard of unique) {
      const similarity = calculateMedicalSimilarity(card.front, existingCard.front);
      if (similarity > 0.8) {
        isSimilar = true;
        break;
      }
    }
    
    if (!isSimilar) {
      unique.push(card);
      seenQuestions.add(questionKey);
      seenAnswers.add(answerKey);
    }
  }
  
  return unique;
}

// Calculate similarity between medical texts
function calculateMedicalSimilarity(text1: string, text2: string): number {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);
  
  const intersection = words1.filter(word => words2.includes(word));
  const union = [...new Set([...words1, ...words2])];
  
  return union.length > 0 ? intersection.length / union.length : 0;
}

// Validate individual medical flashcard quality
function validateMedicalFlashcard(card: { front: string; back: string }): boolean {
  if (!card.front || !card.back) return false;
  
  // Check minimum lengths
  if (card.front.trim().length < 10 || card.back.trim().length < 5) return false;
  
  // Check maximum lengths (clinical answers can be longer)
  if (card.front.length > 300 || card.back.length > 400) return false;
  
  // Ensure it's actually a question
  const questionIndicators = ['?', 'what', 'how', 'why', 'when', 'where', 'which', 'define', 'explain', 'describe'];
  const hasQuestionFormat = questionIndicators.some(indicator => 
    card.front.toLowerCase().includes(indicator)
  );
  
  if (!hasQuestionFormat) {
    // Allow statements that can be turned into questions
    return card.front.length > 15; // Minimum meaningful content
  }
  
  return true;
}

// Parse medical topics with specialty focus
function parseMedicalTopics(aiOutput: string): string[] {
  const lines = aiOutput.split('\n');
  const topics: string[] = [];
  let startParsing = false;
  
  // Medical specialties for validation
  const medicalSpecialties = [
    'cardiology', 'neurology', 'psychiatry', 'dermatology', 'oncology',
    'pulmonology', 'gastroenterology', 'nephrology', 'endocrinology',
    'infectious diseases', 'emergency medicine', 'internal medicine',
    'surgery', 'pediatrics', 'obstetrics', 'gynecology', 'urology',
    'orthopedics', 'ophthalmology', 'ent', 'anesthesiology', 'radiology',
    'pathology', 'pharmacology', 'anatomy', 'physiology', 'biochemistry',
    'microbiology', 'immunology', 'genetics', 'epidemiology'
  ];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine.toUpperCase().includes('MEDICAL TOPICS:') || 
        trimmedLine.toUpperCase().includes('TOPICS:')) {
      startParsing = true;
      continue;
    }
    
    if (startParsing && trimmedLine) {
      // Clean up the topic
      const cleanTopic = trimmedLine
        .replace(/^[\d\-\•\*\.\s]+/, '') // Remove numbers, bullets, etc.
        .trim();
      
      if (cleanTopic.length > 2 && cleanTopic.length < 50) {
        topics.push(cleanTopic);
      }
    }
    
    // Stop if we hit enough topics
    if (topics.length >= 8) break;
  }

  // Validate topics against medical specialties
  const validTopics = topics.filter(topic => {
    const lowerTopic = topic.toLowerCase();
    return medicalSpecialties.some(specialty => 
      lowerTopic.includes(specialty) || specialty.includes(lowerTopic)
    ) || topic.length > 3; // Allow non-specialty topics if they're meaningful
  });

  // Ensure we have at least some topics
  if (validTopics.length === 0) {
    console.warn('No valid medical topics parsed, providing fallbacks');
    return ['Medicine', 'Clinical Studies'];
  }

  return validTopics.slice(0, 8);
}

// Enhanced Anthropic API call with medical-specific error handling
async function callAnthropicForMedicalContent(prompt: string, model: string, maxTokens: number) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY environment variable is not set.');
    return { error: 'Missing ANTHROPIC_API_KEY environment variable' };
  }

  // Enforce 4096 token limit for Claude 3 Haiku
  const safeMaxTokens = Math.min(maxTokens, 4096);
  if (safeMaxTokens < maxTokens) {
    console.warn(`⚠️ Token limit capped from ${maxTokens} to ${safeMaxTokens} for Claude 3 Haiku`);
  }

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
          content: [{ type: 'text', text: prompt }]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Anthropic API error ${response.status}: ${errorText}`);
      
      // Provide medical-specific error context
      if (response.status === 400) {
        return { error: 'Invalid request to AI service - medical content may be too complex' };
      } else if (response.status === 429) {
        return { error: 'AI service temporarily overloaded - please try again in a moment' };
      } else if (response.status === 500) {
        return { error: 'AI service experiencing issues - please retry your medical content' };
      }
      
      return { 
        error: `Medical AI processing failed (${response.status}): ${errorText}` 
      };
    }

    const data = await response.json();
    const output = data?.content?.[0]?.text || '';
    const inputTokens = data?.usage?.input_tokens || 0;
    const outputTokens = data?.usage?.output_tokens || 0;
    const totalTokens = inputTokens + outputTokens;

    if (!output.trim()) {
      return { error: 'AI service returned empty response for medical content' };
    }

    return { output, tokens: { input: inputTokens, output: outputTokens, total: totalTokens } };
  } catch (error) {
    console.error(`Request to Anthropic API failed: ${error.message}`);
    return { 
      error: `Medical AI request failed: ${error.message}` 
    };
  }
}

// Enhanced medical summary prompt
function createMedicalSummaryPrompt(text: string): string {
  return `You are an expert medical educator and board exam preparation specialist.

Your task: Create a comprehensive, exam-focused summary for USMLE, COMLEX, and medical board examinations.

=== CORE PRINCIPLES ===
1. **HIGH-YIELD FIRST**: Prioritize information frequently tested (80/20 rule - focus on what appears most often)
2. **CLINICAL RELEVANCE**: Emphasize real-world applications and patient care scenarios
3. **PATHOPHYSIOLOGY DEPTH**: Include disease mechanisms at cellular/molecular level when relevant
4. **BOARD EXAM ALIGNMENT**: Structure mirrors actual board question formats and content distribution

=== FORMATTING REQUIREMENTS ===
- Use hierarchical bullet points (main points use "- ", sub-points use "  • ")
- Group related concepts together (e.g., all cardiovascular content in one section)
- Include medical terminology with brief parenthetical explanations: "Term (brief explanation)"
- Highlight critical "MUST KNOW" information with ⚠️ or **
- Add mnemonics when they significantly aid memory (format: "Mnemonic: [device]")

=== CONTENT STRUCTURE (use only relevant categories) ===
Organize using these categories as applicable:
• **Primary Diagnosis/Condition** - Core disease/condition being discussed
• **Pathophysiology & Mechanisms** - How it works at biological level
• **Clinical Presentation** - Signs, symptoms, patient presentation
• **Diagnostic Approach** - Tests, criteria, workup algorithms
• **Differential Diagnoses** - What else could it be? (top 3-5)
• **Treatment & Management** - First-line, alternatives, protocols
• **Complications & Prognosis** - What can go wrong, expected outcomes
• **Clinical Pearls** - High-yield facts, associations, test-taking tips

=== PRIORITIZATION ===
If content is extensive, prioritize in this order:
1. Pathophysiology and mechanisms (most tested)
2. Clinical presentation and diagnostic criteria
3. Treatment protocols and first-line therapies
4. Complications and contraindications
5. Epidemiology and risk factors

=== ERROR PREVENTION ===
DO NOT:
- Include information not in the provided medical content
- Use generic explanations without clinical context
- Skip pathophysiology when it's central to understanding
- Create summaries that are too generic or vague
- Omit critical "MUST KNOW" information for board exams

=== CONTEXT HANDLING ===
- **Very short content (< 500 chars)**: Focus on key medical concepts. Extract maximum clinical value.
- **Very long content (> 15000 chars)**: Prioritize high-yield board exam content. Use provided text slice effectively.
- **Very technical content**: Simplify while preserving medical accuracy. Add clinical context for technical terms.
- **Fragmented content**: Connect related medical concepts. Create coherent clinical narrative.
- **Incomplete content**: Work with available information. Note if critical medical information seems missing.

=== MEDICAL CONTENT TO ANALYZE ===
${text.slice(0, 15000)}

=== VALIDATION CHECKLIST ===
Before responding, verify:
✓ High-yield information is prioritized
✓ Clinical relevance is emphasized throughout
✓ Pathophysiology is included where relevant
✓ Format uses hierarchical bullets
✓ Medical terms are explained in context
✓ Critical information is highlighted

=== MEDICAL STUDENT SUMMARY ===
Create your detailed, board exam-focused summary following the guidelines above:`;
}

// Enhanced medical flashcard prompt
function createMedicalFlashcardPrompt(text: string, count: number): string {
  return `You are an expert medical educator creating high-yield study materials for medical students preparing for board examinations (USMLE, COMLEX, etc.).

Your task: Generate exactly ${count} clinical flashcards from the following medical content. These flashcards should test clinical understanding and application, not just memorization.

=== MEDICAL FLASHCARD GUIDELINES ===
1. **CLINICAL REASONING**: Create questions that test clinical thinking and decision-making
2. **PATHOPHYSIOLOGY**: Include mechanism-based questions about disease processes
3. **DIAGNOSTIC SKILLS**: Test recognition of signs, symptoms, and diagnostic criteria
4. **THERAPEUTIC KNOWLEDGE**: Cover drug mechanisms, side effects, contraindications, and treatment protocols
5. **DIFFERENTIAL DIAGNOSIS**: Include questions about distinguishing between similar conditions
6. **BOARD EXAM STYLE**: Mirror the format and complexity of actual medical board questions
7. **REAL-WORLD APPLICATION**: Use realistic clinical scenarios when possible

=== QUESTION TYPES TO INCLUDE ===
- **Mechanism Questions**: "How does [drug/process] work?"
- **Clinical Scenarios**: "A 45-year-old patient presents with..."
- **Diagnostic Criteria**: "What are the criteria for diagnosing..."
- **Pharmacology**: "What is the mechanism of action of..."
- **Pathophysiology**: "What causes [condition] at the cellular level?"
- **Management**: "What is the first-line treatment for..."
- **Complications**: "What is the most serious complication of..."

=== ANSWER GUIDELINES ===
- Keep answers concise but complete (≤ 40 words for clinical context)
- Include relevant clinical details
- Mention key pathophysiology when applicable
- Use proper medical terminology
- Provide actionable clinical information

=== OUTPUT FORMAT ===
Generate exactly ${count} flashcards using this precise format:
Q: [Clinical question or realistic scenario]
A: [Concise, accurate medical answer with relevant clinical details]

Continue until you have exactly ${count} unique flashcards.

=== MEDICAL CONTENT FOR FLASHCARD GENERATION ===
${text.slice(0, 12000)}

=== BEGIN FLASHCARD GENERATION ===
Generate the ${count} medical flashcards now:`;
}

// Enhanced medical topic detection prompt
function createMedicalTopicPrompt(text: string): string {
  return `You are a medical education specialist and clinical expert. Analyze the following medical content and extract 3-8 key medical topics, specialties, or clinical areas.

=== MEDICAL TOPIC EXTRACTION GUIDELINES ===
1. **MEDICAL SPECIALTIES**: Identify specific medical fields (e.g., Cardiology, Neurology, Psychiatry)
2. **CLINICAL SYSTEMS**: Recognize body systems (e.g., Cardiovascular, Respiratory, Neurological)
3. **DISEASE CATEGORIES**: Identify condition types (e.g., Infectious Diseases, Autoimmune Disorders)
4. **CLINICAL AREAS**: Recognize practice areas (e.g., Emergency Medicine, Internal Medicine, Surgery)
5. **SUBSPECIALTIES**: Include relevant subspecialties (e.g., Interventional Cardiology, Pediatric Surgery)
6. **PATHOPHYSIOLOGY AREAS**: Identify mechanism-based topics (e.g., Cellular Biology, Pharmacokinetics)

=== TOPIC SELECTION CRITERIA ===
- Focus on the MOST CLINICALLY RELEVANT topics for medical education
- Each topic should be 1-3 words maximum for clarity
- Prioritize topics that would be tested on medical board exams
- Avoid generic terms like "medicine" or "health"
- Include both broad specialties and specific clinical areas
- Return 3-8 topics total, ranked by clinical importance

=== OUTPUT FORMAT ===
MEDICAL TOPICS:
<topic1>
<topic2>
<topic3>
...
(Continue for 3-8 most relevant medical topics)

=== MEDICAL CONTENT TO ANALYZE ===
${text.slice(0, 10000)}

=== MEDICAL TOPIC ANALYSIS ===
Extract the most clinically relevant medical topics now:`;
}

// Main handler for the Edge Function
serve(async (req) => {
  console.log(`🏥 Med Student Mode Edge Function called: ${req.method}`);
  
  // Handle CORS preflight requests (OPTIONS method)
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  // Only allow POST requests for actual processing
  const methodError = validateMethod(req, ['POST']);
  if (methodError) {
    return methodError;
  }

  // Initialize Supabase client for database operations
  const supabase = getSupabaseClient();

  try {
    const bodyResult = await parseJsonBody<{
      text: string;
      action: string;
      model?: string;
      maxTokens?: number;
      pageCount?: number;
    }>(req);
    if (bodyResult.error) {
      return bodyResult.error;
    }

    const { text, action, model = 'claude-3-haiku-20240307', maxTokens = 2000, pageCount = 0 } = bodyResult.data;

    console.log(`🏥 Processing medical action: ${action}`);
    
    // Extract user ID from the request for usage tracking
    const authResult = await authenticateUser(req, false);
    const userId = authResult.user?.id || null;
    
    if (userId) {
      console.log(`👤 User authenticated: ${userId}`);
    }

    // Handle ping action for API validation
    if (action === 'ping') {
      console.log('🏓 Ping request received');
      return successResponse({ ok: true, service: 'Med Student Mode', version: '2.0' });
    }

    // Enhanced input validation with medical focus
    const textError = validateNonEmptyString(text, 'text');
    if (textError) {
      return errorResponse(
        'Medical text content is required for processing. Please provide medical content such as textbooks, lecture notes, or clinical cases',
        400
      );
    }

    // Validate medical content quality
    const validation = validateMedicalContent(text);
    if (!validation.isValid) {
      return errorResponse(
        validation.feedback + '. Consider providing more clinically-focused medical content for better results',
        400,
        { score: validation.score }
      );
    }

    console.log(`✅ Medical content validation passed (score: ${validation.score}): ${validation.feedback}`);
    
    let aiPrompt = '';
    let responseData: { [key: string]: any } = {};

    // Medical summary generation
    if (action === 'summarize_medical_text') {
      console.log('📚 Generating medical summary...');
      
      aiPrompt = createMedicalSummaryPrompt(text);
      
      const result = await callAnthropicForMedicalContent(aiPrompt, model, maxTokens);
      if ('error' in result) {
        console.error('❌ Medical summary generation failed:', result.error);
        return errorResponse(result.error as string, 500);
      }
      
      // Extract and clean the summary
      let summary = result.output;
      if (summary.includes('=== MEDICAL STUDENT SUMMARY ===')) {
        summary = summary.split('=== MEDICAL STUDENT SUMMARY ===')[1] || summary;
      }
      summary = summary.trim();

      console.log(`✅ Medical summary generated, length: ${summary.length}, tokens: ${result.tokens?.total || 0}`);
      responseData = {
        summary,
        tokens: result.tokens || { input: 0, output: 0, total: 0 }
      };

    } else if (action === 'generate_medical_flashcards') {
      const cardCount = Math.max(1, Math.min(Number(requestBody.count) || 10, 50));
      console.log(`🃏 Generating ${cardCount} medical flashcards...`);
      
      aiPrompt = createMedicalFlashcardPrompt(text, cardCount);

      const result = await callAnthropicForMedicalContent(aiPrompt, model, maxTokens);
      if ('error' in result) {
        console.error('❌ Medical flashcard generation failed:', result.error);
        return errorResponse(result.error as string, 500);
      }

      // Parse medical flashcards with enhanced processing
      const flashcards = parseMedicalFlashcards(result.output, cardCount);

      if (flashcards.length === 0) {
        console.error('❌ No valid medical flashcards could be parsed');
        return errorResponse(
          'No valid medical flashcards could be generated from this content. Try providing more structured medical content with clear concepts to learn',
          502
        );
      }

      console.log(`✅ Generated ${flashcards.length} valid medical flashcards, tokens: ${result.tokens?.total || 0}`);
      responseData = {
        flashcards,
        tokens: result.tokens || { input: 0, output: 0, total: 0 }
      };

    } else if (action === 'detect_medical_topics') {
      console.log('🔍 Detecting medical topics...');
      
      aiPrompt = createMedicalTopicPrompt(text);

      const result = await callAnthropicForMedicalContent(aiPrompt, model, 500);
      if ('error' in result) {
        console.error('❌ Medical topic detection failed:', result.error);
        return errorResponse(result.error as string, 500);
      }

      // Parse medical topics with enhanced processing
      const topics = parseMedicalTopics(result.output);

      console.log(`✅ Detected ${topics.length} medical topics:`, topics, `tokens: ${result.tokens?.total || 0}`);
      responseData = {
        topics,
        tokens: result.tokens || { input: 0, output: 0, total: 0 }
      };

    } else {
      return errorResponse(
        'Invalid action for Med Student Mode. Use one of the supported medical education actions',
        400,
        { supportedActions: ['ping', 'summarize_medical_text', 'generate_medical_flashcards', 'detect_medical_topics'] }
      );
    }

    // Update user usage tracking (if pageCount provided and user identified)
    if (userId && pageCount > 0) {
      try {
        console.log(`📊 Updating usage for user ${userId}: +${pageCount} pages`);
        const { error: updateError } = await supabase.rpc('increment_user_usage', {
          user_id_param: userId,
          pages_to_add: pageCount
        });

        if (updateError) {
          console.error('⚠️ Failed to update user usage:', updateError);
        } else {
          console.log(`✅ User ${userId} usage updated by ${pageCount} pages for medical content`);
        }
      } catch (usageError) {
        console.error('⚠️ Usage update error:', usageError);
        // Don't fail the main request due to usage tracking errors
      }
    }

    // Log successful processing
    console.log(`✅ Med Student Mode processing completed successfully for action: ${action}`);

    return successResponse({ 
      medicalMode: true,
      contentQuality: validation.score,
      ...responseData 
    });

  } catch (error) {
    console.error('💥 Med Student Mode Edge Function error:', error);
    return errorResponse(
      `Medical processing server error: ${error instanceof Error ? error.message : String(error)}. Please try again with your medical content`,
      500
    );
  }
});