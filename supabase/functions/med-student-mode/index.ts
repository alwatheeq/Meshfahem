/// <reference path="../_shared/deno.d.ts" />
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.54.0';

// Standard CORS headers for allowing cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Security: server-side model/limits only (ignore client-provided model/maxTokens)
const DEFAULT_MODEL = 'claude-3-haiku-20240307';
const MAX_MODEL_TOKENS = 4096;

// Action-specific caps (prevents abuse + stabilizes output)
const MAX_TOKENS_BY_ACTION: Record<string, number> = {
  summarize_medical_text: 2400,
  generate_medical_flashcards: 1800,
  detect_medical_topics: 500,
};

// Chunking caps (so users can send long text safely without runaway cost)
const MAX_INPUT_CHARS_BY_ACTION: Record<string, number> = {
  summarize_medical_text: 50000,
  generate_medical_flashcards: 50000,
  detect_medical_topics: 30000,
};

const CHUNK_CHARS = 12000;
const MAX_CHUNKS = 4; // 4 * 12k = 48k chars

// Helper function to send JSON responses
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

// --- Chunking helper (paragraph-aware, hard-capped) ---
function splitIntoChunks(text: string, maxCharsPerChunk = CHUNK_CHARS, maxChunks = MAX_CHUNKS): string[] {
  const t = (text || '').trim();
  if (!t) return [];
  if (t.length <= maxCharsPerChunk) return [t];

  const paras = t.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    const c = current.trim();
    if (c) chunks.push(c);
    current = '';
  };

  for (const p of paras) {
    const para = p.trim();
    if (!para) continue;

    // If a single paragraph is too large, split by sentences (incl Arabic ؟)
    if (para.length > maxCharsPerChunk) {
      pushCurrent();

      const sentences = para.split(/(?<=[.!?؟])\s+/);
      let sCur = '';
      for (const s of sentences) {
        const cand = (sCur ? sCur + ' ' : '') + s;
        if (cand.length > maxCharsPerChunk) {
          if (sCur.trim()) chunks.push(sCur.trim());
          sCur = s;
          if (chunks.length >= maxChunks) break;
        } else {
          sCur = cand;
        }
      }
      if (chunks.length >= maxChunks) break;
      if (sCur.trim()) chunks.push(sCur.trim());
      continue;
    }

    const cand = current ? current + '\n\n' + para : para;
    if (cand.length > maxCharsPerChunk) {
      pushCurrent();
      current = para;
    } else {
      current = cand;
    }

    if (chunks.length >= maxChunks) break;
  }

  if (chunks.length < maxChunks) pushCurrent();

  // If we didn't cover all text, signal overflow by returning empty
  const covered = chunks.reduce((sum, c) => sum + c.length, 0);
  if (covered < t.length) return [];

  return chunks;
}

