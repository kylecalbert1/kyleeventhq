ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS speaker_target integer NOT NULL DEFAULT 15;

ALTER TABLE public.speakers
  ADD COLUMN IF NOT EXISTS bio_and_headshot_received boolean NOT NULL DEFAULT false;

UPDATE public.speakers
  SET bio_and_headshot_received = (COALESCE(bio_received,false) AND COALESCE(headshot_received,false))
  WHERE bio_and_headshot_received = false;