
-- Helper: staff-or-admin check
-- Replace permissive policies with staff-role checks

-- asana_tasks
DROP POLICY IF EXISTS "Authenticated users can read asana_tasks" ON public.asana_tasks;
DROP POLICY IF EXISTS "Service role manages asana_tasks" ON public.asana_tasks;
CREATE POLICY "Staff can read asana_tasks" ON public.asana_tasks
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Staff can modify asana_tasks" ON public.asana_tasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

-- excluded_companies
DROP POLICY IF EXISTS "auth read/write excluded_companies" ON public.excluded_companies;
CREATE POLICY "Staff manage excluded_companies" ON public.excluded_companies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

-- reply_queue
DROP POLICY IF EXISTS "Authenticated users manage reply queue" ON public.reply_queue;
CREATE POLICY "Staff manage reply_queue" ON public.reply_queue
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

-- sponsor_mentions
DROP POLICY IF EXISTS "Authenticated users manage sponsor mentions" ON public.sponsor_mentions;
CREATE POLICY "Staff manage sponsor_mentions" ON public.sponsor_mentions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

-- sync_health
DROP POLICY IF EXISTS "auth read sync_health" ON public.sync_health;
CREATE POLICY "Staff read sync_health" ON public.sync_health
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

-- tito_answers
DROP POLICY IF EXISTS "auth read/write tito_answers" ON public.tito_answers;
CREATE POLICY "Staff manage tito_answers" ON public.tito_answers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

-- tito_event_filters
DROP POLICY IF EXISTS "Authenticated users manage tito event filters" ON public.tito_event_filters;
CREATE POLICY "Staff manage tito_event_filters" ON public.tito_event_filters
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

-- tito_events
DROP POLICY IF EXISTS "auth read/write tito_events" ON public.tito_events;
CREATE POLICY "Staff manage tito_events" ON public.tito_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

-- tito_releases
DROP POLICY IF EXISTS "tito_releases readable by authenticated" ON public.tito_releases;
DROP POLICY IF EXISTS "tito_releases writable by authenticated" ON public.tito_releases;
CREATE POLICY "Staff read tito_releases" ON public.tito_releases
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Staff modify tito_releases" ON public.tito_releases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

-- tito_tickets
DROP POLICY IF EXISTS "auth read/write tito_tickets" ON public.tito_tickets;
CREATE POLICY "Staff manage tito_tickets" ON public.tito_tickets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

-- SECURITY DEFINER function lockdown: revoke public/anon/authenticated EXECUTE
-- where the function should only run from triggers or from the service role.
REVOKE ALL ON FUNCTION public.generate_speaker_confirmation_draft(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_speaker_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_speakers_generate_confirmation_draft() FROM PUBLIC, anon, authenticated;

-- has_role is used inside RLS policies; authenticated needs EXECUTE for those
-- evaluations, but anonymous callers should not be able to probe it via RPC.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
