
-- 1) email_templates table
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  is_seed boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_templates_staff_all" ON public.email_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'staff'));

CREATE TRIGGER email_templates_set_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) relax email_sends template_type constraint
ALTER TABLE public.email_sends DROP CONSTRAINT IF EXISTS email_sends_template_type_check;

-- 3) seed templates. Copy rules: sentence case, no em dashes, plain sign-off.
INSERT INTO public.email_templates (slug, name, subject, body, is_seed) VALUES
('speaker_pass_reminder',
 'Speaker pass registration reminder',
 'Registering your speaker pass for {{event_name}}',
 'Hi {{first_name}},

Quick nudge to lock in your speaker pass for {{event_name}} on {{event_date}} at {{venue}}. You can register in one click here: {{speaker_pass_link}}.

Once you are registered we can wrap the last logistics.

Kyle & The AI AI Team',
 true),
('guest_pass_invite',
 'Guest pass invite',
 'A guest pass for you at {{event_name}}',
 'Hi {{first_name}},

Would love to have you join us at {{event_name}} on {{event_date}} at {{venue}}. Here is your complimentary guest pass link: {{guest_pass_link}}.

Grab it whenever suits, no rush, and let me know if you have any questions.

Kyle & The AI AI Team',
 true),
('guest_pass_reminder',
 'Guest pass reminder',
 'Reminder: your guest pass for {{event_name}}',
 'Hi {{first_name}},

Just circling back on your complimentary guest pass for {{event_name}} on {{event_date}}. Registration only takes a moment: {{guest_pass_link}}.

Kyle & The AI AI Team',
 true),
('future_event_invite',
 'Future event invite (past speaker)',
 'Speaking again at {{event_name}}?',
 'Hi {{first_name}},

Loved having you at {{past_event_name}}. We are planning {{event_name}} on {{event_date}} at {{venue}} and would love to have you back on stage.

Happy to share the current agenda thinking if it helps you decide. Any interest?

Kyle & The AI AI Team',
 true),
('speaker_confirmation',
 'Speaker confirmation',
 'Confirming your session at {{event_name}}',
 'Hi {{first_name}},

Delighted to confirm your session {{session_title}} at {{event_name}} on {{event_date}} at {{venue}}. We will send banner artwork and event day logistics closer to the time.

Anything you need in the meantime, just reply here.

Kyle & The AI AI Team',
 true),
('bio_headshot_chaser',
 'Bio and headshot chaser',
 'Bio and headshot for {{event_name}}',
 'Hi {{first_name}},

Whenever you get a moment, could you send a short speaker bio (two or three sentences) and a high resolution headshot for {{event_name}}? Our design team uses them for the website and the event day slides.

Kyle & The AI AI Team',
 true),
('banner_request',
 'Banner request',
 'Confirming your banner for {{event_name}}',
 'Hi {{first_name}},

Our design team is putting speaker banners together for {{event_name}}. Could you confirm your session title {{session_title}} and company name {{company}} are still correct so we can lock the artwork in?

Kyle & The AI AI Team',
 true),
('custom_blank',
 'Custom blank',
 '',
 'Hi {{first_name}},

Kyle & The AI AI Team',
 true);
