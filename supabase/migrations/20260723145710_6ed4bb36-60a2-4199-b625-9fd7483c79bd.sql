
-- 1) Extend the status enum
ALTER TYPE public.speaker_status ADD VALUE IF NOT EXISTS 'in_conversation' AFTER 'contacted';

-- 2) Drafts table
CREATE TABLE IF NOT EXISTS public.speaker_email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id uuid NOT NULL REFERENCES public.speakers(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'confirmation',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  speaker_pass_link text,
  guest_pass_link text,
  sent_at timestamptz,
  sent_email_send_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (speaker_id, kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.speaker_email_drafts TO authenticated;
GRANT ALL ON public.speaker_email_drafts TO service_role;

ALTER TABLE public.speaker_email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "speaker_email_drafts_staff_all" ON public.speaker_email_drafts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'staff'::app_role));

CREATE TRIGGER speaker_email_drafts_updated
  BEFORE UPDATE ON public.speaker_email_drafts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS speaker_email_drafts_speaker_idx
  ON public.speaker_email_drafts(speaker_id);

-- 3) Draft-generation function
CREATE OR REPLACE FUNCTION public.generate_speaker_confirmation_draft(_speaker_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sp record;
  ev record;
  tmpl record;
  session_title_val text;
  event_date_val text;
  speaker_pass text;
  guest_pass text;
  subj text;
  body_txt text;
BEGIN
  SELECT * INTO sp FROM public.speakers WHERE id = _speaker_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO ev FROM public.events WHERE id = sp.event_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT subject, body INTO tmpl
    FROM public.email_templates
    WHERE slug = 'speaker_confirmation' AND is_archived = false
    LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  -- Prefer an agenda assignment's title; fall back to speakers.session_title
  SELECT ai.title INTO session_title_val
    FROM public.agenda_items ai
    WHERE ai.event_id = sp.event_id
      AND _speaker_id = ANY(ai.speaker_ids)
    ORDER BY ai.position ASC
    LIMIT 1;
  session_title_val := COALESCE(NULLIF(session_title_val, ''), sp.session_title, 'your session');

  event_date_val := COALESCE(to_char(ev.event_date, 'FMDay, FMMonth FMDD, YYYY'), 'the event date');

  -- Look up Tito pass links for this event
  IF ev.tito_slug IS NOT NULL THEN
    SELECT registration_url INTO speaker_pass
      FROM public.tito_releases
      WHERE event_slug = ev.tito_slug
        AND title ILIKE '%speaker%'
        AND title NOT ILIKE '%guest%'
      ORDER BY updated_at DESC
      LIMIT 1;

    SELECT registration_url INTO guest_pass
      FROM public.tito_releases
      WHERE event_slug = ev.tito_slug
        AND title ILIKE '%guest%'
      ORDER BY updated_at DESC
      LIMIT 1;
  END IF;

  subj := tmpl.subject;
  subj := replace(subj, '{{event_name}}', COALESCE(ev.name, ''));

  body_txt := tmpl.body;
  body_txt := replace(body_txt, '{{first_name}}',
    COALESCE(NULLIF(split_part(sp.name, ' ', 1), ''), 'there'));
  body_txt := replace(body_txt, '{{session_title}}', session_title_val);
  body_txt := replace(body_txt, '{{event_name}}', COALESCE(ev.name, ''));
  body_txt := replace(body_txt, '{{event_date}}', event_date_val);
  body_txt := replace(body_txt, '{{venue}}', COALESCE(ev.venue, 'the venue'));

  IF speaker_pass IS NOT NULL THEN
    body_txt := body_txt || E'\n\nPlease register your Speaker Pass here: ' || speaker_pass;
  END IF;
  IF guest_pass IS NOT NULL THEN
    body_txt := body_txt || E'\nIf you would like to bring a guest, use this Guest Pass link: ' || guest_pass;
  END IF;

  INSERT INTO public.speaker_email_drafts
    (speaker_id, kind, subject, body, status, speaker_pass_link, guest_pass_link)
  VALUES
    (_speaker_id, 'confirmation', subj, body_txt, 'draft', speaker_pass, guest_pass)
  ON CONFLICT (speaker_id, kind) DO UPDATE
    SET subject = EXCLUDED.subject,
        body = EXCLUDED.body,
        speaker_pass_link = EXCLUDED.speaker_pass_link,
        guest_pass_link = EXCLUDED.guest_pass_link,
        updated_at = now()
    WHERE public.speaker_email_drafts.status = 'draft';

  INSERT INTO public.speaker_activity_log (speaker_id, event_type, note)
  VALUES (_speaker_id, 'confirmation_draft_generated',
          'Auto-generated confirmation email draft');
END;
$$;

-- 4) Trigger on confirmation
CREATE OR REPLACE FUNCTION public.tg_speakers_generate_confirmation_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'confirmed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed') THEN
    PERFORM public.generate_speaker_confirmation_draft(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_speakers_confirmation_draft ON public.speakers;
CREATE TRIGGER trg_speakers_confirmation_draft
  AFTER INSERT OR UPDATE OF status ON public.speakers
  FOR EACH ROW EXECUTE FUNCTION public.tg_speakers_generate_confirmation_draft();
