-- Message templates (Tito copy-paste library). Separate from email_templates.
CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  stream text NOT NULL CHECK (stream IN ('speakers','attendees','incomplete_tickets','everyone')),
  weeks_out integer,
  business_line text CHECK (business_line IN ('AIAI','CSC')),
  event_format text CHECK (event_format IN ('in_person','virtual')),
  subject text NOT NULL DEFAULT '',
  body_markdown text NOT NULL DEFAULT '',
  tito_filter_hint text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  is_seed boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_templates_staff_all" ON public.message_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'staff'));

CREATE TRIGGER message_templates_set_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Manual "I sent this in Tito" log
CREATE TABLE public.event_message_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  recipient_count integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_message_sends TO authenticated;
GRANT ALL ON public.event_message_sends TO service_role;
ALTER TABLE public.event_message_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_message_sends_staff_all" ON public.event_message_sends
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'staff'));

-- Event fields the message copy needs
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_site_url text,
  ADD COLUMN IF NOT EXISTS venue_url text,
  ADD COLUMN IF NOT EXISTS venue_address text,
  ADD COLUMN IF NOT EXISTS registration_time text,
  ADD COLUMN IF NOT EXISTS sessions_start_time text,
  ADD COLUMN IF NOT EXISTS venue_notes text,
  ADD COLUMN IF NOT EXISTS join_instructions text;

-- Seed cadence
INSERT INTO public.message_templates (name, stream, weeks_out, business_line, event_format, subject, body_markdown, tito_filter_hint, position, is_seed) VALUES

('Speaker updates', 'speakers', 12, NULL, NULL,
 '[[event_name]] speaker update',
 $tpl$Hi {{first_name}}!

Thanks again for agreeing to speak at [[event_name]] on [[event_date_long]]. Here is where things stand.

We are building out the agenda now and confirming the rest of the line up. You can see the event page [here.]([[event_site_url]])

Nothing is needed from you yet. Closer to the event I will come back to you for your bio, headshot and slides, and we will book a short prep call.

If anything about your session or availability changes, just reply and let me know.

Best,
[[signoff]]$tpl$,
 'Filter to Speaker Pass + Speaker Guest releases', 0, true),

('Speaker updates', 'speakers', 9, NULL, NULL,
 '[[event_name]] speaker update',
 $tpl$Hi {{first_name}}!

A quick update on [[event_name]], taking place on [[event_date_long]].

The agenda is taking shape and most sessions are now allocated. The working agenda is [here.]([[agenda_url]]) (subject to change)

If you have a preferred session title and a one line description, send them over when you can and I will get them onto the site.

Best,
[[signoff]]$tpl$,
 'Filter to Speaker Pass + Speaker Guest releases', 0, true),

('Speaker updates', 'speakers', 8, NULL, NULL,
 '[[event_name]] speaker update',
 $tpl$Hi {{first_name}}!

[[event_name]] is eight weeks away, on [[event_date_long]].

Registrations are moving well and we are announcing speakers on LinkedIn over the next few weeks. If you would like to be included in the next batch, send me your bio and headshot and I will get you scheduled.

The current agenda is [here.]([[agenda_url]]) (subject to change)

Best,
[[signoff]]$tpl$,
 'Filter to Speaker Pass + Speaker Guest releases', 0, true),

('Speaker updates', 'speakers', 6, NULL, NULL,
 '[[event_name]] speaker update',
 $tpl$Hi {{first_name}}!

Six weeks to go until [[event_name]] on [[event_date_long]].

The agenda is now close to final: [here.]([[agenda_url]]) (subject to change)

Two things coming your way shortly: a request for your slides, and a prep call invitation so we can run through your session and the format on the day.

If you have any questions in the meantime, just reply here.

Best,
[[signoff]]$tpl$,
 'Filter to Speaker Pass + Speaker Guest releases', 0, true),

('Speaker deadlines', 'speakers', 4, NULL, NULL,
 'Bio, headshot and slides for [[event_name]]',
 $tpl$Hi {{first_name}}!

[[event_name]] is four weeks away, on [[event_date_long]], so this is the first call for your session materials.

Please send:

- Your bio (short paragraph is fine)
- A headshot
- Your final session title and description

Slides are not due yet, but if you already have a draft I am happy to look over it.

Agenda [here.]([[agenda_url]]) (subject to change)

Best,
[[signoff]]$tpl$,
 'Filter to Speaker Pass + Speaker Guest releases', 0, true),

