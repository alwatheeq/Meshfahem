/*
  # Create cached_content table for deduplication

  1. New Tables
    - `cached_content`
      - `id` (uuid, primary key)
      - `content_hash` (text, unique) - SHA-256 hash of normalized text
      - `summary` (text) - Generated summary
      - `flashcards` (jsonb) - Generated flashcards as JSON array
      - `created_at` (timestamp) - When the content was cached
      - `expires_at` (timestamp) - When the cache expires (365 days from creation)
      
  2. Security
    - Enable RLS on `cached_content` table
    - Add policy for public read access (allows deduplication for all users)
    - Add policy for authenticated users to insert new cached content
    
  3. Indexes
    - Unique index on content_hash for efficient lookups
    - Index on expires_at for cleanup queries
*/

CREATE TABLE IF NOT EXISTS cached_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash text NOT NULL,
  summary text,
  flashcards jsonb,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- Create unique index on content_hash for efficient lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_cached_content_hash ON cached_content(content_hash);

-- Create index on expires_at for cleanup operations
CREATE INDEX IF NOT EXISTS idx_cached_content_expires_at ON cached_content(expires_at);

-- Enable Row Level Security
ALTER TABLE cached_content ENABLE ROW LEVEL SECURITY;

-- Policy to allow public read access to cached content
-- This enables deduplication for all users, even anonymous ones
CREATE POLICY "Allow public read access to cached content"
  ON cached_content
  FOR SELECT
  USING (expires_at > now());

-- Policy to allow authenticated users to insert cached content
CREATE POLICY "Allow authenticated users to insert cached content"
  ON cached_content
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy to allow system cleanup of expired content (optional, for future use)
CREATE POLICY "Allow cleanup of expired content"
  ON cached_content
  FOR DELETE
  TO authenticated
  USING (expires_at <= now());