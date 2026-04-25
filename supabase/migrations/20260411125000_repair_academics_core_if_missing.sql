/*
  # Repair: Academics core tables (idempotent)

  Same DDL as 20260301090000_create_academics_core_tables.sql, placed between
  20260411120000 (SRS) and 20260411130000 (academics_exams) so that databases
  where the 202603 migration was recorded but objects were never created still
  get academics_courses before the exams FK runs.

  Safe on fresh databases: CREATE IF NOT EXISTS / OR REPLACE / DROP IF EXISTS.
*/

-- =====================================================
-- Topics
-- =====================================================
CREATE TABLE IF NOT EXISTS academics_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text GENERATED ALWAYS AS (lower(trim(name))) STORED,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academics_topics_name_len_chk CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  CONSTRAINT academics_topics_name_not_blank_chk CHECK (trim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_academics_topics_normalized_name_unique
  ON academics_topics(normalized_name);

CREATE INDEX IF NOT EXISTS idx_academics_topics_created_at
  ON academics_topics(created_at DESC);

ALTER TABLE academics_topics ENABLE ROW LEVEL SECURITY;

-- Basic server-side profanity guard (placeholder list, can be expanded later)
CREATE OR REPLACE FUNCTION academics_contains_profanity(input_text text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  lowered text := lower(coalesce(input_text, ''));
  banned_terms text[] := ARRAY['fuck', 'shit', 'bitch', 'asshole', 'bastard'];
  term text;
BEGIN
  FOREACH term IN ARRAY banned_terms
  LOOP
    IF position(term IN lowered) > 0 THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION academics_validate_topic_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF academics_contains_profanity(NEW.name) THEN
    RAISE EXCEPTION 'Topic name contains prohibited language';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_academics_validate_topic_name ON academics_topics;
CREATE TRIGGER trigger_academics_validate_topic_name
  BEFORE INSERT OR UPDATE ON academics_topics
  FOR EACH ROW
  EXECUTE FUNCTION academics_validate_topic_name();

-- Authenticated users can discover shared topics
DROP POLICY IF EXISTS "Authenticated users can read academics topics" ON academics_topics;
CREATE POLICY "Authenticated users can read academics topics"
  ON academics_topics
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can create new shared topics
DROP POLICY IF EXISTS "Authenticated users can create academics topics" ON academics_topics;
CREATE POLICY "Authenticated users can create academics topics"
  ON academics_topics
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (created_by IS NULL OR created_by = auth.uid())
  );

-- Prevent arbitrary topic edits/deletes from clients
DROP POLICY IF EXISTS "Users can update own created topics" ON academics_topics;
CREATE POLICY "Users can update own created topics"
  ON academics_topics
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can delete own created topics" ON academics_topics;
CREATE POLICY "Users can delete own created topics"
  ON academics_topics
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- =====================================================
-- Courses
-- =====================================================
CREATE TABLE IF NOT EXISTS academics_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES academics_topics(id) ON DELETE RESTRICT,
  course_name text NOT NULL,
  course_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academics_courses_name_len_chk CHECK (char_length(trim(course_name)) BETWEEN 2 AND 120),
  CONSTRAINT academics_courses_name_not_blank_chk CHECK (trim(course_name) <> ''),
  CONSTRAINT academics_courses_code_len_chk CHECK (
    course_code IS NULL OR char_length(trim(course_code)) BETWEEN 1 AND 40
  )
);

CREATE INDEX IF NOT EXISTS idx_academics_courses_user_created
  ON academics_courses(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_academics_courses_topic_id
  ON academics_courses(topic_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_academics_courses_user_name_unique
  ON academics_courses(user_id, lower(trim(course_name)));

ALTER TABLE academics_courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own academics courses" ON academics_courses;
CREATE POLICY "Users can read own academics courses"
  ON academics_courses
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own academics courses" ON academics_courses;
CREATE POLICY "Users can insert own academics courses"
  ON academics_courses
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own academics courses" ON academics_courses;
CREATE POLICY "Users can update own academics courses"
  ON academics_courses
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own academics courses" ON academics_courses;
CREATE POLICY "Users can delete own academics courses"
  ON academics_courses
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Keep updated_at current
CREATE OR REPLACE FUNCTION set_academics_courses_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_academics_courses_updated_at ON academics_courses;
CREATE TRIGGER trigger_set_academics_courses_updated_at
  BEFORE UPDATE ON academics_courses
  FOR EACH ROW
  EXECUTE FUNCTION set_academics_courses_updated_at();

-- =====================================================
-- Course <-> Library Item mapping
-- =====================================================
CREATE TABLE IF NOT EXISTS academics_course_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES academics_courses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES user_library_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_academics_course_items_course
  ON academics_course_items(course_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_academics_course_items_item
  ON academics_course_items(item_id);

ALTER TABLE academics_course_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own academics course items" ON academics_course_items;
CREATE POLICY "Users can read own academics course items"
  ON academics_course_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM academics_courses c
      WHERE c.id = academics_course_items.course_id
        AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own academics course items" ON academics_course_items;
CREATE POLICY "Users can insert own academics course items"
  ON academics_course_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM academics_courses c
      WHERE c.id = academics_course_items.course_id
        AND c.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM user_library_items uli
      WHERE uli.id = academics_course_items.item_id
        AND uli.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own academics course items" ON academics_course_items;
CREATE POLICY "Users can delete own academics course items"
  ON academics_course_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM academics_courses c
      WHERE c.id = academics_course_items.course_id
        AND c.user_id = auth.uid()
    )
  );

-- =====================================================
-- Course <-> Quiz mapping
-- =====================================================
CREATE TABLE IF NOT EXISTS academics_course_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES academics_courses(id) ON DELETE CASCADE,
  quiz_session_id uuid NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, quiz_session_id)
);

CREATE INDEX IF NOT EXISTS idx_academics_course_quizzes_course
  ON academics_course_quizzes(course_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_academics_course_quizzes_quiz
  ON academics_course_quizzes(quiz_session_id);

ALTER TABLE academics_course_quizzes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own academics course quizzes" ON academics_course_quizzes;
CREATE POLICY "Users can read own academics course quizzes"
  ON academics_course_quizzes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM academics_courses c
      WHERE c.id = academics_course_quizzes.course_id
        AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own academics course quizzes" ON academics_course_quizzes;
CREATE POLICY "Users can insert own academics course quizzes"
  ON academics_course_quizzes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM academics_courses c
      WHERE c.id = academics_course_quizzes.course_id
        AND c.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM quiz_sessions qs
      WHERE qs.id = academics_course_quizzes.quiz_session_id
        AND qs.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own academics course quizzes" ON academics_course_quizzes;
CREATE POLICY "Users can delete own academics course quizzes"
  ON academics_course_quizzes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM academics_courses c
      WHERE c.id = academics_course_quizzes.course_id
        AND c.user_id = auth.uid()
    )
  );

