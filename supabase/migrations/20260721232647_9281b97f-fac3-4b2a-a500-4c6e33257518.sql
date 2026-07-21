
-- Part 1: link events to their Tito event
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS tito_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS events_tito_slug_key
  ON public.events (tito_slug)
  WHERE tito_slug IS NOT NULL;

-- Part 3: new table for Tito releases (Speaker Pass, Speaker Guest, delegate types)
CREATE TABLE IF NOT EXISTS public.tito_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug text NOT NULL,
  tito_release_id text NOT NULL,
  slug text,
  title text NOT NULL,
  registration_url text,
  quantity integer,
  tickets_count integer,
  state text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_slug, tito_release_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tito_releases TO authenticated;
GRANT ALL ON public.tito_releases TO service_role;

ALTER TABLE public.tito_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tito_releases readable by authenticated"
  ON public.tito_releases FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "tito_releases writable by authenticated"
  ON public.tito_releases FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS tito_releases_event_slug_idx
  ON public.tito_releases (event_slug);

CREATE TRIGGER tito_releases_set_updated_at
  BEFORE UPDATE ON public.tito_releases
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Part 2 / 6: stamp release info on tickets so classification needs no join
ALTER TABLE public.tito_tickets
  ADD COLUMN IF NOT EXISTS release_id text,
  ADD COLUMN IF NOT EXISTS release_slug text,
  ADD COLUMN IF NOT EXISTS release_title text;

CREATE INDEX IF NOT EXISTS tito_tickets_event_release_idx
  ON public.tito_tickets (event_slug, release_slug);

-- Part 4 / 5: track provenance & copy-forward chain on speakers
ALTER TABLE public.speakers
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ticket_id uuid REFERENCES public.tito_tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS copied_from_speaker_id uuid REFERENCES public.speakers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS speakers_event_source_idx
  ON public.speakers (event_id, source);

CREATE INDEX IF NOT EXISTS speakers_source_ticket_idx
  ON public.speakers (source_ticket_id)
  WHERE source_ticket_id IS NOT NULL;
