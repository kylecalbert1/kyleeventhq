
ALTER TYPE public.speaker_status ADD VALUE IF NOT EXISTS 'new' BEFORE 'contacted';

ALTER TABLE public.speakers
  ADD COLUMN IF NOT EXISTS call_scheduled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS call_scheduled_at timestamptz;
