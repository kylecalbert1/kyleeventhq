ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS room_block_url text,
  ADD COLUMN IF NOT EXISTS room_block_notes text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;

-- No new RLS policy needed; events already has an update policy covering all authenticated users.