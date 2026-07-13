
-- 1. Role infrastructure
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('staff', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own roles" ON public.user_roles;
CREATE POLICY "users see own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Seed current sole user as staff + admin
INSERT INTO public.user_roles (user_id, role) VALUES
  ('911df4f7-3723-487a-98f1-9936cbefacb0', 'staff'),
  ('911df4f7-3723-487a-98f1-9936cbefacb0', 'admin')
ON CONFLICT DO NOTHING;

-- 2. Replace overly permissive policies with staff-role checks

-- events
DROP POLICY IF EXISTS events_select_auth ON public.events;
DROP POLICY IF EXISTS events_insert_auth ON public.events;
DROP POLICY IF EXISTS events_update_auth ON public.events;
DROP POLICY IF EXISTS events_delete_auth ON public.events;
CREATE POLICY events_staff_all ON public.events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff')) WITH CHECK (public.has_role(auth.uid(), 'staff'));

-- speakers
DROP POLICY IF EXISTS speakers_select_auth ON public.speakers;
DROP POLICY IF EXISTS speakers_insert_auth ON public.speakers;
DROP POLICY IF EXISTS speakers_update_auth ON public.speakers;
DROP POLICY IF EXISTS speakers_delete_auth ON public.speakers;
CREATE POLICY speakers_staff_all ON public.speakers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff')) WITH CHECK (public.has_role(auth.uid(), 'staff'));

-- sponsors
DROP POLICY IF EXISTS sponsors_select_auth ON public.sponsors;
DROP POLICY IF EXISTS sponsors_insert_auth ON public.sponsors;
DROP POLICY IF EXISTS sponsors_update_auth ON public.sponsors;
DROP POLICY IF EXISTS sponsors_delete_auth ON public.sponsors;
CREATE POLICY sponsors_staff_all ON public.sponsors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff')) WITH CHECK (public.has_role(auth.uid(), 'staff'));

-- event_milestones
DROP POLICY IF EXISTS "auth all milestones" ON public.event_milestones;
DROP POLICY IF EXISTS event_milestones_select_auth ON public.event_milestones;
DROP POLICY IF EXISTS event_milestones_insert_auth ON public.event_milestones;
DROP POLICY IF EXISTS event_milestones_update_auth ON public.event_milestones;
DROP POLICY IF EXISTS event_milestones_delete_auth ON public.event_milestones;
CREATE POLICY event_milestones_staff_all ON public.event_milestones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff')) WITH CHECK (public.has_role(auth.uid(), 'staff'));

-- outreach_accounts
DROP POLICY IF EXISTS outreach_accounts_select_auth ON public.outreach_accounts;
DROP POLICY IF EXISTS outreach_accounts_insert_auth ON public.outreach_accounts;
DROP POLICY IF EXISTS outreach_accounts_update_auth ON public.outreach_accounts;
DROP POLICY IF EXISTS outreach_accounts_delete_auth ON public.outreach_accounts;
CREATE POLICY outreach_accounts_staff_all ON public.outreach_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff')) WITH CHECK (public.has_role(auth.uid(), 'staff'));

-- team_checklist_items
DROP POLICY IF EXISTS team_checklist_items_select_auth ON public.team_checklist_items;
DROP POLICY IF EXISTS team_checklist_items_insert_auth ON public.team_checklist_items;
DROP POLICY IF EXISTS team_checklist_items_update_auth ON public.team_checklist_items;
DROP POLICY IF EXISTS team_checklist_items_delete_auth ON public.team_checklist_items;
CREATE POLICY team_checklist_items_staff_all ON public.team_checklist_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff')) WITH CHECK (public.has_role(auth.uid(), 'staff'));

-- website_tasks
DROP POLICY IF EXISTS website_tasks_select_auth ON public.website_tasks;
DROP POLICY IF EXISTS website_tasks_insert_auth ON public.website_tasks;
DROP POLICY IF EXISTS website_tasks_update_auth ON public.website_tasks;
DROP POLICY IF EXISTS website_tasks_delete_auth ON public.website_tasks;
CREATE POLICY website_tasks_staff_all ON public.website_tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff')) WITH CHECK (public.has_role(auth.uid(), 'staff'));

-- email_sends
DROP POLICY IF EXISTS "authenticated read email_sends" ON public.email_sends;
DROP POLICY IF EXISTS "authenticated write email_sends" ON public.email_sends;
DROP POLICY IF EXISTS "authenticated update email_sends" ON public.email_sends;
DROP POLICY IF EXISTS "authenticated delete email_sends" ON public.email_sends;
CREATE POLICY email_sends_staff_all ON public.email_sends FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff')) WITH CHECK (public.has_role(auth.uid(), 'staff'));

-- email_send_recipients
DROP POLICY IF EXISTS "authenticated read recipients" ON public.email_send_recipients;
DROP POLICY IF EXISTS "authenticated write recipients" ON public.email_send_recipients;
DROP POLICY IF EXISTS "authenticated update recipients" ON public.email_send_recipients;
DROP POLICY IF EXISTS "authenticated delete recipients" ON public.email_send_recipients;
CREATE POLICY email_send_recipients_staff_all ON public.email_send_recipients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff')) WITH CHECK (public.has_role(auth.uid(), 'staff'));

-- speaker_activity_log (was on public role)
DROP POLICY IF EXISTS activity_select_auth ON public.speaker_activity_log;
DROP POLICY IF EXISTS activity_insert_auth ON public.speaker_activity_log;
CREATE POLICY speaker_activity_log_staff_select ON public.speaker_activity_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'staff'));
CREATE POLICY speaker_activity_log_staff_insert ON public.speaker_activity_log
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'staff'));
