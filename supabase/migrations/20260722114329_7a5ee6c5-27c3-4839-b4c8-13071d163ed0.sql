
-- Reply queue: single source of truth for "needs reply" surfaces.
CREATE TABLE public.reply_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id UUID REFERENCES public.speakers(id) ON DELETE SET NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  person_email TEXT NOT NULL,
  person_name TEXT,
  gmail_thread_id TEXT NOT NULL UNIQUE,
  last_message_id TEXT NOT NULL,
  last_message_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('speaker_reply','mention','follow_up')),
  summary TEXT,
  subject TEXT,
  acked_message_id TEXT,
  acked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX reply_queue_last_msg_idx ON public.reply_queue(last_message_at DESC);
CREATE INDEX reply_queue_reason_idx ON public.reply_queue(reason);
CREATE INDEX reply_queue_speaker_idx ON public.reply_queue(speaker_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reply_queue TO authenticated;
GRANT ALL ON public.reply_queue TO service_role;

ALTER TABLE public.reply_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage reply queue"
  ON public.reply_queue FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER reply_queue_set_updated_at
  BEFORE UPDATE ON public.reply_queue
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed from existing speaker state so the page is not empty after deploy.
-- Only inbound + still-open statuses (contacted/responded) with a gmail_thread_id.
INSERT INTO public.reply_queue (
  speaker_id, event_id, person_email, person_name, gmail_thread_id,
  last_message_id, last_message_at, reason, summary, subject
)
SELECT
  s.id,
  s.event_id,
  COALESCE(s.email, ''),
  s.name,
  s.gmail_thread_id,
  -- Seed sentinel; the next scan will replace this with the real Gmail message id.
  'seed:' || s.gmail_thread_id,
  s.last_message_at,
  'speaker_reply',
  'Seeded from prior inbound message - rescan Gmail to refresh summary.',
  NULL
FROM public.speakers s
WHERE s.gmail_thread_id IS NOT NULL
  AND s.last_message_at IS NOT NULL
  AND s.last_message_direction = 'inbound'
  AND s.status IN ('contacted','responded')
ON CONFLICT (gmail_thread_id) DO NOTHING;

-- Follow-up seeds: outbound with no reply in 3+ days on open statuses.
INSERT INTO public.reply_queue (
  speaker_id, event_id, person_email, person_name, gmail_thread_id,
  last_message_id, last_message_at, reason, summary, subject
)
SELECT
  s.id,
  s.event_id,
  COALESCE(s.email, ''),
  s.name,
  s.gmail_thread_id,
  'seed:' || s.gmail_thread_id,
  s.last_message_at,
  'follow_up',
  'Awaiting reply since ' || to_char(s.last_message_at, 'DD Mon'),
  NULL
FROM public.speakers s
WHERE s.gmail_thread_id IS NOT NULL
  AND s.last_message_at IS NOT NULL
  AND s.last_message_direction = 'outbound'
  AND s.status IN ('contacted','responded')
  AND s.last_message_at < now() - interval '3 days'
ON CONFLICT (gmail_thread_id) DO NOTHING;