('Speaker deadlines', 'speakers', 3, NULL, NULL,
 'Reminder: materials for [[event_name]]',
 $tpl$Hi {{first_name}}!

A reminder that we still need a few things from you ahead of [[event_name]] on [[event_date_long]].

Outstanding: bio, headshot, final session title and slides.

Slides are due next week so the AV team can load everything in advance. If you send them over this week I will confirm receipt straight away.

Best,
[[signoff]]$tpl$,
 'Filter to Speaker Pass + Speaker Guest releases', 0, true),

('Speaker deadlines', 'speakers', 2, NULL, NULL,
 'Slides deadline for [[event_name]]',
 $tpl$Hi {{first_name}}!

[[event_name]] is two weeks away, on [[event_date_long]], and this is the final deadline for slides.

Please send your deck by the end of this week. If you are still finishing it, send what you have and we can swap in the final version later.

If you are presenting without slides, reply and let me know so we can plan the room and AV accordingly.

Best,
[[signoff]]$tpl$,
 'Filter to Speaker Pass + Speaker Guest releases', 0, true),

('Final speaker updates', 'speakers', 0, NULL, 'in_person',
 'Everything you need for [[event_name]]',
 $tpl$Hi {{first_name}}!

[[event_name]] is opening its doors on [[event_day_name]], and here is everything you need as a speaker.

**Dates:** [[event_date_long]]

**Agenda:** [here.]([[agenda_url]]) (subject to change)

**Venue:** [[[venue_name]]]([[venue_url]]), [[venue_address]].

Please arrive by [[registration_time]] so we can get you badged, miked and settled before sessions start at [[sessions_start_time]]. Come to the registration desk first and ask for the events team.

What to bring: your laptop and any adapters you need, plus a backup of your slides on a USB stick.

[[venue_notes]]

Let me know if you have any questions, and we look forward to seeing you at the event!

Best,
[[signoff]]$tpl$,
 'Filter to Speaker Pass + Speaker Guest releases', 0, true),

('Final speaker updates', 'speakers', 0, NULL, 'virtual',
 'Everything you need for [[event_name]]',
 $tpl$Hi {{first_name}}!

[[event_name]] is going live on [[event_day_name]], and here is everything you need as a speaker.

**Dates:** [[event_date_long]]

**Agenda:** [here.]([[agenda_url]]) (subject to change)

**Joining:** [[join_instructions]]

Please join 30 minutes before your session so we can check your camera, microphone and screen share. Sessions start at [[sessions_start_time]].

A wired connection and headphones make a noticeable difference to the recording quality, so use them if you can.

Let me know if you have any questions, and we look forward to seeing you online!

Best,
[[signoff]]$tpl$,
 'Filter to Speaker Pass + Speaker Guest releases', 0, true),

('Attendee updates', 'attendees', 12, NULL, NULL,
 'Your [[event_name]] ticket',
 $tpl$Hi {{first_name}}!

Thanks for registering for [[event_name]] on [[event_date_long]]. Your place is confirmed.

We are building the agenda now and will announce speakers over the coming weeks. Event details live [here.]([[event_site_url]])

If a colleague would benefit from attending, forward them the link and I can look at a pass for them.

Best,
[[signoff]]$tpl$,
 'Filter to all complete tickets', 0, true),

('Attendee updates', 'attendees', 8, NULL, NULL,
 '[[event_name]] agenda update',
 $tpl$Hi {{first_name}}!

[[event_name]] is eight weeks away, on [[event_date_long]].

The first version of the agenda is now live: [here.]([[agenda_url]]) (subject to change)

More speakers are being confirmed each week, so it is worth checking back. If there is a topic you want covered, reply and tell me, we still have room to shape a session or two.

Best,
[[signoff]]$tpl$,
 'Filter to all complete tickets', 0, true),

('Attendee updates', 'attendees', 6, NULL, NULL,
 'Speaker line up for [[event_name]]',
 $tpl$Hi {{first_name}}!

Six weeks to go until [[event_name]] on [[event_date_long]].

The speaker line up is close to complete and the agenda is [here.]([[agenda_url]]) (subject to change)

If you have not already, add the date to your calendar and let your team know you will be out for the day.

Best,
[[signoff]]$tpl$,
 'Filter to all complete tickets', 0, true),

