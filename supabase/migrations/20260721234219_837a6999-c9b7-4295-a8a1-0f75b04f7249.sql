
ALTER TABLE public.tito_events
  ADD COLUMN IF NOT EXISTS business_line text NOT NULL DEFAULT 'other';

ALTER TABLE public.tito_events
  DROP CONSTRAINT IF EXISTS tito_events_business_line_check;
ALTER TABLE public.tito_events
  ADD CONSTRAINT tito_events_business_line_check
  CHECK (business_line IN ('AIAI','CSC','other'));

-- Seed existing rows from their title. Case-insensitive substring match.
UPDATE public.tito_events
SET business_line = CASE
  WHEN title ~* '(agentic ai|ai accelerator|chief ai officer|computer vision|generative ai|genai|llmops)' THEN 'AIAI'
  WHEN title ~* '(customer support|customer success|chief customer officer|expand|effortless)' THEN 'CSC'
  ELSE 'other'
END;

CREATE INDEX IF NOT EXISTS idx_tito_events_business_line
  ON public.tito_events(business_line);
