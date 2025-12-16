/*
  # Quiz Error Logging System

  1. New Tables
    - `quiz_generation_errors`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `error_type` (text) - Type of error (json_parse_error, text_extraction_error, api_error, etc.)
      - `error_message` (text) - Human-readable error message
      - `error_details` (jsonb) - Detailed error information
      - `source_type` (text) - Source of content (uploaded_document, library_item)
      - `file_type` (text) - Type of file if applicable (pdf, docx, pptx)
      - `ai_response` (text) - Raw AI response if JSON parsing failed
      - `question_count` (integer) - Requested number of questions
      - `difficulty` (text) - Requested difficulty level
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `quiz_generation_errors` table
    - Add policies for users to view their own errors
    - Add policy for admins to view all errors

  3. Indexes
    - Index on user_id for fast user lookups
    - Index on error_type for analysis
    - Index on created_at for chronological queries
*/

-- Create quiz_generation_errors table
CREATE TABLE IF NOT EXISTS quiz_generation_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  error_type text NOT NULL,
  error_message text NOT NULL,
  error_details jsonb DEFAULT '{}'::jsonb,
  source_type text,
  file_type text,
  ai_response text,
  question_count integer,
  difficulty text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quiz_errors_user_id ON quiz_generation_errors(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_errors_type ON quiz_generation_errors(error_type);
CREATE INDEX IF NOT EXISTS idx_quiz_errors_created_at ON quiz_generation_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_errors_file_type ON quiz_generation_errors(file_type) WHERE file_type IS NOT NULL;

-- Enable RLS
ALTER TABLE quiz_generation_errors ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own error logs
CREATE POLICY "Users can view own error logs"
  ON quiz_generation_errors
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own error logs (for client-side logging)
CREATE POLICY "Users can insert own error logs"
  ON quiz_generation_errors
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can view all error logs
CREATE POLICY "Admins can view all error logs"
  ON quiz_generation_errors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

-- Add comment for documentation
COMMENT ON TABLE quiz_generation_errors IS 'Stores error logs from quiz generation attempts for debugging and monitoring';
COMMENT ON COLUMN quiz_generation_errors.error_type IS 'Type of error: json_parse_error, text_extraction_error, api_error, validation_error, etc.';
COMMENT ON COLUMN quiz_generation_errors.error_details IS 'Detailed error information including stack traces, parsing attempts, etc.';
COMMENT ON COLUMN quiz_generation_errors.ai_response IS 'Raw AI response text when JSON parsing fails, truncated to first 10000 characters';
