
-- Enums
DO $$ BEGIN
  CREATE TYPE public.self_status AS ENUM ('on_track','needs_attention','off_track');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.outreach_channel AS ENUM ('linkedin_connect','group_message','old_attendee_list','warm_intro','cold_email');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.checklist_category AS ENUM ('sales','marketing','content','community');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Events: readiness + self status
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS proof1_due DATE,
  ADD COLUMN IF NOT EXISTS proof2_due DATE,
  ADD COLUMN IF NOT EXISTS final_signoff_due DATE,
  ADD COLUMN IF NOT EXISTS proof1_done BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proof2_done BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signoff_done BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS self_status public.self_status NOT NULL DEFAULT 'on_track';

-- Speakers: outreach channel
ALTER TABLE public.speakers
  ADD COLUMN IF NOT EXISTS outreach_channel public.outreach_channel;

-- Weekly priorities (per user)
CREATE TABLE IF NOT EXISTS public.weekly_priorities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  position INT NOT NULL CHECK (position BETWEEN 1 AND 5),
  text TEXT NOT NULL DEFAULT '',
  done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start, position)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_priorities TO authenticated;
GRANT ALL ON public.weekly_priorities TO service_role;
ALTER TABLE public.weekly_priorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own priorities" ON public.weekly_priorities FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_weekly_priorities_updated BEFORE UPDATE ON public.weekly_priorities
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Weekly outreach accounts
CREATE TABLE IF NOT EXISTS public.outreach_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL,
  account_name TEXT NOT NULL,
  owner TEXT,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  li_invite_template TEXT,
  li_invite_done BOOLEAN NOT NULL DEFAULT false,
  inmail_template TEXT,
  inmail_done BOOLEAN NOT NULL DEFAULT false,
  camp_a_template TEXT,
  camp_a_done BOOLEAN NOT NULL DEFAULT false,
  camp_b_template TEXT,
  camp_b_done BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_accounts TO authenticated;
GRANT ALL ON public.outreach_accounts TO service_role;
ALTER TABLE public.outreach_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all outreach_accounts" ON public.outreach_accounts FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE TRIGGER trg_outreach_accounts_updated BEFORE UPDATE ON public.outreach_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_outreach_accounts_week ON public.outreach_accounts(week_start);

-- Team checklist items (shared)
CREATE TABLE IF NOT EXISTS public.team_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL,
  category public.checklist_category NOT NULL,
  text TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_checklist_items TO authenticated;
GRANT ALL ON public.team_checklist_items TO service_role;
ALTER TABLE public.team_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all team_checklist_items" ON public.team_checklist_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE TRIGGER trg_team_checklist_updated BEFORE UPDATE ON public.team_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_team_checklist_week ON public.team_checklist_items(week_start);
