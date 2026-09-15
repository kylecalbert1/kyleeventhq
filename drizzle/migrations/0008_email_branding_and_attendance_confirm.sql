-- Template "kind" drives the branded CTA button colour.
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS cta_label text;
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS cta_url text;

-- Click-to-confirm timestamp for a speaker's speaking date.
ALTER TABLE public.speakers ADD COLUMN IF NOT EXISTS attendance_confirmed_at timestamptz;

-- Optional per-event logo override (business-line logo is the default).
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS logo_url text;

-- Shared branding per business line (AIAI / CSC).
CREATE TABLE IF NOT EXISTS public.business_line_branding (
  business_line text PRIMARY KEY,
  logo_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_line_branding TO authenticated;
GRANT ALL ON public.business_line_branding TO service_role;

ALTER TABLE public.business_line_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage business line branding"
  ON public.business_line_branding FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Backfill template kinds for the existing seed templates.
UPDATE public.email_templates SET kind = 'confirm' WHERE slug IN ('speaker_confirmation', 'confirm_speaking_date') AND kind IS NULL;
UPDATE public.email_templates SET kind = 'reminder' WHERE slug IN ('speaker_pass_reminder', 'checking_in', 'banner_reminder') AND kind IS NULL;
UPDATE public.email_templates SET kind = 'info' WHERE slug IN ('welcome_new_joiner', 'future_event_invite') AND kind IS NULL;

-- Default copy + purple CTA for the new confirm-speaking-date email.
UPDATE public.email_templates
SET
  kind = 'confirm_speaking_date',
  subject = 'Confirming your speaking date at {{event_name}}',
  body = 'Hi {{first_name}},<br/><br/>Just confirming you''re still speaking at <strong>{{event_name}}</strong> on {{event_date}}. We''ll send your exact session time closer to the date — can you confirm you''re still able to join?',
  cta_label = 'Yes, I can confirm',
  cta_url = '{{confirm_attendance_link}}'
WHERE slug = 'confirm_speaking_date';