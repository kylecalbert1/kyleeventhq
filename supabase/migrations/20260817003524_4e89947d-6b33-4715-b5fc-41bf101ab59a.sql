-- 1. typical_weeks column
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS typical_weeks integer[];

-- 2. remove stray duplicate copy row (repoint sends first)
UPDATE public.event_message_sends s
SET template_id = (
  SELECT t2.id FROM public.message_templates t2
  WHERE lower(btrim(t2.name)) = 'please complete your ticket info'
  ORDER BY t2.created_at, t2.id LIMIT 1
)
WHERE s.template_id IN (
  SELECT id FROM public.message_templates WHERE lower(btrim(name)) = 'please complete your ticket info (copy)'
);
DELETE FROM public.message_templates WHERE lower(btrim(name)) = 'please complete your ticket info (copy)';

-- 3. dedupe by name: keep earliest created row per name group
WITH grp AS (
  SELECT lower(btrim(name)) AS key,
         (ARRAY_AGG(id ORDER BY created_at, id))[1] AS keep_id,
         ARRAY_AGG(DISTINCT weeks_out) FILTER (WHERE weeks_out IS NOT NULL) AS weeks
  FROM public.message_templates
  GROUP BY 1
)
UPDATE public.message_templates t
SET typical_weeks = (
  SELECT CASE WHEN g.weeks IS NULL OR array_length(g.weeks,1) IS NULL THEN NULL
              ELSE ARRAY(SELECT unnest(g.weeks) ORDER BY 1 DESC) END
)
FROM grp g
WHERE t.id = g.keep_id;

-- repoint send history from doomed rows to survivors
UPDATE public.event_message_sends s
SET template_id = g.keep_id
FROM public.message_templates t
JOIN (
  SELECT lower(btrim(name)) AS key, (ARRAY_AGG(id ORDER BY created_at, id))[1] AS keep_id
  FROM public.message_templates GROUP BY 1
) g ON g.key = lower(btrim(t.name))
WHERE s.template_id = t.id AND t.id <> g.keep_id;

DELETE FROM public.message_templates t
USING (
  SELECT lower(btrim(name)) AS key, (ARRAY_AGG(id ORDER BY created_at, id))[1] AS keep_id
  FROM public.message_templates GROUP BY 1
) g
WHERE lower(btrim(t.name)) = g.key AND t.id <> g.keep_id;

ALTER TABLE public.message_templates DROP COLUMN weeks_out;

-- 4. tidy names / hints
UPDATE public.message_templates
SET name = 'Dietary requirements', typical_weeks = ARRAY[9]
WHERE lower(btrim(name)) = 'dietary requirements and accommodation';

UPDATE public.message_templates
SET name = 'Thank you for joining'
WHERE lower(btrim(name)) = 'thank you for joining us';

UPDATE public.message_templates
SET name = 'Complete your ticket info'
WHERE lower(btrim(name)) = 'please complete your ticket info';

-- 5. General message starter
INSERT INTO public.message_templates
  (name, stream, typical_weeks, business_line, event_format, subject, body_markdown, tito_filter_hint, position, is_seed, is_archived)
SELECT 'General message', 'everyone', NULL, NULL, NULL,
  '[[event_name]]',
  E'Hi {{first_name}},\n\n\n\n[[signoff]]',
  'Pick the releases you want this to reach.',
  99, true, false
WHERE NOT EXISTS (SELECT 1 FROM public.message_templates WHERE lower(btrim(name)) = 'general message');

-- 6. reusable content blocks
CREATE TABLE IF NOT EXISTS public.message_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  body_markdown text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  is_seed boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_blocks TO authenticated;
GRANT ALL ON public.message_blocks TO service_role;
ALTER TABLE public.message_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_blocks_staff_all ON public.message_blocks;
CREATE POLICY message_blocks_staff_all ON public.message_blocks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'staff'::app_role))
  WITH CHECK (has_role(auth.uid(), 'staff'::app_role));
DROP TRIGGER IF EXISTS message_blocks_set_updated_at ON public.message_blocks;
CREATE TRIGGER message_blocks_set_updated_at BEFORE UPDATE ON public.message_blocks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.message_blocks (name, body_markdown, position, is_seed)
SELECT v.name, v.body, v.pos, true
FROM (VALUES
  ('Dietary requirements link',
   E'If you have any dietary requirements or accessibility needs, please let us know here: [[dietary_url]]. It takes a minute and it means we can plan properly for you on the day.', 10),
  ('Complete your ticket info',
   E'Your ticket is not finished yet. Please take a minute to complete your details so we have your name, job title and company right on the day: {{ticket_url}}', 20),
  ('Agenda link',
   E'You can see the full agenda here: [[agenda_url]] (subject to change).', 30),
  ('Venue requirement notice',
   E'One thing to note before you arrive: [[venue_notes]]', 40),
  ('LinkedIn share graphic',
   E'If you would like to tell your network you are joining us, we have a share graphic ready for you. Post it with a line about what you are looking forward to and tag [[event_name]].', 50)
) AS v(name, body, pos)
WHERE NOT EXISTS (SELECT 1 FROM public.message_blocks b WHERE lower(btrim(b.name)) = lower(v.name));

-- 7. dietary url on events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS dietary_url text;