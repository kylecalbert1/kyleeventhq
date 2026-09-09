ALTER TYPE public.session_format ADD VALUE IF NOT EXISTS 'roundtable';
ALTER TABLE public.speakers ADD COLUMN IF NOT EXISTS profile_notes text;
ALTER TABLE public.speakers ADD COLUMN IF NOT EXISTS topic_ideas jsonb;
ALTER TABLE public.speakers ADD COLUMN IF NOT EXISTS topic_ideas_generated_at timestamptz;