INSERT INTO public.email_templates (slug, name, subject, body, is_seed)
VALUES
  ('welcome_new_joiner', 'Welcome (new joiner)', 'Welcome to {{event_name}}', E'Hi {{first_name}},\n\nWelcome aboard for {{event_name}} on {{event_date}} at {{venue}}.\n\nI will be your main point of contact in the run up, so just reply here with anything you need.\n\nSpeak soon,', true),
  ('checking_in', 'Checking in (no reply)', 'Checking in on {{event_name}}', E'Hi {{first_name}},\n\nJust checking in on my last note about {{event_name}}. I know things get busy, so no rush, but it would be great to know where you have landed.\n\nHappy to jump on a quick call if that is easier.\n\nThanks,', true),
  ('confirm_speaking_date', 'Confirm speaking date (calendar to follow)', 'Confirm your speaking date for {{event_name}}', '', true)
ON CONFLICT (slug) DO NOTHING;