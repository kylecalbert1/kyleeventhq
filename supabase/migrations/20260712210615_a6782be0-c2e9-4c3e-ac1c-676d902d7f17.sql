
CREATE TABLE public.speaker_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  speaker_id UUID NOT NULL REFERENCES public.speakers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX speaker_activity_log_speaker_created_idx
  ON public.speaker_activity_log (speaker_id, created_at DESC);

GRANT SELECT, INSERT ON public.speaker_activity_log TO authenticated;
GRANT ALL ON public.speaker_activity_log TO service_role;

ALTER TABLE public.speaker_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_select_auth" ON public.speaker_activity_log
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "activity_insert_auth" ON public.speaker_activity_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.log_speaker_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.speaker_activity_log (speaker_id, event_type, note)
    VALUES (NEW.id, 'status_changed',
      COALESCE(OLD.status, 'none') || ' → ' || COALESCE(NEW.status, 'none'));
  END IF;
  IF NEW.banner_status IS DISTINCT FROM OLD.banner_status THEN
    INSERT INTO public.speaker_activity_log (speaker_id, event_type, note)
    VALUES (NEW.id, 'banner_status_changed',
      COALESCE(OLD.banner_status, 'none') || ' → ' || COALESCE(NEW.banner_status, 'none'));
  END IF;
  IF NEW.last_message_direction IS DISTINCT FROM OLD.last_message_direction THEN
    INSERT INTO public.speaker_activity_log (speaker_id, event_type, note)
    VALUES (NEW.id, 'message_direction_changed',
      'Last message: ' || COALESCE(NEW.last_message_direction, 'none'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_speaker_changes ON public.speakers;
CREATE TRIGGER trg_log_speaker_changes
  AFTER UPDATE ON public.speakers
  FOR EACH ROW EXECUTE FUNCTION public.log_speaker_changes();
