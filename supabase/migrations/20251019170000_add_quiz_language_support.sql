/*
  # Add Multi-language Support to Quiz System

  1. Schema Changes
    - Add `quiz_language` column to store the original language of the quiz (en, ar, fr, tr)
    - Add `translated_questions_json` column to store translations in JSONB format
    - Add `available_languages` column to track which translations exist

  2. Structure
    - quiz_language: varchar(10) - stores language code (en, ar, fr, tr)
    - translated_questions_json: jsonb - stores translations keyed by language code
      Example: {"ar": [...questions], "fr": [...questions], "tr": [...questions]}
    - available_languages: text[] - array of available language codes

  3. Migration Notes
    - Sets default quiz_language to 'en' for existing quizzes
    - Initializes available_languages with the quiz_language for existing records
    - Adds indexes for performance optimization
*/

-- Add quiz_language column to store the original/primary language
ALTER TABLE quiz_sessions
ADD COLUMN IF NOT EXISTS quiz_language varchar(10) DEFAULT 'en' NOT NULL;

-- Add translated_questions_json to store translations
ALTER TABLE quiz_sessions
ADD COLUMN IF NOT EXISTS translated_questions_json jsonb DEFAULT '{}'::jsonb;

-- Add available_languages array to track which translations exist
ALTER TABLE quiz_sessions
ADD COLUMN IF NOT EXISTS available_languages text[] DEFAULT ARRAY['en']::text[];

-- Update existing quizzes to have correct available_languages
UPDATE quiz_sessions
SET available_languages = ARRAY[quiz_language]::text[]
WHERE available_languages IS NULL OR available_languages = '{}';

-- Add index on quiz_language for filtering
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_quiz_language
ON quiz_sessions(quiz_language);

-- Add index on available_languages for querying
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_available_languages
ON quiz_sessions USING gin(available_languages);

-- Add check constraint to ensure quiz_language is a valid language code
ALTER TABLE quiz_sessions
ADD CONSTRAINT check_quiz_language
CHECK (quiz_language IN ('en', 'ar', 'fr', 'tr'));

-- Add comment to the table for documentation
COMMENT ON COLUMN quiz_sessions.quiz_language IS 'Primary language of the quiz (en, ar, fr, tr)';
COMMENT ON COLUMN quiz_sessions.translated_questions_json IS 'Translations of questions keyed by language code';
COMMENT ON COLUMN quiz_sessions.available_languages IS 'Array of language codes for which translations exist';
