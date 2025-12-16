/*
  # Add Chatbot Conversation and Message Tables

  ## Overview
  This migration creates tables for storing chatbot conversations and messages.
  The chatbot assists users in understanding their study materials (summaries, library items, etc.)

  ## Tables Created
  1. chatbot_conversations - Stores conversation contexts linked to summaries/library items
  2. chatbot_messages - Stores individual messages in conversations

  ## Features
  - User-scoped conversations (RLS enabled)
  - Context tracking (summary, original text, topics, medical mode)
  - Message history with token usage tracking
  - Automatic timestamp updates on new messages
  - Indexes for performance

  ## Security
  - RLS policies ensure users can only access their own conversations
  - Foreign key constraints maintain data integrity
  - Cascade delete removes messages when conversation is deleted
*/

-- Create chatbot_conversations table
CREATE TABLE IF NOT EXISTS chatbot_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  context_type TEXT NOT NULL CHECK (context_type IN ('summary', 'library_item', 'history_item', 'shared')),
  context_id TEXT, -- ID of the summary/library item/etc (nullable for new summaries)
  summary_text TEXT NOT NULL, -- Store summary for context
  original_text TEXT, -- Store original text for context
  topics TEXT[], -- Related topics
  medical_mode BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create chatbot_messages table
CREATE TABLE IF NOT EXISTS chatbot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES chatbot_conversations(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0, -- Track tokens for this message
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chatbot_conversations_user_id ON chatbot_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_conversations_context ON chatbot_conversations(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_conversations_updated ON chatbot_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_conversation ON chatbot_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_created ON chatbot_messages(created_at DESC);

-- Enable RLS
ALTER TABLE chatbot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chatbot_conversations
CREATE POLICY "Users can view their own conversations"
  ON chatbot_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
  ON chatbot_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
  ON chatbot_conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
  ON chatbot_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for chatbot_messages
CREATE POLICY "Users can view messages in their conversations"
  ON chatbot_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chatbot_conversations
      WHERE chatbot_conversations.id = chatbot_messages.conversation_id
      AND chatbot_conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in their conversations"
  ON chatbot_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chatbot_conversations
      WHERE chatbot_conversations.id = chatbot_messages.conversation_id
      AND chatbot_conversations.user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_chatbot_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chatbot_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update conversation timestamp when message is added
CREATE TRIGGER update_conversation_timestamp
  AFTER INSERT ON chatbot_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chatbot_conversation_timestamp();

-- Comments for documentation
COMMENT ON TABLE chatbot_conversations IS 'Stores chatbot conversation contexts linked to summaries, library items, etc.';
COMMENT ON TABLE chatbot_messages IS 'Stores individual messages in chatbot conversations';
COMMENT ON COLUMN chatbot_conversations.context_type IS 'Type of context: summary, library_item, history_item, or shared';
COMMENT ON COLUMN chatbot_conversations.context_id IS 'ID of the related item (nullable for new summaries not yet saved)';
COMMENT ON COLUMN chatbot_messages.tokens_used IS 'Number of tokens used for this message (for assistant messages)';

