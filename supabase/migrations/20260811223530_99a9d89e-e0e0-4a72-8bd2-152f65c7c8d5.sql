ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS sponsor_watch_emails text[] NOT NULL DEFAULT '{}'::text[];