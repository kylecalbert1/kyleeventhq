DROP TRIGGER IF EXISTS trg_speakers_confirmation_draft ON public.speakers;
DROP FUNCTION IF EXISTS public.tg_speakers_generate_confirmation_draft();
DROP FUNCTION IF EXISTS public.generate_speaker_confirmation_draft(uuid);
DROP TRIGGER IF EXISTS speaker_email_drafts_updated ON public.speaker_email_drafts;
DROP TABLE IF EXISTS public.speaker_email_drafts;
DELETE FROM public.speaker_activity_log WHERE event_type = 'confirmation_draft_generated';

ALTER TABLE public.speaker_boards
  ADD COLUMN IF NOT EXISTS asana_project_gid text,
  ADD COLUMN IF NOT EXISTS asana_project_url text,
  ADD COLUMN IF NOT EXISTS asana_last_synced_at timestamptz;