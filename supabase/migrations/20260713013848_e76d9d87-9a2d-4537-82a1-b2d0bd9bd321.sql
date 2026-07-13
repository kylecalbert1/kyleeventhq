
-- 1) Fix trigger casting enums to text so 'none' fallback never coerces into the enum
CREATE OR REPLACE FUNCTION public.log_speaker_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.speaker_activity_log (speaker_id, event_type, note)
    VALUES (NEW.id, 'status_changed',
      COALESCE(OLD.status::text, 'none') || ' → ' || COALESCE(NEW.status::text, 'none'));
  END IF;
  IF NEW.banner_status IS DISTINCT FROM OLD.banner_status THEN
    INSERT INTO public.speaker_activity_log (speaker_id, event_type, note)
    VALUES (NEW.id, 'banner_status_changed',
      COALESCE(OLD.banner_status::text, 'none') || ' → ' || COALESCE(NEW.banner_status::text, 'none'));
  END IF;
  IF NEW.last_message_direction IS DISTINCT FROM OLD.last_message_direction THEN
    INSERT INTO public.speaker_activity_log (speaker_id, event_type, note)
    VALUES (NEW.id, 'message_direction_changed',
      'Last message: ' || COALESCE(NEW.last_message_direction::text, 'none'));
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Website tasks: new workflow fields
ALTER TABLE public.website_tasks
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS markup_url text,
  ADD COLUMN IF NOT EXISTS buddy_proof_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS buddy_proof_date date,
  ADD COLUMN IF NOT EXISTS marketer_proof_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketer_proof_date date,
  ADD COLUMN IF NOT EXISTS final_signoff_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS final_signoff_date date;

-- Drop assignee (no longer used)
ALTER TABLE public.website_tasks DROP COLUMN IF EXISTS assignee;

-- Loosen required legacy columns so new UI doesn't have to set them
ALTER TABLE public.website_tasks ALTER COLUMN task_type DROP NOT NULL;
