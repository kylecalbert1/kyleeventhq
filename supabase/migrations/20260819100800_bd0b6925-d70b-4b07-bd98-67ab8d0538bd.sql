CREATE TABLE public.event_outreach_snippets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  description text,
  body text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX event_outreach_snippets_event_idx ON public.event_outreach_snippets(event_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_outreach_snippets TO authenticated;
GRANT ALL ON public.event_outreach_snippets TO service_role;
ALTER TABLE public.event_outreach_snippets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage outreach_snippets" ON public.event_outreach_snippets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'staff'));
CREATE TRIGGER event_outreach_snippets_updated_at BEFORE UPDATE ON public.event_outreach_snippets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();