/*
  # Create Study Rooms System

  1. New Tables
    - `study_rooms`
      - `id` (uuid, primary key)
      - `creator_id` (uuid, foreign key to auth.users)
      - `room_name` (text, max 100 chars)
      - `room_description` (text, max 500 chars)
      - `room_code` (text, unique 8-char code)
      - `max_participants` (integer, default 10, max 20)
      - `is_active` (boolean, default true)
      - `video_session_token` (text, nullable)
      - `created_at` (timestamp)
      - `expires_at` (timestamp, default now() + 48 hours)

    - `study_room_participants`
      - `room_id` (uuid, foreign key to study_rooms)
      - `user_id` (uuid, foreign key to auth.users)
      - `joined_at` (timestamp)
      - `left_at` (timestamp, nullable)
      - `is_host` (boolean, default false)
      - Primary key on (room_id, user_id)

    - `study_room_shared_items`
      - `id` (uuid, primary key)
      - `room_id` (uuid, foreign key to study_rooms)
      - `item_id` (uuid, foreign key to user_library_items, nullable)
      - `shared_by_user_id` (uuid, foreign key to auth.users)
      - `item_snapshot` (jsonb, stores copy of item data)
      - `shared_at` (timestamp)

    - `room_chat_messages`
      - `id` (uuid, primary key)
      - `room_id` (uuid, foreign key to study_rooms)
      - `user_id` (uuid, foreign key to auth.users)
      - `message_text` (text, max 1000 chars)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Public can read active rooms
    - Authenticated users can create rooms
    - Room participants can access room data

  3. Functions
    - Function to generate unique room codes
    - Function to check if room is full
*/

-- Create study_rooms table
CREATE TABLE IF NOT EXISTS study_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_name text NOT NULL CHECK (char_length(room_name) <= 100 AND char_length(room_name) > 0),
  room_description text CHECK (char_length(room_description) <= 500),
  room_code text NOT NULL UNIQUE CHECK (char_length(room_code) = 8),
  max_participants integer NOT NULL DEFAULT 10 CHECK (max_participants >= 2 AND max_participants <= 20),
  is_active boolean NOT NULL DEFAULT true,
  video_session_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours')
);

-- Create study_room_participants table
CREATE TABLE IF NOT EXISTS study_room_participants (
  room_id uuid NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  is_host boolean NOT NULL DEFAULT false,
  PRIMARY KEY (room_id, user_id)
);

-- Create study_room_shared_items table
CREATE TABLE IF NOT EXISTS study_room_shared_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  item_id uuid REFERENCES user_library_items(id) ON DELETE SET NULL,
  shared_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_snapshot jsonb NOT NULL,
  shared_at timestamptz NOT NULL DEFAULT now()
);

-- Create room_chat_messages table
CREATE TABLE IF NOT EXISTS room_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_text text NOT NULL CHECK (char_length(message_text) <= 1000 AND char_length(message_text) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE study_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_room_shared_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for study_rooms

-- Anyone can read active rooms
CREATE POLICY "Anyone can read active rooms"
  ON study_rooms
  FOR SELECT
  USING (is_active = true AND expires_at > now());

-- Authenticated users can create rooms
CREATE POLICY "Authenticated users can create rooms"
  ON study_rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

-- Creators can update their own rooms
CREATE POLICY "Creators can update own rooms"
  ON study_rooms
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- Creators can delete their own rooms
CREATE POLICY "Creators can delete own rooms"
  ON study_rooms
  FOR DELETE
  TO authenticated
  USING (auth.uid() = creator_id);

-- RLS Policies for study_room_participants

-- Room participants can read participant list
CREATE POLICY "Participants can read participant list"
  ON study_room_participants
  FOR SELECT
  TO authenticated
  USING (
    room_id IN (
      SELECT room_id
      FROM study_room_participants
      WHERE user_id = auth.uid()
    )
  );

-- Authenticated users can join rooms
CREATE POLICY "Authenticated users can join rooms"
  ON study_room_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own participation
CREATE POLICY "Users can update own participation"
  ON study_room_participants
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for study_room_shared_items

-- Participants can read shared items
CREATE POLICY "Participants can read shared items"
  ON study_room_shared_items
  FOR SELECT
  TO authenticated
  USING (
    room_id IN (
      SELECT room_id
      FROM study_room_participants
      WHERE user_id = auth.uid()
        AND left_at IS NULL
    )
  );

-- Participants can share items
CREATE POLICY "Participants can share items"
  ON study_room_shared_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = shared_by_user_id
    AND EXISTS (
      SELECT 1 FROM study_room_participants
      WHERE study_room_participants.room_id = study_room_shared_items.room_id
      AND study_room_participants.user_id = auth.uid()
      AND study_room_participants.left_at IS NULL
    )
  );

-- RLS Policies for room_chat_messages

-- Participants can read chat messages
CREATE POLICY "Participants can read chat messages"
  ON room_chat_messages
  FOR SELECT
  TO authenticated
  USING (
    room_id IN (
      SELECT room_id
      FROM study_room_participants
      WHERE user_id = auth.uid()
        AND left_at IS NULL
    )
  );

-- Participants can send chat messages
CREATE POLICY "Participants can send chat messages"
  ON room_chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM study_room_participants
      WHERE study_room_participants.room_id = room_chat_messages.room_id
      AND study_room_participants.user_id = auth.uid()
      AND study_room_participants.left_at IS NULL
    )
  );

-- Create function to generate unique room code
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
  code_exists boolean;
  attempts integer := 0;
  max_attempts integer := 100;
BEGIN
  LOOP
    attempts := attempts + 1;
    IF attempts > max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique room code after % attempts', max_attempts;
    END IF;

    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;

    SELECT EXISTS(SELECT 1 FROM study_rooms WHERE room_code = result) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;

  RETURN result;
END;
$$;

-- Create function to check if room is full
CREATE OR REPLACE FUNCTION is_room_full(room_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_count integer;
  max_count integer;
BEGIN
  SELECT COUNT(*) INTO current_count
  FROM study_room_participants
  WHERE room_id = room_uuid AND left_at IS NULL;

  SELECT max_participants INTO max_count
  FROM study_rooms
  WHERE id = room_uuid;

  IF max_count IS NULL THEN
    RETURN true;
  END IF;

  RETURN current_count >= max_count;
END;
$$;

-- Create function to auto-set first participant as host
CREATE OR REPLACE FUNCTION set_creator_as_host()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id = (SELECT creator_id FROM study_rooms WHERE id = NEW.room_id) THEN
    NEW.is_host := true;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to set creator as host
DROP TRIGGER IF EXISTS set_creator_as_host_trigger ON study_room_participants;
CREATE TRIGGER set_creator_as_host_trigger
  BEFORE INSERT ON study_room_participants
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_as_host();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_study_rooms_creator ON study_rooms(creator_id);
CREATE INDEX IF NOT EXISTS idx_study_rooms_code ON study_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_study_rooms_active ON study_rooms(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_room_participants_room ON study_room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_user ON study_room_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_room_shared_items_room ON study_room_shared_items(room_id);
CREATE INDEX IF NOT EXISTS idx_room_chat_room ON room_chat_messages(room_id, created_at DESC);

-- Grant permissions
GRANT EXECUTE ON FUNCTION generate_room_code() TO authenticated;
GRANT EXECUTE ON FUNCTION is_room_full(uuid) TO authenticated;