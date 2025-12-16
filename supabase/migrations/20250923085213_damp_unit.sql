/*
  # Public Library RLS Policies

  This migration implements RLS policies to allow authenticated users to view all library items,
  creating a public library where users can see content published by other users.

  ## Changes Made

  1. **Removed Conflicting Policies**
     - Drops existing restrictive SELECT policies that may conflict
     - Removes the "Allow public read access to library items" policy for public role
     - Keeps the anon policy for shared links intact

  2. **New Public Library Policy**
     - Creates a clear, explicit SELECT policy for authenticated users
     - Allows all authenticated users to read all library items
     - Uses simple `true` condition for maximum clarity

  3. **Preserved Existing Policies**
     - Keeps INSERT, UPDATE, DELETE policies that restrict users to their own items
     - Maintains the anon policy for public shared links
     - Ensures data security while enabling public reading

  ## Security Notes
  - Users can read all library items (public library functionality)
  - Users can only modify/delete their own items (data protection)
  - Anonymous users can only access explicitly shared items
*/

-- Drop existing potentially conflicting SELECT policies for authenticated users
DROP POLICY IF EXISTS "Allow authenticated users to read all library items" ON public.user_library_items;
DROP POLICY IF EXISTS "Allow public read access to library items" ON public.user_library_items;

-- Create a new, explicit SELECT policy for authenticated users to access all library items
CREATE POLICY "Public library access for authenticated users"
  ON public.user_library_items
  FOR SELECT
  TO authenticated
  USING (true);

-- Verify that RLS is enabled on the table
ALTER TABLE public.user_library_items ENABLE ROW LEVEL SECURITY;

-- Add a comment to document the public library functionality
COMMENT ON POLICY "Public library access for authenticated users" ON public.user_library_items IS 
'Allows all authenticated users to view all library items, creating a public library where users can discover content from other users';