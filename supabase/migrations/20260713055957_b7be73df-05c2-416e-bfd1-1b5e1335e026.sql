
-- Outreach hub per event
CREATE TABLE public.event_outreach (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  inmail_subject text,
  inmail_message text,
  connect_message text,
  colleague_slack text,
  colleague_linkedin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_outreach TO authenticated;
GRANT ALL ON public.event_outreach TO service_role;
ALTER TABLE public.event_outreach ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage event_outreach" ON public.event_outreach
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'staff'));
CREATE TRIGGER event_outreach_updated_at BEFORE UPDATE ON public.event_outreach
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.event_saved_searches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  url text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX event_saved_searches_event_idx ON public.event_saved_searches(event_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_saved_searches TO authenticated;
GRANT ALL ON public.event_saved_searches TO service_role;
ALTER TABLE public.event_saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage saved_searches" ON public.event_saved_searches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'staff'));
CREATE TRIGGER event_saved_searches_updated_at BEFORE UPDATE ON public.event_saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Agenda templates (editable defaults)
CREATE TABLE public.agenda_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  session_type text not null,
  minutes int not null,
  position int not null default 0,
  unique(template_key, session_type),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_templates TO authenticated;
GRANT ALL ON public.agenda_templates TO service_role;
ALTER TABLE public.agenda_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage agenda_templates" ON public.agenda_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'staff'));
CREATE TRIGGER agenda_templates_updated_at BEFORE UPDATE ON public.agenda_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Agenda items per event
CREATE TABLE public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  position int not null default 0,
  start_time text,
  duration_min int not null default 30,
  session_type text not null default 'keynote',
  title text,
  speaker_ids uuid[] not null default '{}',
  speaker_extra text,
  av_requirements text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX agenda_items_event_idx ON public.agenda_items(event_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_items TO authenticated;
GRANT ALL ON public.agenda_items TO service_role;
ALTER TABLE public.agenda_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage agenda_items" ON public.agenda_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'staff'));
CREATE TRIGGER agenda_items_updated_at BEFORE UPDATE ON public.agenda_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed agenda template defaults
INSERT INTO public.agenda_templates (template_key, session_type, minutes, position) VALUES
  ('csc_in_person','chairperson_remarks',15,1),
  ('csc_in_person','keynote',30,2),
  ('csc_in_person','panel',45,3),
  ('csc_in_person','roundtable',45,4),
  ('csc_in_person','workshop',45,5),
  ('csc_in_person','sponsored_keynote',30,6),
  ('csc_in_person','fireside_chat',30,7),
  ('csc_in_person','coffee_break',30,8),
  ('csc_in_person','lunch',60,9),
  ('csc_in_person','happy_hour',60,10),
  ('aiai','chairperson_remarks',15,1),
  ('aiai','keynote',30,2),
  ('aiai','panel',30,3),
  ('aiai','sponsored_keynote',30,4),
  ('aiai','fireside_chat',30,5),
  ('aiai','coffee_break',30,6),
  ('aiai','lunch',60,7),
  ('virtual','keynote',30,1),
  ('virtual','panel',30,2),
  ('virtual','sponsored_keynote',30,3),
  ('virtual','fireside_chat',30,4),
  ('virtual','break',15,5);

-- Seed outreach content for CCO San Francisco 2026
INSERT INTO public.event_outreach (event_id, inmail_subject, inmail_message, connect_message, colleague_slack, colleague_linkedin)
SELECT id,
  'Chief Customer Officer Summit San Francisco - Speaker Invitation | Sep 24 2026',
  E'Hi *FN*,\nAre you looking for speaking opportunities?\nI''d like to formally invite you to speak at our Chief Customer Officer Summit in San Francisco on September 24.\n→ Invite-only gathering of 75+ senior customer leaders\n→ Focus on sharing real-world customer success and CX blueprints\n→ Senior speakers from leading global organisations\n→ https://events.customersuccesscollective.com/location/ccosanfrancisco/\nIf it''s of interest, can I share a bit more on the themes and available session formats over a quick call?',
  'Hello *FN*, I''d love to invite you to speak at Chief Customer Officer Summit in San Francisco on September 24 2026. It''s an exclusive, invite-only event bringing together 75+ Customer Leaders. I believe your expertise would be an excellent fit for the agenda. Could we arrange a quick call?',
  'Hey, when you are free, could you run a Dux Soup message on this list I shared for the CCO San Francisco summit? [Insert Sales Nav list link]',
  'Hi *FN*, hope you''re well! I wanted to reach out as my colleague Kyle is putting together the Chief Customer Officer Summit in San Francisco on September 24 2026. It''s an exclusive, invite-only event bringing together 75+ of the world''s most influential customer leaders to share and learn blueprints of success from like minded individuals. I immediately thought of you and think you''d be a fantastic addition to the agenda. Would you be open to a quick call to find out more? You can book time via his calendar here: https://calendly.com/kyle-c-pmmalliance/15min'
FROM public.events WHERE code = 'CCO-SF-26';

INSERT INTO public.event_saved_searches (event_id, label, url, position)
SELECT id, 'CCOs and VPs, SF Bay Area, 10,000+ headcount', NULL, 1 FROM public.events WHERE code = 'CCO-SF-26'
UNION ALL
SELECT id, 'CCOs only, 1000+', NULL, 2 FROM public.events WHERE code = 'CCO-SF-26';