('Attendee updates', 'attendees', 4, NULL, NULL,
 '[[event_name]] is four weeks away',
 $tpl$Hi {{first_name}}!

[[event_name]] is four weeks away, on [[event_date_long]].

The agenda is now final in structure, with a few speaker slots still being confirmed: [here.]([[agenda_url]])

Practical details, including timings and venue information, will come through closer to the day.

Best,
[[signoff]]$tpl$,
 'Filter to all complete tickets', 0, true),

('Attendee updates', 'attendees', 3, NULL, NULL,
 'Three weeks until [[event_name]]',
 $tpl$Hi {{first_name}}!

Three weeks until [[event_name]] on [[event_date_long]].

The full agenda is [here.]([[agenda_url]]) (subject to change)

If you have any dietary requirements or accessibility needs, reply and let me know so we can get everything arranged in advance.

Best,
[[signoff]]$tpl$,
 'Filter to all complete tickets', 0, true),

('Attendee updates', 'attendees', 2, NULL, NULL,
 'Two weeks until [[event_name]]',
 $tpl$Hi {{first_name}}!

[[event_name]] is two weeks away, on [[event_date_long]].

Agenda: [here.]([[agenda_url]]) (subject to change)

Everything you need for the day, including timings and directions, will land in your inbox a couple of days before the event.

If you can no longer make it, let me know as soon as you can so we can offer your place to someone on the waiting list.

Best,
[[signoff]]$tpl$,
 'Filter to all complete tickets', 0, true),

('Final updates', 'attendees', 0, NULL, 'in_person',
 'Everything you need for [[event_name]]',
 $tpl$Hi {{first_name}}!

[[event_name]] is opening its doors on [[event_day_name]], and here is all the important info that you need to know.

**Dates:** [[event_date_long]]

**Agenda:** [here.]([[agenda_url]]) (subject to change)

**Venue:** [[[venue_name]]]([[venue_url]]), [[venue_address]].

Breakfast and registration start at [[registration_time]], with all sessions starting at [[sessions_start_time]]. Upon arrival, please make your way to the registration desk to get your badge.

[[venue_notes]]

Let me know if you have any questions, and we look forward to seeing you at the event!

Best,
[[signoff]]$tpl$,
 'Filter to all complete tickets', 0, true),

('Final updates', 'attendees', 0, NULL, 'virtual',
 'Everything you need for [[event_name]]',
 $tpl$Hi {{first_name}}!

[[event_name]] goes live on [[event_day_name]], and here is all the important info that you need to know.

**Dates:** [[event_date_long]]

**Agenda:** [here.]([[agenda_url]]) (subject to change)

**Joining:** [[join_instructions]]

Sessions start at [[sessions_start_time]]. You can join a few minutes early to check your audio and get settled.

Let me know if you have any questions, and we look forward to seeing you online!

Best,
[[signoff]]$tpl$,
 'Filter to all complete tickets', 0, true),

