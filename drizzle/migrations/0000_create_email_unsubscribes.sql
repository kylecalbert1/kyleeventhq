CREATE TABLE public.email_unsubscribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  source text NOT NULL DEFAULT 'link',
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX email_unsubscribes_email_key
  ON public.email_unsubscribes (lower(email));

GRANT SELECT, INSERT, DELETE ON public.email_unsubscribes TO authenticated;
GRANT ALL ON public.email_unsubscribes TO service_role;

ALTER TABLE public.email_unsubscribes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated staff can read unsubscribes"
  ON public.email_unsubscribes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated staff can add unsubscribes"
  ON public.email_unsubscribes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated staff can remove unsubscribes"
  ON public.email_unsubscribes FOR DELETE TO authenticated USING (true);