
ALTER TABLE public.speakers ADD COLUMN IF NOT EXISTS gmail_thread_id text;

CREATE TABLE IF NOT EXISTS public.sponsor_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_thread_id text NOT NULL,
  subject text,
  snippet text,
  sender_email text,
  message_date timestamptz,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  actioned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sponsor_mentions_thread_uidx
  ON public.sponsor_mentions (gmail_thread_id);
CREATE INDEX IF NOT EXISTS sponsor_mentions_message_date_idx
  ON public.sponsor_mentions (message_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_mentions TO authenticated;
GRANT ALL ON public.sponsor_mentions TO service_role;

ALTER TABLE public.sponsor_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage sponsor mentions"
  ON public.sponsor_mentions
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER sponsor_mentions_set_updated_at
  BEFORE UPDATE ON public.sponsor_mentions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
