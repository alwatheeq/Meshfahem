/*
  # Create Feedback and Suggestions Table

  1. New Tables
    - `user_feedback`
      - `id` (uuid, primary key, auto-generated)
      - `user_id` (uuid, references auth.users)
      - `feedback_type` (text, 'feedback' or 'suggestion')
      - `feedback_text` (text, the user's feedback/suggestion)
      - `media_urls` (text array, URLs of uploaded images/videos)
      - `status` (text, default 'pending', for admin tracking)
      - `user_email` (text, user's email for context)
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())
  
  2. Security
    - Enable RLS on `user_feedback` table
    - Add policy for authenticated users to insert their own feedback
    - Add policy for authenticated users to read their own feedback
    - Add policy for service role to read all feedback (for admin access)
  
  3. Storage Bucket
    - Create a storage bucket for feedback media files
    - Enable RLS on the bucket
    - Allow authenticated users to upload to their own folder
*/

-- Create user_feedback table
CREATE TABLE IF NOT EXISTS user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_type text NOT NULL CHECK (feedback_type IN ('feedback', 'suggestion')),
  feedback_text text NOT NULL,
  media_urls text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  user_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- Create policies for user_feedback
CREATE POLICY "Users can insert own feedback"
  ON user_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own feedback"
  ON user_feedback
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_user_feedback_updated_at
  BEFORE UPDATE ON user_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create storage bucket for feedback media
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-media', 'feedback-media', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage bucket
CREATE POLICY "Users can upload feedback media"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'feedback-media' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view own feedback media"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'feedback-media' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Service role can view all feedback media"
  ON storage.objects
  FOR SELECT
  TO service_role
  USING (bucket_id = 'feedback-media');