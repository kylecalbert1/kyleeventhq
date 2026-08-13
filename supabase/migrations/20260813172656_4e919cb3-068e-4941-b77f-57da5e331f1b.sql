CREATE OR REPLACE FUNCTION public.generate_speaker_confirmation_draft(_speaker_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sp record;
  ev record;
  tmpl record;
  session_title_val text;
  session_label_val text;
  panel_length int;
  speaker_logistics_val text;
  event_date_val text;
  venue_line text;
  sign_off_val text;
  pass_links_val text := '';
  speaker_pass text;
  guest_pass text;
  subj text;
  body_txt text;
BEGIN
  -- Idempotency guard: if this speaker already has a confirmation draft in ANY
  -- state (draft / sent / discarded), never touch it again. Re-confirmations
  -- (syncs, status re-saves, confirmed -> declined -> confirmed) used to
  -- re-run the upsert, overwriting edited bodies and re-logging generation.
  IF EXISTS (
    SELECT 1 FROM public.speaker_email_drafts
    WHERE speaker_id = _speaker_id AND kind = 'confirmation'
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO sp FROM public.speakers WHERE id = _speaker_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO ev FROM public.events WHERE id = sp.event_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT subject, body INTO tmpl
    FROM public.email_templates
    WHERE slug = 'speaker_confirmation' AND is_archived = false
    LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT ai.title INTO session_title_val
    FROM public.agenda_items ai
    WHERE ai.event_id = sp.event_id
      AND _speaker_id = ANY(ai.speaker_ids)
    ORDER BY ai.position ASC
    LIMIT 1;
  session_title_val := COALESCE(NULLIF(session_title_val, ''), sp.session_title, 'your session');

  event_date_val := COALESCE(to_char(ev.event_date, 'FMDay, FMMonth FMDD, YYYY'), 'the event date');

  IF ev.format = 'virtual' OR ev.venue IS NULL OR ev.venue = '' THEN
    venue_line := '';
  ELSE
    venue_line := E'\n→ Venue: ' || ev.venue;
  END IF;

  IF ev.business_line = 'AIAI' THEN
    sign_off_val := 'Kyle & The AI AI Team';
    panel_length := 30;
  ELSE
    sign_off_val := E'Best,\nKyle Calbert\nAssociate Events Producer\nCustomer Success Collective';
    panel_length := 45;
  END IF;

  IF sp.session_format = 'panel' THEN
    session_label_val := 'Panel';
    speaker_logistics_val := '→ Panel format: 4 panelists, ' || panel_length || E'-minute discussion including audience Q&A\n→ Panel briefing: Ahead of the event, we''ll arrange a briefing call where you''ll meet the other panelists, review the discussion flow, and align on the questions.';
  ELSIF sp.session_format = 'keynote' THEN
    session_label_val := 'Keynote';
    speaker_logistics_val := '→ Format: 30 minutes, 20 minute presentation plus 10 minute Q&A';
  ELSIF sp.session_format = 'workshop' THEN
    session_label_val := 'Workshop';
    speaker_logistics_val := '→ Format: workshop session, length and structure to be confirmed closer to the time';
  ELSIF sp.session_format = 'fireside' THEN
    session_label_val := 'Fireside chat';
    speaker_logistics_val := '→ Format: fireside chat, 30 minutes including audience Q&A';
  ELSE
    session_label_val := 'Session';
    speaker_logistics_val := '→ Format: to be confirmed, I''ll follow up with the details';
  END IF;

  IF ev.format <> 'virtual' AND ev.tito_slug IS NOT NULL THEN
    SELECT registration_url INTO speaker_pass
      FROM public.tito_releases
      WHERE event_slug = ev.tito_slug
        AND title ILIKE '%speaker%'
        AND title NOT ILIKE '%guest%'
      ORDER BY updated_at DESC
      LIMIT 1;

    SELECT registration_url INTO guest_pass
      FROM public.tito_releases
      WHERE event_slug = ev.tito_slug
        AND title ILIKE '%guest%'
      ORDER BY updated_at DESC
      LIMIT 1;
  END IF;

  IF speaker_pass IS NOT NULL THEN
    pass_links_val := pass_links_val || E'\n→ Sign up for Speaker pass: ' || speaker_pass;
  END IF;
  IF guest_pass IS NOT NULL THEN
    pass_links_val := pass_links_val || E'\n→ Guest pass: ' || guest_pass;
  END IF;

  subj := tmpl.subject;
  subj := replace(subj, '{{event_name}}', COALESCE(ev.name, ''));

  body_txt := tmpl.body;
  body_txt := replace(body_txt, '{{first_name}}',
    COALESCE(NULLIF(split_part(sp.name, ' ', 1), ''), 'there'));
  body_txt := replace(body_txt, '{{session_label}}', session_label_val);
  body_txt := replace(body_txt, '{{session_title}}', session_title_val);
  body_txt := replace(body_txt, '{{event_name}}', COALESCE(ev.name, ''));
  body_txt := replace(body_txt, '{{event_date}}', event_date_val);
  body_txt := replace(body_txt, E'\n→ Venue: {{venue}}', venue_line);
  body_txt := replace(body_txt, '{{speaker_logistics}}', speaker_logistics_val);
  body_txt := replace(body_txt, '{{pass_links}}', pass_links_val);
  body_txt := replace(body_txt, '{{sign_off}}', sign_off_val);

  INSERT INTO public.speaker_email_drafts
    (speaker_id, kind, subject, body, status, speaker_pass_link, guest_pass_link)
  VALUES
    (_speaker_id, 'confirmation', subj, body_txt, 'draft', speaker_pass, guest_pass)
  ON CONFLICT (speaker_id, kind) DO NOTHING;

  INSERT INTO public.speaker_activity_log (speaker_id, event_type, note)
  VALUES (_speaker_id, 'confirmation_draft_generated',
          'Auto-generated confirmation email draft');
END;
$function$;