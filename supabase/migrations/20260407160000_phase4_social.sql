-- Phase 4: Social & Collaboration Features
-- Local migration file - apply via supabase db push when ready

-- ============================================================
-- 1. Add username column to user_profiles
-- ============================================================
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'username_format'
  ) THEN
    ALTER TABLE user_profiles ADD CONSTRAINT username_format
      CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,20}$');
  END IF;
END $$;

COMMENT ON COLUMN user_profiles.username IS 'Unique lowercase username for friend system (3-20 chars, alphanumeric + underscore)';

CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username) WHERE username IS NOT NULL;

-- ============================================================
-- 2. User Connections (Friend System)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(requester_id, receiver_id)
);

COMMENT ON TABLE user_connections IS 'Friend connections between users';

ALTER TABLE user_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view connections they are part of" ON user_connections;
CREATE POLICY "Users can view connections they are part of" ON user_connections
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Users can send friend requests" ON user_connections;
CREATE POLICY "Users can send friend requests" ON user_connections
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Users can update connections they received" ON user_connections;
CREATE POLICY "Users can update connections they received" ON user_connections
  FOR UPDATE USING (auth.uid() = receiver_id OR auth.uid() = requester_id);

DROP POLICY IF EXISTS "Users can delete own connections" ON user_connections;
CREATE POLICY "Users can delete own connections" ON user_connections
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

-- ============================================================
-- 3. Study Groups
-- ============================================================
CREATE TABLE IF NOT EXISTS study_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_url TEXT,
  group_code TEXT UNIQUE NOT NULL DEFAULT substr(md5(random()::text), 1, 8),
  max_members INTEGER DEFAULT 20,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE study_groups IS 'Persistent study groups for collaborative learning';

ALTER TABLE study_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active groups" ON study_groups;
CREATE POLICY "Anyone can view active groups" ON study_groups
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Authenticated users can create groups" ON study_groups;
CREATE POLICY "Authenticated users can create groups" ON study_groups
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creators can update their groups" ON study_groups;
CREATE POLICY "Creators can update their groups" ON study_groups
  FOR UPDATE USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creators can delete their groups" ON study_groups;
CREATE POLICY "Creators can delete their groups" ON study_groups
  FOR DELETE USING (auth.uid() = creator_id);

-- ============================================================
-- 4. Study Group Members
-- ============================================================
CREATE TABLE IF NOT EXISTS study_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')) DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, user_id)
);

COMMENT ON TABLE study_group_members IS 'Membership records for study groups';

ALTER TABLE study_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view group membership" ON study_group_members;
CREATE POLICY "Members can view group membership" ON study_group_members
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM study_group_members sgm WHERE sgm.group_id = study_group_members.group_id AND sgm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can join groups" ON study_group_members;
CREATE POLICY "Users can join groups" ON study_group_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Members can leave or admins can remove" ON study_group_members;
CREATE POLICY "Members can leave or admins can remove" ON study_group_members
  FOR DELETE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM study_group_members sgm WHERE sgm.group_id = study_group_members.group_id AND sgm.user_id = auth.uid() AND sgm.role = 'admin')
  );

-- ============================================================
-- 5. Study Group Messages (Real-time Chat)
-- ============================================================
CREATE TABLE IF NOT EXISTS study_group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'file')),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE study_group_messages IS 'Real-time chat messages within study groups';

ALTER TABLE study_group_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Group members can view messages" ON study_group_messages;
CREATE POLICY "Group members can view messages" ON study_group_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM study_group_members sgm WHERE sgm.group_id = study_group_messages.group_id AND sgm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Group members can send messages" ON study_group_messages;
CREATE POLICY "Group members can send messages" ON study_group_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM study_group_members sgm WHERE sgm.group_id = study_group_messages.group_id AND sgm.user_id = auth.uid())
  );

-- Enable Supabase Realtime for live chat
ALTER PUBLICATION supabase_realtime ADD TABLE study_group_messages;

CREATE INDEX IF NOT EXISTS idx_study_group_messages_group_id ON study_group_messages(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_connections_status ON user_connections(receiver_id, status) WHERE status = 'pending';
