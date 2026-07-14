CREATE TABLE public.tito_event_filters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_slug text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('include','exclude')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_slug, mode)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tito_event_filters TO authenticated;
GRANT ALL ON public.tito_event_filters TO service_role;
ALTER TABLE public.tito_event_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage tito event filters"
  ON public.tito_event_filters
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);