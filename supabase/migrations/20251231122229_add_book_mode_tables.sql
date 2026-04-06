/*
  # Book Mode System - Database Schema

  ## Overview
  Creates database tables and columns for Book Mode feature:
  1. summary_notes - Persistent notes for summaries (page-level and book-level)
  2. book_widget_layouts - Free-form widget layout persistence
  3. reading_progress - Track reading progress per summary
  4. page_break_config - Pagination configuration cache
  5. free_form_mode_enabled - User preference for free-form mode

  ## Changes
  1. Create summary_notes table
  2. Create book_widget_layouts table
  3. Add reading_progress column to user_library_items
  4. Add page_break_config column to user_library_items
  5. Add free_form_mode_enabled to user_preferences
  6. Create indexes for performance
  7. Add RLS policies for security
*/

-- =====================================================================
-- STEP 1: Create summary_notes table
-- =====================================================================

CREATE TABLE IF NOT EXISTS summary_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_id uuid NOT NULL REFERENCES user_library_items(id) ON DELETE CASCADE,
  page_index int, -- NULL for book-level notes
  note_type text NOT NULL CHECK (note_type IN ('page', 'book')) DEFAULT 'page',
  content text NOT NULL,
  text_anchor_start int, -- Character position for future inline annotations
  text_anchor_end int,
  selected_text text, -- The text that was selected (for future use)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE summary_notes IS 'User notes attached to summaries, either page-level or book-level';
COMMENT ON COLUMN summary_notes.page_index IS 'Page number (0-indexed). NULL for book-level notes';
COMMENT ON COLUMN summary_notes.note_type IS 'Type of note: page (attached to specific page) or book (general book note)';
COMMENT ON COLUMN summary_notes.text_anchor_start IS 'Character position start for inline annotations (future feature)';
COMMENT ON COLUMN summary_notes.text_anchor_end IS 'Character position end for inline annotations (future feature)';

-- =====================================================================
-- STEP 2: Create book_widget_layouts table
-- =====================================================================

CREATE TABLE IF NOT EXISTS book_widget_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_id uuid REFERENCES user_library_items(id) ON DELETE CASCADE, -- NULL for new summaries not yet saved
  layout_json jsonb NOT NULL, -- Array of widget configurations
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, summary_id) -- One layout per user per summary
);

COMMENT ON TABLE book_widget_layouts IS 'Stores free-form widget layouts for Book Mode. Layout JSON contains widget positions, sizes, and states';
COMMENT ON COLUMN book_widget_layouts.summary_id IS 'ID of the summary. NULL for new summaries not yet saved to library';
COMMENT ON COLUMN book_widget_layouts.layout_json IS 'JSON array of widget configs: [{id, type, position: {x,y}, size: {w,h}, isCollapsed, isMinimized, zIndex}]';

-- =====================================================================
-- STEP 3: Add reading_progress to user_library_items
-- =====================================================================

ALTER TABLE user_library_items
ADD COLUMN IF NOT EXISTS reading_progress jsonb DEFAULT '{"last_page": 0, "last_position": 0, "pages_read": []}'::jsonb;

COMMENT ON COLUMN user_library_items.reading_progress IS 'Reading progress tracking: last_page (current page), last_position (scroll position), pages_read (array of page indices)';

-- =====================================================================
-- STEP 4: Add page_break_config to user_library_items
-- =====================================================================

ALTER TABLE user_library_items
ADD COLUMN IF NOT EXISTS page_break_config jsonb;

COMMENT ON COLUMN user_library_items.page_break_config IS 'Cached pagination configuration: {pages: [{index, start, end, content}], total_pages, page_size}';

-- =====================================================================
-- STEP 5: Add free_form_mode_enabled to user_preferences
-- =====================================================================

ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS free_form_mode_enabled boolean DEFAULT false;

COMMENT ON COLUMN user_preferences.free_form_mode_enabled IS 'User preference for free-form widget mode. Default: false (traditional view)';

-- =====================================================================
-- STEP 6: Create indexes for performance
-- =====================================================================

-- Indexes for summary_notes
CREATE INDEX IF NOT EXISTS idx_summary_notes_user_id ON summary_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_summary_notes_summary_id ON summary_notes(summary_id);
CREATE INDEX IF NOT EXISTS idx_summary_notes_user_summary_page ON summary_notes(user_id, summary_id, page_index);

-- Indexes for book_widget_layouts
CREATE INDEX IF NOT EXISTS idx_book_widget_layouts_user_id ON book_widget_layouts(user_id);
CREATE INDEX IF NOT EXISTS idx_book_widget_layouts_summary_id ON book_widget_layouts(summary_id);
CREATE INDEX IF NOT EXISTS idx_book_widget_layouts_user_summary ON book_widget_layouts(user_id, summary_id);

