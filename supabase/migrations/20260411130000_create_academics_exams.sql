-- Exam scheduler table for academics courses
CREATE TABLE IF NOT EXISTS academics_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES academics_courses(id) ON DELETE CASCADE,
  exam_name text NOT NULL CHECK (char_length(trim(exam_name)) BETWEEN 1 AND 200),
  exam_date timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academics_exams_user_course
  ON academics_exams(user_id, course_id, exam_date);

ALTER TABLE academics_exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own exams"
  ON academics_exams FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own exams"
  ON academics_exams FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own exams"
  ON academics_exams FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own exams"
  ON academics_exams FOR DELETE
  USING (auth.uid() = user_id);