('Please complete your ticket info', 'incomplete_tickets', 8, NULL, NULL,
 'Finish your [[event_name]] registration',
 $tpl$Hi {{first_name}}!

{{#any_incomplete_tickets}}
Your ticket for [[event_name]] on [[event_date_long]] is reserved but not yet complete. It takes about a minute to finish.

Please complete it here: {{{ticket_url}}}

Once it is done you will start receiving agenda and speaker updates.
{{/any_incomplete_tickets}}

Best,
[[signoff]]$tpl$,
 'Filter to incomplete tickets only', 0, true),

('Please complete your ticket info', 'incomplete_tickets', 6, NULL, NULL,
 'Your [[event_name]] ticket is still incomplete',
 $tpl$Hi {{first_name}}!

{{#any_incomplete_tickets}}
A quick reminder that your ticket for [[event_name]] on [[event_date_long]] still needs your details.

Complete it here: {{{ticket_url}}}

We need your name, company and job title to get your badge printed.
{{/any_incomplete_tickets}}

Best,
[[signoff]]$tpl$,
 'Filter to incomplete tickets only', 0, true),

('Please complete your ticket info', 'incomplete_tickets', 5, NULL, NULL,
 'One minute to complete your [[event_name]] ticket',
 $tpl$Hi {{first_name}}!

{{#any_incomplete_tickets}}
Your place at [[event_name]] on [[event_date_long]] is being held, but the ticket is not complete yet.

Finish it here: {{{ticket_url}}}

If you no longer plan to attend, just reply and I will release the place.
{{/any_incomplete_tickets}}

Best,
[[signoff]]$tpl$,
 'Filter to incomplete tickets only', 0, true),

('Please complete your ticket info', 'incomplete_tickets', 3, NULL, NULL,
 'Last call to complete your [[event_name]] ticket',
 $tpl$Hi {{first_name}}!

{{#any_incomplete_tickets}}
[[event_name]] is three weeks away and your ticket is still incomplete.

Complete it here: {{{ticket_url}}}

Badges are printed shortly, so please finish it this week to be included.
{{/any_incomplete_tickets}}

Best,
[[signoff]]$tpl$,
 'Filter to incomplete tickets only', 0, true),

('Please complete your ticket info', 'incomplete_tickets', 0, NULL, NULL,
 'Final reminder: complete your [[event_name]] ticket',
 $tpl$Hi {{first_name}}!

{{#any_incomplete_tickets}}
[[event_name]] takes place on [[event_day_name]] and your ticket is still incomplete.

Complete it here: {{{ticket_url}}}

If you turn up without a completed ticket we can still check you in, but it will be quicker for you if it is done in advance.
{{/any_incomplete_tickets}}

Best,
[[signoff]]$tpl$,
 'Filter to incomplete tickets only', 0, true),

('Thank you for joining us', 'everyone', 0, NULL, NULL,
 'Thank you for joining us at [[event_name]]',
 $tpl$Hi {{first_name}}!

Thank you for joining us at [[event_name]] today. It was good to have you there.

We will be sending the session recordings and slides in a few weeks once everything has been edited.

In the meantime, if there is anyone you met and want an introduction to, or anything you would like us to cover at the next one, just reply and let me know.

Best,
[[signoff]]$tpl$,
 'Filter to all attendees and speakers', 0, true),

('Session recordings', 'everyone', -3, NULL, NULL,
 '[[event_name]] recordings and slides',
 $tpl$Hi {{first_name}}!

The recordings and slides from [[event_name]] are ready.

You can find everything on the event page: [[[event_name]]]([[event_site_url]])

Feel free to share them with your team. If a specific session was useful and you want to talk it through, reply and I will put you in touch with the speaker.

Best,
[[signoff]]$tpl$,
 'Filter to all attendees and speakers', 0, true),

('Complimentary pass approved', 'attendees', NULL, NULL, NULL,
 'Your pass for [[event_name]]',
 $tpl$Hi {{first_name}}!

Good news, your complimentary pass for [[event_name]] on [[event_date_long]] has been approved.

You can register here: [[event_site_url]]

Please complete your ticket details when you register so we can get your badge ready. The agenda is [here.]([[agenda_url]]) (subject to change)

Best,
[[signoff]]$tpl$,
 'Send to the specific approved recipients only, usually 1 to 8 people', 0, true),

('Dietary requirements and accommodation', 'attendees', NULL, NULL, 'in_person',
 'Dietary requirements for [[event_name]]',
 $tpl$Hi {{first_name}}!

Ahead of [[event_name]] on [[event_date_long]], we are finalising catering and accessibility arrangements at [[venue_name]].

If you have any dietary requirements, allergies or accessibility needs, reply to this message and let me know. It is easier for us to arrange now than on the day.

Best,
[[signoff]]$tpl$,
 'Filter to all complete tickets, or to the individuals who need asking', 0, true),

('Venue requirement notice', 'everyone', NULL, NULL, 'in_person',
 'Important venue information for [[event_name]]',
 $tpl$Hi {{first_name}}!

One thing to be aware of before [[event_name]] on [[event_date_long]].

[[venue_notes]]

**Venue:** [[[venue_name]]]([[venue_url]]), [[venue_address]].

Registration opens at [[registration_time]] and sessions start at [[sessions_start_time]].

Best,
[[signoff]]$tpl$,
 'Filter to everyone attending in person', 0, true);