-- =====================================================================
-- STEP 7: Enable RLS on new tables
-- =====================================================================

ALTER TABLE summary_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_widget_layouts ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- STEP 8: RLS Policies for summary_notes
-- =====================================================================

-- Users can view their own notes
CREATE POLICY "Users can view own summary notes"
  ON summary_notes FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own notes
CREATE POLICY "Users can insert own summary notes"
  ON summary_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own notes
CREATE POLICY "Users can update own summary notes"
  ON summary_notes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own notes
CREATE POLICY "Users can delete own summary notes"
  ON summary_notes FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================================
-- STEP 9: RLS Policies for book_widget_layouts
-- =====================================================================

-- Users can view their own layouts
CREATE POLICY "Users can view own widget layouts"
  ON book_widget_layouts FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own layouts
CREATE POLICY "Users can insert own widget layouts"
  ON book_widget_layouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own layouts
CREATE POLICY "Users can update own widget layouts"
  ON book_widget_layouts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own layouts
CREATE POLICY "Users can delete own widget layouts"
  ON book_widget_layouts FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================================
-- STEP 10: Create trigger to update updated_at for summary_notes
-- =====================================================================

CREATE OR REPLACE FUNCTION update_summary_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_summary_notes_updated_at_trigger ON summary_notes;
CREATE TRIGGER update_summary_notes_updated_at_trigger
  BEFORE UPDATE ON summary_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_summary_notes_updated_at();

-- =====================================================================
-- STEP 11: Create trigger to update updated_at for book_widget_layouts
-- =====================================================================

CREATE OR REPLACE FUNCTION update_book_widget_layouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_book_widget_layouts_updated_at_trigger ON book_widget_layouts;
CREATE TRIGGER update_book_widget_layouts_updated_at_trigger
  BEFORE UPDATE ON book_widget_layouts
  FOR EACH ROW
  EXECUTE FUNCTION update_book_widget_layouts_updated_at();

-- =====================================================================
-- STEP 12: Update initialize_user_preferences function
-- =====================================================================

CREATE OR REPLACE FUNCTION initialize_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_preferences (user_id, sidebar_mode, color_theme, free_form_mode_enabled)
  VALUES (NEW.id, 'collapsible', 'soft-minimal', false)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION initialize_user_preferences IS 'Initialize user preferences with default values including free_form_mode_enabled when user profile is created';

-- =====================================================================
-- STEP 13: Backfill existing user_preferences
-- =====================================================================

-- Set default free_form_mode_enabled for existing users
UPDATE user_preferences
SET free_form_mode_enabled = false
WHERE free_form_mode_enabled IS NULL;

-- =====================================================================
-- STEP 14: Verification
-- =====================================================================

DO $$
DECLARE
  v_notes_table_exists boolean;
  v_layouts_table_exists boolean;
  v_reading_progress_exists boolean;
  v_page_config_exists boolean;
  v_free_form_pref_exists boolean;
BEGIN
  -- Check summary_notes table
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'summary_notes'
  ) INTO v_notes_table_exists;

  -- Check book_widget_layouts table
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'book_widget_layouts'
  ) INTO v_layouts_table_exists;

  -- Check reading_progress column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_library_items'
      AND column_name = 'reading_progress'
  ) INTO v_reading_progress_exists;

  -- Check page_break_config column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_library_items'
      AND column_name = 'page_break_config'
  ) INTO v_page_config_exists;

  -- Check free_form_mode_enabled column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_preferences'
      AND column_name = 'free_form_mode_enabled'
  ) INTO v_free_form_pref_exists;

  IF v_notes_table_exists THEN
    RAISE NOTICE '✓ summary_notes table created';
  ELSE
    RAISE WARNING '⚠ summary_notes table not found';
  END IF;

  IF v_layouts_table_exists THEN
    RAISE NOTICE '✓ book_widget_layouts table created';
  ELSE
    RAISE WARNING '⚠ book_widget_layouts table not found';
  END IF;

  IF v_reading_progress_exists THEN
    RAISE NOTICE '✓ reading_progress column added to user_library_items';
  ELSE
    RAISE WARNING '⚠ reading_progress column not found';
  END IF;

  IF v_page_config_exists THEN
    RAISE NOTICE '✓ page_break_config column added to user_library_items';
  ELSE
    RAISE WARNING '⚠ page_break_config column not found';
  END IF;

  IF v_free_form_pref_exists THEN
    RAISE NOTICE '✓ free_form_mode_enabled column added to user_preferences';
  ELSE
    RAISE WARNING '⚠ free_form_mode_enabled column not found';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'Migration complete! Book Mode database schema is ready.';
  RAISE NOTICE '';
END $$;

