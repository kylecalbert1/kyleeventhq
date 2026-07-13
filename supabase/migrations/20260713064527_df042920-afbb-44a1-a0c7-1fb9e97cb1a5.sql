ALTER TYPE public.website_stage ADD VALUE IF NOT EXISTS 'amendments' BEFORE 'signed_off';
ALTER TABLE public.website_tasks ADD COLUMN IF NOT EXISTS amendments_actioned_done boolean NOT NULL DEFAULT false;
ALTER TABLE public.website_tasks ADD COLUMN IF NOT EXISTS amendments_actioned_date date;