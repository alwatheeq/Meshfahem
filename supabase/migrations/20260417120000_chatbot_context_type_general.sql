-- Allow context_type 'general' for global AI assistant (matches app + edge insert).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN (
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'chatbot_conversations'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%context_type%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.chatbot_conversations DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.chatbot_conversations
  ADD CONSTRAINT chatbot_conversations_context_type_check
  CHECK (context_type IN ('summary', 'library_item', 'history_item', 'shared', 'general'));

COMMENT ON COLUMN public.chatbot_conversations.context_type IS
  'Context: summary, library_item, history_item, shared, or general (global assistant).';
