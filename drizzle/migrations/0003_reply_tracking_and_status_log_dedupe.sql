-- 1) Dedicated inbound-reply timestamp that outbound sends never overwrite.
ALTER TABLE public.speakers ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz;

UPDATE public.speakers
SET last_inbound_at = last_message_at
WHERE last_message_direction = 'inbound'
  AND last_message_at IS NOT NULL
  AND last_inbound_at IS NULL;

-- 2) Idempotency key for activity-log rows (e.g. one entry per Gmail message id).
ALTER TABLE public.speaker_activity_log ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS speaker_activity_log_dedupe_key_uidx
  ON public.speaker_activity_log (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- 3) Collapse status-change churn: an immediate revert cancels the prior entry
--    instead of appending another line to the timeline.
CREATE OR REPLACE FUNCTION public.log_speaker_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  prev_id uuid;
  prev_from text;
  prev_to text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT id,
           btrim(split_part(note, '→', 1)),
           btrim(split_part(note, '→', 2))
      INTO prev_id, prev_from, prev_to
      FROM public.speaker_activity_log
     WHERE speaker_id = NEW.id
       AND event_type = 'status_changed'
       AND created_at > now() - interval '5 minutes'
     ORDER BY created_at DESC
     LIMIT 1;

    IF prev_id IS NOT NULL AND prev_to = COALESCE(OLD.status::text, 'none')
       AND prev_from = COALESCE(NEW.status::text, 'none') THEN
      -- Net no-op flip-flop (A -> B -> A) within the churn window: drop it.
      DELETE FROM public.speaker_activity_log WHERE id = prev_id;
    ELSE
      INSERT INTO public.speaker_activity_log (speaker_id, event_type, note)
      VALUES (NEW.id, 'status_changed',
        COALESCE(OLD.status::text, 'none') || ' → ' || COALESCE(NEW.status::text, 'none'));
    END IF;
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