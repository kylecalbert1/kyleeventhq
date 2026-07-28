CREATE TABLE public.speaker_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_id uuid NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.speaker_boards TO authenticated;
GRANT ALL ON public.speaker_boards TO service_role;
ALTER TABLE public.speaker_boards ENABLE ROW LEVEL SECURITY;
CREATE POLICY speaker_boards_staff_all ON public.speaker_boards FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.speaker_board_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.speaker_boards(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  kind text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.speaker_board_columns TO authenticated;
GRANT ALL ON public.speaker_board_columns TO service_role;
ALTER TABLE public.speaker_board_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY speaker_board_columns_staff_all ON public.speaker_board_columns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_speaker_board_columns_board ON public.speaker_board_columns(board_id, position);
CREATE INDEX idx_speaker_boards_event ON public.speaker_boards(event_id);

CREATE TRIGGER speaker_boards_set_updated_at BEFORE UPDATE ON public.speaker_boards
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER speaker_board_columns_set_updated_at BEFORE UPDATE ON public.speaker_board_columns
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.speakers
  ADD COLUMN board_column_id uuid NULL REFERENCES public.speaker_board_columns(id) ON DELETE SET NULL;
CREATE INDEX idx_speakers_board_column ON public.speakers(board_column_id);

-- Seed one board per existing event, with five default columns.
INSERT INTO public.speaker_boards (name, event_id)
SELECT COALESCE(e.code, e.name) || ' speakers', e.id FROM public.events e;

INSERT INTO public.speaker_board_columns (board_id, name, position, kind)
SELECT b.id, c.name, c.position, c.kind
FROM public.speaker_boards b
CROSS JOIN (VALUES
  ('Interest', 0, 'interest'),
  ('In conversation', 1, 'in_conversation'),
  ('Confirmed', 2, 'confirmed'),
  ('Registered', 3, 'registered'),
  ('Declined', 4, 'declined')
) AS c(name, position, kind);

-- Backfill placement for existing speakers.
WITH registered AS (
  SELECT s.id AS speaker_id
  FROM public.speakers s
  JOIN public.events e ON e.id = s.event_id
  WHERE e.tito_slug IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tito_tickets t
      WHERE t.event_slug = e.tito_slug
        AND (
          lower(t.release_title) LIKE '%speaker pass%'
          OR lower(t.release_title) LIKE '%speaker guest%'
          OR lower(t.release_title) LIKE '%guest pass%'
        )
        AND (
          (s.email IS NOT NULL AND lower(btrim(s.email)) = lower(btrim(COALESCE(t.email, ''))) AND btrim(s.email) <> '')
          OR (s.source_ticket_id IS NOT NULL AND s.source_ticket_id = t.id)
        )
    )
),
target AS (
  SELECT s.id AS speaker_id,
    CASE
      WHEN s.status = 'declined' THEN 'declined'
      WHEN s.status = 'confirmed' AND r.speaker_id IS NOT NULL THEN 'registered'
      WHEN s.status = 'confirmed' THEN 'confirmed'
      WHEN s.status IN ('in_conversation','responded') OR s.call_scheduled THEN 'in_conversation'
      ELSE 'interest'
    END AS kind,
    s.event_id
  FROM public.speakers s
  LEFT JOIN registered r ON r.speaker_id = s.id
)
UPDATE public.speakers sp
SET board_column_id = col.id
FROM target t
JOIN public.speaker_boards b ON b.event_id = t.event_id
JOIN public.speaker_board_columns col ON col.board_id = b.id AND col.kind = t.kind
WHERE sp.id = t.speaker_id;