// Enhanced medical content validation
// Changes:
// - Adds Arabic medical keywords
// - Makes "medical-ness" advisory (not gatekeeping), but still blocks too short/too long
function validateMedicalContent(text: string): { isValid: boolean; score: number; feedback: string } {
  if (!text || typeof text !== 'string') {
    return { isValid: false, score: 0, feedback: 'No text content provided' };
  }

  const trimmedText = text.trim();

  // Hard limits only (these are the only true blockers)
  if (trimmedText.length < 100) {
    return { isValid: false, score: 0, feedback: 'Text too short for meaningful medical analysis' };
  }

  if (trimmedText.length > 50000) {
    return { isValid: false, score: 0, feedback: 'Text too long - please break into smaller sections' };
  }

  const lowerText = trimmedText.toLowerCase();

  // English + Arabic keywords (minimal set, high coverage)
  const medicalTermsEn = [
    'diagnosis', 'treatment', 'symptom', 'patient', 'disease', 'condition', 'therapy',
    'clinical', 'medical', 'pathology', 'etiology', 'prognosis', 'syndrome',
    'cardiovascular', 'respiratory', 'neurological', 'gastrointestinal', 'renal',
    'hepatic', 'cardiac', 'pulmonary', 'dermatology', 'oncology',
    'surgery', 'procedure', 'intervention', 'examination', 'assessment',
    'medication', 'drug', 'pharmacology', 'dosage', 'administration',
    'anatomy', 'physiology', 'organ', 'tissue', 'cell', 'muscle', 'bone',
    'pathophysiology', 'mechanism'
  ];

  const medicalTermsAr = [
    'تشخيص', 'علاج', 'الأعراض', 'اعراض', 'مريض', 'مرض', 'حالة', 'سريري', 'طبي', 'مرضية',
    'مسببات', 'إنذار', 'متلازمة', 'قلب', 'قلبي', 'تنفسي', 'عصبي', 'هضمي', 'كلوي', 'كبدي',
    'جراحة', 'إجراء', 'تدخل', 'فحص', 'تقييم', 'دواء', 'أدوية', 'جرعة', 'إعطاء', 'تشريح',
    'فيزيولوجيا', 'عضو', 'نسيج', 'خلية', 'عضلة', 'عظم', 'آلية', 'آليات', 'فيزيولوجية'
  ];

  const foundEn = medicalTermsEn.filter(t => lowerText.includes(t));
  const foundAr = medicalTermsAr.filter(t => trimmedText.includes(t));

  const totalTerms = medicalTermsEn.length + medicalTermsAr.length;
  const foundCount = foundEn.length + foundAr.length;
  const termScore = (foundCount / totalTerms) * 100;

  // Base score reflects "maybe medical" by default (advisory)
  let score = 45;
  score += Math.min(termScore, 45);

  // Bonus for clinical structure cues (EN/AR)
  if (lowerText.includes('patient') || lowerText.includes('clinical') || trimmedText.includes('مريض') || trimmedText.includes('سريري')) score += 10;
  if (lowerText.includes('diagnosis') || lowerText.includes('treatment') || trimmedText.includes('تشخيص') || trimmedText.includes('علاج')) score += 10;
  if (lowerText.includes('pathophysiology') || lowerText.includes('mechanism') || trimmedText.includes('آلية') || trimmedText.includes('فيزيولوجيا')) score += 10;

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Advisory: always "valid" unless hard limits above triggered
  const isValid = true;

  const feedback =
    score >= 70
      ? `Strong medical content detected (score ${score}/100)`
      : score >= 55
        ? `Some medical content detected (score ${score}/100)`
        : `Low medical signal (score ${score}/100) — results may be less accurate`;

  return { isValid, score, feedback };
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
        .replace(/^[\d\-•*.\s]+/, '') // Remove numbers, bullets, etc.
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

// Enhanced Anthropic API call with timeout + enforced model + enforced maxTokens
async function callAnthropicForMedicalContent(prompt: string, maxTokens: number) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY environment variable is not set.');
    return { error: 'Missing ANTHROPIC_API_KEY environment variable' };
  }

  const safeMaxTokens = Math.min(Math.max(200, maxTokens), MAX_MODEL_TOKENS);

  const controller = new AbortController();
  const timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: safeMaxTokens,
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: prompt }]
        }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

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
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      return { error: 'Medical AI request timed out - please try again' };
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Request to Anthropic API failed: ${msg}`);
    return { error: `Medical AI request failed: ${msg}` };
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
Deno.serve(async (req) => {
  console.log(`🏥 Med Student Mode Edge Function called: ${req.method}`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: { persistSession: false },
    }
  );

  try {
    const requestBody = await req.json();
    const { text, action, pageCount = 0 } = requestBody;

    console.log(`🏥 Processing medical action: ${action}`);

    // Extract user ID and admin role
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    let isAdmin = false;

    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id || null;

        if (userId) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle();

          isAdmin = profile?.role === 'admin';
        }

        console.log(`👤 User authenticated: ${userId} (admin=${isAdmin})`);
      } catch (error) {
        console.warn('⚠️ Failed to extract user from token:', error);
      }
    }

    if (action === 'ping') {
      return jsonResponse({ ok: true, service: 'Med Student Mode', version: '2.1' });
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return jsonResponse({
        error: 'Medical text content is required for processing',
        hint: 'Please provide medical content such as textbooks, lecture notes, or clinical cases'
      }, 400);
    }

    // Validate length per action and chunking policy (users can send long text; we chunk safely)
    const actionMaxChars = MAX_INPUT_CHARS_BY_ACTION[action] ?? 50000;
    if (text.length > actionMaxChars) {
      return jsonResponse({
        error: `Text is too long for this action (limit ${actionMaxChars} characters). Please split it.`,
      }, 400);
    }

    // Advisory medical validation (not blocking unless length violated)
    const validation = validateMedicalContent(text);
    console.log(`✅ Medical content validation (score: ${validation.score}): ${validation.feedback}`);

    if (!['summarize_medical_text', 'generate_medical_flashcards', 'detect_medical_topics', 'ping'].includes(action)) {
      return jsonResponse({
        error: 'Invalid action for Med Student Mode',
        supportedActions: ['ping', 'summarize_medical_text', 'generate_medical_flashcards', 'detect_medical_topics'],
        hint: 'Use one of the supported medical education actions'
      }, 400);
    }

    // Credits pre-check (estimate) for non-admin authenticated users
    if (userId && !isAdmin && action !== 'ping') {
      const estimateCredits = 5; // conservative minimum; actual deduction uses token usage
      const { data: creditCheck, error: creditError } = await supabase.rpc('check_sufficient_credits', {
        p_user_id: userId,
        p_estimated_credits: estimateCredits
      });

      if (creditError) {
        console.error('Failed to check credits:', creditError);
      } else if (creditCheck && !creditCheck.sufficient) {
        const cycleEnd = creditCheck.cycle_end;
        return jsonResponse({
          error: 'insufficient_credits',
          message: `You don't have enough credits. Credits refresh on ${new Date(cycleEnd).toLocaleDateString()}.`,
          credits_remaining: creditCheck.credits_remaining,
          cycle_end: cycleEnd
        }, 429);
      }
    }

    // Chunk input if needed
    const chunks = splitIntoChunks(text, CHUNK_CHARS, MAX_CHUNKS);
    if (chunks.length === 0) {
      return jsonResponse({
        error: `Text is too long to process safely (max ${MAX_CHUNKS * CHUNK_CHARS} characters). Please split it.`,
      }, 400);
    }

    let totalTokensUsed = 0;
    let responseData: Record<string, unknown> = {};

    if (action === 'summarize_medical_text') {
      console.log('📚 Generating medical summary...');
      const maxTokens = MAX_TOKENS_BY_ACTION.summarize_medical_text;

      // Generate per chunk then combine (keeps quality + supports long text)
      const chunkSummaries: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunkHeader =
          chunks.length > 1 ? `This is chunk ${i + 1} of ${chunks.length}. Do not repeat generic overview points.\n\n` : '';

        const prompt = createMedicalSummaryPrompt(chunkHeader + chunks[i]);
        const result = await callAnthropicForMedicalContent(prompt, maxTokens);

        if ('error' in result) return jsonResponse(result, 500);

        totalTokensUsed += result.tokens?.total || 0;

        const summary = result.output.trim();
        // Keep only bullet lines
        const bulletLines = summary.split('\n').map(l => l.trim()).filter(l => l.startsWith('-') || l.startsWith('  -'));
        chunkSummaries.push(bulletLines.join('\n'));
      }

      // Merge summaries (no second pass to avoid extra cost)
      const summary = chunkSummaries.filter(Boolean).join('\n');

      responseData = {
        summary,
        tokens: { total: totalTokensUsed }
      };

    } else if (action === 'generate_medical_flashcards') {
      const cardCount = Math.max(1, Math.min(Number(requestBody.count) || 10, 50));
      console.log(`🃏 Generating ${cardCount} medical flashcards...`);

      const maxTokens = MAX_TOKENS_BY_ACTION.generate_medical_flashcards;

      const combinedText = chunks.join('\n\n');

      const prompt = createMedicalFlashcardPrompt(combinedText, cardCount);
      const result = await callAnthropicForMedicalContent(prompt, maxTokens);

      if ('error' in result) return jsonResponse(result, 500);

      totalTokensUsed += result.tokens?.total || 0;

      const flashcards = parseMedicalFlashcards(result.output, cardCount);

      if (flashcards.length === 0) {
        return jsonResponse({
          error: 'No valid medical flashcards could be generated from this content',
          hint: 'Try providing more structured medical content with clear concepts to learn'
        }, 502);
      }

      responseData = {
        flashcards,
        tokens: { total: totalTokensUsed }
      };

    } else if (action === 'detect_medical_topics') {
      console.log('🔍 Detecting medical topics...');
      const maxTokens = MAX_TOKENS_BY_ACTION.detect_medical_topics;

      const combinedText = chunks.join('\n\n');
      const prompt = createMedicalTopicPrompt(combinedText);
      const result = await callAnthropicForMedicalContent(prompt, maxTokens);

      if ('error' in result) return jsonResponse(result, 500);

      totalTokensUsed += result.tokens?.total || 0;

      const topics = parseMedicalTopics(result.output);

      responseData = {
        topics,
        tokens: { total: totalTokensUsed }
      };
    }

    // Deduct credits using token usage (consistent with your other edge functions)
    if (userId && !isAdmin && action !== 'ping' && totalTokensUsed > 0) {
      try {
        const { data: deductResult, error: deductError } = await supabase.rpc('deduct_credits_atomic', {
          p_user_id: userId,
          p_tokens_used: totalTokensUsed,
          p_operation_type: 'deduction'
        });

        if (deductError) {
          console.error('⚠️ Failed to deduct credits:', deductError);
        } else if (deductResult?.success) {
          // Notifications
          if (deductResult.notify_30_percent || deductResult.notify_10_percent) {
            const percentage = deductResult.notify_10_percent ? 10 : 30;
            const message = `You have ${deductResult.credits_remaining} credits remaining (${percentage}% left). They will refresh on ${new Date(deductResult.cycle_end).toLocaleDateString()}.`;

            await supabase.from('notifications').insert({
              user_id: userId,
              notification_type: 'admin_notification',
              message,
              is_read: false
            });
          }

          responseData.credits = {
            deducted: deductResult.credits_deducted,
            remaining: deductResult.credits_remaining
          };
        }
      } catch (e) {
        console.error('⚠️ Credit deduction error:', e);
      }
    }

    // Update user usage tracking (pages) AFTER processing (independent from credits)
    if (userId && pageCount > 0) {
      try {
        const { error: updateError } = await supabase.rpc('increment_user_usage', {
          user_id_param: userId,
          pages_to_add: pageCount
        });

        if (updateError) console.error('⚠️ Failed to update user usage:', updateError);
      } catch (usageError) {
        console.error('⚠️ Usage update error:', usageError);
      }
    }

    return jsonResponse({
      success: true,
      medicalMode: true,
      contentQuality: validation.score,
      validationFeedback: validation.feedback,
      ...responseData
    });

  } catch (error: unknown) {
    console.error('💥 Med Student Mode Edge Function error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return jsonResponse({
      error: `Medical processing server error: ${msg}`,
      hint: 'Please try again with your medical content'
    }, 500);
  }
});