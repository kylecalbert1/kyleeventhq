
-- Tito events cache
CREATE TABLE public.tito_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  is_past BOOLEAN NOT NULL DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tito_events TO authenticated;
GRANT ALL ON public.tito_events TO service_role;
ALTER TABLE public.tito_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read/write tito_events" ON public.tito_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_tito_events_updated BEFORE UPDATE ON public.tito_events FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Tito tickets (attendees)
CREATE TABLE public.tito_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tito_ticket_id TEXT NOT NULL UNIQUE,
  event_slug TEXT NOT NULL,
  event_title TEXT,
  name TEXT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  company_name TEXT,
  job_title TEXT,
  release_id TEXT,
  release_slug TEXT,
  release_title TEXT,
  registration_id TEXT,
  state TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tito_tickets_event ON public.tito_tickets (event_slug);
CREATE INDEX idx_tito_tickets_email ON public.tito_tickets (email);
CREATE INDEX idx_tito_tickets_release ON public.tito_tickets (release_title);
CREATE INDEX idx_tito_tickets_company ON public.tito_tickets (company_name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tito_tickets TO authenticated;
GRANT ALL ON public.tito_tickets TO service_role;
ALTER TABLE public.tito_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read/write tito_tickets" ON public.tito_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_tito_tickets_updated BEFORE UPDATE ON public.tito_tickets FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Tito answers (custom-question responses)
CREATE TABLE public.tito_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tito_tickets(id) ON DELETE CASCADE,
  question_id TEXT,
  question_title TEXT,
  response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tito_answers_ticket ON public.tito_answers (ticket_id);
CREATE INDEX idx_tito_answers_question ON public.tito_answers (question_title);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tito_answers TO authenticated;
GRANT ALL ON public.tito_answers TO service_role;
ALTER TABLE public.tito_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read/write tito_answers" ON public.tito_answers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Exclude list
CREATE TABLE public.excluded_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.excluded_companies TO authenticated;
GRANT ALL ON public.excluded_companies TO service_role;
ALTER TABLE public.excluded_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read/write excluded_companies" ON public.excluded_companies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_excluded_companies_updated BEFORE UPDATE ON public.excluded_companies FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Speakers: mark sourced origin
ALTER TABLE public.speakers ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.speakers ADD COLUMN IF NOT EXISTS source_ticket_id UUID REFERENCES public.tito_tickets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_speakers_source ON public.speakers (source);
