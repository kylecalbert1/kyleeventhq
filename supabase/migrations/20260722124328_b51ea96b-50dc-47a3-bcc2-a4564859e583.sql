
ALTER TABLE public.tito_events ADD COLUMN IF NOT EXISTS last_webhook_at timestamptz;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS asana_last_synced_at timestamptz;

CREATE TABLE IF NOT EXISTS public.sync_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL UNIQUE,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sync_health TO authenticated;
GRANT ALL ON public.sync_health TO service_role;

ALTER TABLE public.sync_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read sync_health"
  ON public.sync_health
  FOR SELECT
  TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS sync_health_set_updated_at ON public.sync_health;
CREATE TRIGGER sync_health_set_updated_at
  BEFORE UPDATE ON public.sync_health
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_updated_at();
