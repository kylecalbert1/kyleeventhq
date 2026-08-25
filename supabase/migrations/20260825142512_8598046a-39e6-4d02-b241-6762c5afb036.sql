CREATE TABLE public.event_link_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Documents',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_link_sections TO authenticated;
GRANT ALL ON public.event_link_sections TO service_role;
ALTER TABLE public.event_link_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage event link sections"
  ON public.event_link_sections FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE TRIGGER event_link_sections_updated_at BEFORE UPDATE ON public.event_link_sections
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.event_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.event_link_sections(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_links TO authenticated;
GRANT ALL ON public.event_links TO service_role;
ALTER TABLE public.event_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage event links"
  ON public.event_links FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE TRIGGER event_links_updated_at BEFORE UPDATE ON public.event_links
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX event_links_section_idx ON public.event_links(section_id);
CREATE INDEX event_link_sections_event_idx ON public.event_link_sections(event_id);