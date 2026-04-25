/** Shared preferences for Academics course generation and dashboard processing (credit-aware). */

export type QuizQuestionTypePreference =
  | 'multiple_choice'
  | 'true_false'
  | 'fill_in_blank'
  | 'open_ended';

export interface AcademicsGenerationPreferences {
  includeSummary: boolean;
  includeFlashcards: boolean;
  quizQuestionTypes: QuizQuestionTypePreference[];
}

export const ALL_QUIZ_QUESTION_TYPES: QuizQuestionTypePreference[] = [
  'multiple_choice',
  'true_false',
  'fill_in_blank',
  'open_ended',
];

export const DEFAULT_ACADEMICS_GENERATION_PREFERENCES: AcademicsGenerationPreferences = {
  includeSummary: true,
  includeFlashcards: true,
  quizQuestionTypes: [...ALL_QUIZ_QUESTION_TYPES],
};

export function mergeGenerationPreferences(raw: unknown): AcademicsGenerationPreferences {
  const d = DEFAULT_ACADEMICS_GENERATION_PREFERENCES;
  if (!raw || typeof raw !== 'object') {
    return {
      includeSummary: d.includeSummary,
      includeFlashcards: d.includeFlashcards,
      quizQuestionTypes: [...d.quizQuestionTypes],
    };
  }
  const o = raw as Record<string, unknown>;
  const qt = o.quizQuestionTypes;
  let quizQuestionTypes = [...d.quizQuestionTypes];
  if (Array.isArray(qt)) {
    const allowed = new Set<string>(ALL_QUIZ_QUESTION_TYPES);
    const filtered = qt.filter(
      (x): x is QuizQuestionTypePreference => typeof x === 'string' && allowed.has(x)
    );
    if (filtered.length > 0) quizQuestionTypes = filtered;
  }
  return {
    includeSummary: typeof o.includeSummary === 'boolean' ? o.includeSummary : d.includeSummary,
    includeFlashcards: typeof o.includeFlashcards === 'boolean' ? o.includeFlashcards : d.includeFlashcards,
    quizQuestionTypes,
  };
}

/** At least one pipeline output (Academics allows quiz-only). */
export function hasAnyGenerationOutput(p: AcademicsGenerationPreferences): boolean {
  return p.includeSummary || p.includeFlashcards || p.quizQuestionTypes.length > 0;
}

/** Dashboard requires summary and/or flashcards; optional quiz runs after if types are selected. */
export function dashboardHasRunnableOutput(p: AcademicsGenerationPreferences): boolean {
  return p.includeSummary || p.includeFlashcards;
}

/** When true, cached blob matches default “everything on” shape. */
export function prefsMatchDefaultCacheShape(p: AcademicsGenerationPreferences): boolean {
  return (
    p.includeSummary &&
    p.includeFlashcards &&
    p.quizQuestionTypes.length === ALL_QUIZ_QUESTION_TYPES.length &&
    ALL_QUIZ_QUESTION_TYPES.every((t) => p.quizQuestionTypes.includes(t))
  );
}
