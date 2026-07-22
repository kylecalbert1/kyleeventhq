
-- Feature 1: Priorities upgrade
ALTER TABLE public.weekly_priorities
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_asap BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS source_asana_gid TEXT;

-- Prevent duplicate pins per user from the same Asana task
CREATE UNIQUE INDEX IF NOT EXISTS weekly_priorities_user_asana_gid_uidx
  ON public.weekly_priorities(user_id, source_asana_gid)
  WHERE source_asana_gid IS NOT NULL;

CREATE INDEX IF NOT EXISTS weekly_priorities_event_idx
  ON public.weekly_priorities(event_id) WHERE event_id IS NOT NULL;

-- Feature 2: Asana synced tasks
CREATE TABLE IF NOT EXISTS public.asana_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  asana_gid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  due_on DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asana_tasks TO authenticated;
GRANT ALL ON public.asana_tasks TO service_role;

ALTER TABLE public.asana_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read asana_tasks"
  ON public.asana_tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role manages asana_tasks"
  ON public.asana_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS asana_tasks_event_due_idx
  ON public.asana_tasks(event_id, due_on);

CREATE TRIGGER asana_tasks_set_updated_at
  BEFORE UPDATE ON public.asana_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
