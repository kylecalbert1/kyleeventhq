-- Manual notes-to-self and dismissals for the speaker health view.
CREATE TABLE IF NOT EXISTS public.speaker_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id uuid NOT NULL REFERENCES public.speakers(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  -- 'manual' for free-text notes; otherwise the automatic flag code being dismissed.
  code text NOT NULL DEFAULT 'manual',
  note text,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.speaker_flags TO authenticated;
GRANT ALL ON public.speaker_flags TO service_role;

ALTER TABLE public.speaker_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage speaker flags"
  ON public.speaker_flags FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS speaker_flags_speaker_idx ON public.speaker_flags (speaker_id);
CREATE INDEX IF NOT EXISTS speaker_flags_event_idx ON public.speaker_flags (event_id);
-- One dismissal row per automatic flag code per speaker.
CREATE UNIQUE INDEX IF NOT EXISTS speaker_flags_auto_code_uidx
  ON public.speaker_flags (speaker_id, code)
  WHERE code <> 'manual';

CREATE TRIGGER speaker_flags_set_updated_at
  BEFORE UPDATE ON public.speaker_flags
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Manual health override, independent of the computed signal.
ALTER TABLE public.speakers ADD COLUMN IF NOT EXISTS health_override text;