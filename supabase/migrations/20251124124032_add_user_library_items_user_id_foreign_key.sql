/*
  # Add Foreign Key Constraint for user_library_items

  1. Changes
    - Add foreign key constraint from user_library_items.user_id to user_profiles.id
    - This enables Supabase PostgREST to use the shorthand join syntax
    - Fixes the PGRST200 error when fetching library items with user profiles

  2. Why This Is Needed
    - PostgREST requires explicit foreign key constraints to perform joins
    - Without this, the query fails with "Could not find a relationship" error
    - The manual SQL join works, but the API syntax requires the FK

  3. Impact
    - Enables fetching library items with creator email in one query
    - Improves performance by reducing round trips
    - Maintains referential integrity
*/

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_library_items_user_id_fkey'
    AND table_name = 'user_library_items'
  ) THEN
    ALTER TABLE user_library_items
    ADD CONSTRAINT user_library_items_user_id_fkey
    FOREIGN KEY (user_id) 
    REFERENCES user_profiles(id)
    ON DELETE CASCADE;
  END IF;
END $$;
