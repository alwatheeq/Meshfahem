CREATE OR REPLACE FUNCTION generate_group_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  code text;
BEGIN
  code := upper(substr(md5(random()::text), 1, 6));
  WHILE EXISTS (SELECT 1 FROM study_groups WHERE group_code = code) LOOP
    code := upper(substr(md5(random()::text), 1, 6));
  END LOOP;
  RETURN code;
END;
$$;

CREATE TABLE IF NOT EXISTS study_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  group_code text UNIQUE NOT NULL DEFAULT generate_group_code(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_study_groups_code ON study_groups(group_code);
CREATE INDEX IF NOT EXISTS idx_study_group_members_user ON study_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_study_group_members_group ON study_group_members(group_id);

ALTER TABLE study_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_group_members ENABLE ROW LEVEL SECURITY;

-- study_groups policies
CREATE POLICY "Anyone can view groups they belong to"
  ON study_groups FOR SELECT
  USING (
    auth.uid() = created_by OR
    EXISTS (SELECT 1 FROM study_group_members WHERE group_id = study_groups.id AND user_id = auth.uid())
  );

CREATE POLICY "Authenticated users can create groups"
  ON study_groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group creator can update"
  ON study_groups FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Group creator can delete"
  ON study_groups FOR DELETE
  USING (auth.uid() = created_by);

-- study_group_members policies
CREATE POLICY "Members can view group members"
  ON study_group_members FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM study_group_members sgm WHERE sgm.group_id = study_group_members.group_id AND sgm.user_id = auth.uid())
  );

CREATE POLICY "Users can join groups"
  ON study_group_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update members"
  ON study_group_members FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM study_group_members sgm WHERE sgm.group_id = study_group_members.group_id AND sgm.user_id = auth.uid() AND sgm.role = 'admin')
  );

CREATE POLICY "Admins can remove members or users can leave"
  ON study_group_members FOR DELETE
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM study_group_members sgm WHERE sgm.group_id = study_group_members.group_id AND sgm.user_id = auth.uid() AND sgm.role = 'admin')
  );
