-- Collapse the speaker pipeline to three real statuses. The legacy enum
-- values stay in the type (Postgres cannot remove enum values) but no code
-- writes them any more; existing rows are migrated to 'prospective'.
ALTER TYPE public.speaker_status ADD VALUE IF NOT EXISTS 'prospective';

-- Richer last-message preview on speaker cards: a longer body snippet and who
-- sent the newest message in the thread.
ALTER TABLE public.reply_queue ADD COLUMN IF NOT EXISTS snippet text;
ALTER TABLE public.reply_queue ADD COLUMN IF NOT EXISTS last_message_from text;