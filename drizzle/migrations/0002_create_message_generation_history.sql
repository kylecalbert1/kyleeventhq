CREATE TABLE public.message_generation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'compose',
  name TEXT NOT NULL DEFAULT 'Untitled message',
  subject TEXT NOT NULL DEFAULT '',
  body_markdown TEXT NOT NULL DEFAULT '',
  stream TEXT NOT NULL DEFAULT 'attendees',
  event_format TEXT,
  typical_weeks INTEGER[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX message_generation_history_event_idx
  ON public.message_generation_history (event_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_generation_history TO authenticated;
GRANT ALL ON public.message_generation_history TO service_role;

ALTER TABLE public.message_generation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated staff manage message generation history"
  ON public.message_generation_history
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);