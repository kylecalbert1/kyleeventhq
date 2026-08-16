-- Backfill semantic kinds on board columns whose names clearly mean a stage.
UPDATE public.speaker_board_columns SET kind = 'declined'
WHERE kind IS NULL AND (name ILIKE '%declin%' OR name ILIKE '%reject%' OR name ILIKE '%not interested%');

UPDATE public.speaker_board_columns SET kind = 'registered'
WHERE kind IS NULL AND (name ILIKE '%registr%' OR name ILIKE '%register%' OR name ILIKE '%on site%' OR name ILIKE '%onsite%');

UPDATE public.speaker_board_columns SET kind = 'confirmed'
WHERE kind IS NULL AND (name ILIKE '%confirm%' OR name ILIKE '%signed%' OR name ILIKE '%booked%' OR name ILIKE '%agreed%');

UPDATE public.speaker_board_columns SET kind = 'in_conversation'
WHERE kind IS NULL AND (name ILIKE '%conversation%' OR name ILIKE '%discussion%' OR name ILIKE '%in progress%' OR name ILIKE '%outreach%' OR name ILIKE '%contact%' OR name ILIKE '%follow up%');

UPDATE public.speaker_board_columns SET kind = 'interest'
WHERE kind IS NULL AND (name ILIKE '%interest%' OR name ILIKE '%prospect%' OR name ILIKE '%lead%' OR name ILIKE '%backlog%');

-- Re-stamp speaker status from their column's kind.
UPDATE public.speakers s SET status = 'confirmed'
FROM public.speaker_board_columns c
WHERE s.board_column_id = c.id AND c.kind IN ('confirmed','registered') AND s.status <> 'confirmed';

UPDATE public.speakers s SET status = 'declined'
FROM public.speaker_board_columns c
WHERE s.board_column_id = c.id AND c.kind = 'declined' AND s.status <> 'declined';

UPDATE public.speakers s SET status = 'in_conversation'
FROM public.speaker_board_columns c
WHERE s.board_column_id = c.id AND c.kind = 'in_conversation' AND s.status IN ('new','contacted');