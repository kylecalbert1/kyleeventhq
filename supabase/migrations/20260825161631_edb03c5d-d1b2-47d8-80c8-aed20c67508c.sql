CREATE TABLE public.event_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  label text NOT NULL,
  target_value numeric NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','tito_delegate_tickets')),
  manual_current_value numeric,
  show_on_card boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_targets TO authenticated;
GRANT ALL ON public.event_targets TO service_role;

ALTER TABLE public.event_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage event targets"
ON public.event_targets FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE INDEX event_targets_event_id_idx ON public.event_targets(event_id);

CREATE TRIGGER event_targets_updated_at
BEFORE UPDATE ON public.event_targets
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();