-- Per-course defaults for what to generate (summary / flashcards / quiz types) to avoid wasted credits.

ALTER TABLE public.academics_courses
  ADD COLUMN IF NOT EXISTS content_generation_options jsonb NOT NULL DEFAULT '{
    "includeSummary": true,
    "includeFlashcards": true,
    "quizQuestionTypes": ["multiple_choice", "true_false", "fill_in_blank", "open_ended"]
  }'::jsonb;

COMMENT ON COLUMN public.academics_courses.content_generation_options IS
  'JSON: includeSummary, includeFlashcards, quizQuestionTypes[] — controls Academics upload pipeline.';
