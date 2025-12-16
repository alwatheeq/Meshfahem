/*
  # Add Delete Policy for Feedback Media

  ## Summary
  This migration adds a missing DELETE policy for the feedback-media storage bucket,
  allowing users to delete their own uploaded files before submitting feedback.

  ## Changes
  1. Storage Policies
    - Add DELETE policy for authenticated users on feedback-media bucket
    - Policy ensures users can only delete files in their own folder (user_id)

  ## Security
  - Users can only delete files in folders matching their user ID
  - Follows the same folder structure as upload policy: {user_id}/{filename}
*/

-- Drop policy if it exists (for idempotency)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can delete own feedback media" ON storage.objects;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Add delete policy for feedback media
CREATE POLICY "Users can delete own feedback media"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'feedback-media' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
