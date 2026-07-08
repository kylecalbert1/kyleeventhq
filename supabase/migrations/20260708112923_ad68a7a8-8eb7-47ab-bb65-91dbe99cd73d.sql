
-- Enums
CREATE TYPE public.business_line AS ENUM ('AIAI','CSC');
CREATE TYPE public.event_format AS ENUM ('in_person','virtual');
CREATE TYPE public.website_stage AS ENUM ('draft','proof_1','proof_2','signed_off','live');
CREATE TYPE public.speaker_status AS ENUM ('contacted','responded','confirmed','declined');
CREATE TYPE public.session_format AS ENUM ('keynote','panel','workshop','fireside');
CREATE TYPE public.banner_status AS ENUM ('not_started','created','sent','confirmed_live');
CREATE TYPE public.website_task_type AS ENUM ('proof_1','proof_2','final_signoff','launch','audit','refresh');
CREATE TYPE public.milestone_type AS ENUM ('kickoff','washup');
CREATE TYPE public.milestone_status AS ENUM ('scheduled','done');

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- events
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  business_line public.business_line NOT NULL,
  format public.event_format NOT NULL,
  event_date DATE,
  venue TEXT,
  kickoff_date DATE,
  washup_date DATE,
  website_status public.website_stage NOT NULL DEFAULT 'draft',
  launch_date DATE,
  owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all events" ON public.events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER events_updated BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- speakers
CREATE TABLE public.speakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT,
  title TEXT,
  status public.speaker_status NOT NULL DEFAULT 'contacted',
  session_title TEXT,
  session_format public.session_format,
  banner_status public.banner_status NOT NULL DEFAULT 'not_started',
  bio_received BOOLEAN NOT NULL DEFAULT false,
  headshot_received BOOLEAN NOT NULL DEFAULT false,
  linkedin_url TEXT,
  notes TEXT,
  dropbox_link TEXT,
  linkedin_post_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.speakers TO authenticated;
GRANT ALL ON public.speakers TO service_role;
ALTER TABLE public.speakers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all speakers" ON public.speakers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX speakers_event_idx ON public.speakers(event_id);
CREATE TRIGGER speakers_updated BEFORE UPDATE ON public.speakers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- sponsors
CREATE TABLE public.sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  spend_tier TEXT,
  session_type TEXT,
  banner_status public.banner_status NOT NULL DEFAULT 'not_started',
  dropbox_link TEXT,
  linkedin_post_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsors TO authenticated;
GRANT ALL ON public.sponsors TO service_role;
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all sponsors" ON public.sponsors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX sponsors_event_idx ON public.sponsors(event_id);
CREATE TRIGGER sponsors_updated BEFORE UPDATE ON public.sponsors FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- website_tasks
CREATE TABLE public.website_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  task_type public.website_task_type NOT NULL,
  status public.website_stage NOT NULL DEFAULT 'draft',
  due_date DATE,
  assignee TEXT,
  protected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_tasks TO authenticated;
GRANT ALL ON public.website_tasks TO service_role;
ALTER TABLE public.website_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all website_tasks" ON public.website_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX website_tasks_event_idx ON public.website_tasks(event_id);
CREATE TRIGGER website_tasks_updated BEFORE UPDATE ON public.website_tasks FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- event_milestones
CREATE TABLE public.event_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  type public.milestone_type NOT NULL,
  scheduled_date DATE,
  doc_link TEXT,
  recap_link TEXT,
  status public.milestone_status NOT NULL DEFAULT 'scheduled',
  key_action_items TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_milestones TO authenticated;
GRANT ALL ON public.event_milestones TO service_role;
ALTER TABLE public.event_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all milestones" ON public.event_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX milestones_event_idx ON public.event_milestones(event_id);
CREATE TRIGGER milestones_updated BEFORE UPDATE ON public.event_milestones FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
