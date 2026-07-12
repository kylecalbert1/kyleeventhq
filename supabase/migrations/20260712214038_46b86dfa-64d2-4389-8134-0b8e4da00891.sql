-- email_sends: one row per send batch
CREATE TABLE public.email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  template_type text NOT NULL CHECK (template_type IN ('confirmation','banner_reminder','bio_headshot_reminder','follow_up','custom')),
  subject text NOT NULL,
  body text NOT NULL,
  recipient_count int NOT NULL DEFAULT 0,
  sent_by text NOT NULL DEFAULT 'kyle.c@pmmalliance.com',
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sends TO authenticated;
GRANT ALL ON public.email_sends TO service_role;
ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read email_sends" ON public.email_sends FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write email_sends" ON public.email_sends FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update email_sends" ON public.email_sends FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete email_sends" ON public.email_sends FOR DELETE TO authenticated USING (true);

CREATE INDEX email_sends_event_id_idx ON public.email_sends(event_id);
CREATE INDEX email_sends_sent_at_idx ON public.email_sends(sent_at DESC);

-- email_send_recipients: one row per (send, speaker)
CREATE TABLE public.email_send_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_send_id uuid NOT NULL REFERENCES public.email_sends(id) ON DELETE CASCADE,
  speaker_id uuid REFERENCES public.speakers(id) ON DELETE SET NULL,
  recipient_email text,
  recipient_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_send_recipients TO authenticated;
GRANT ALL ON public.email_send_recipients TO service_role;
ALTER TABLE public.email_send_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read recipients" ON public.email_send_recipients FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write recipients" ON public.email_send_recipients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update recipients" ON public.email_send_recipients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete recipients" ON public.email_send_recipients FOR DELETE TO authenticated USING (true);

CREATE INDEX email_send_recipients_send_idx ON public.email_send_recipients(email_send_id);
CREATE INDEX email_send_recipients_speaker_idx ON public.email_send_recipients(speaker_id);