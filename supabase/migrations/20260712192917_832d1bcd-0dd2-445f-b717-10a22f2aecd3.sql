ALTER TABLE public.events ADD COLUMN IF NOT EXISTS banner_dropbox_link text;

UPDATE public.events e SET banner_dropbox_link = sub.link
FROM (
  SELECT DISTINCT ON (event_id) event_id, dropbox_link AS link
  FROM public.speakers
  WHERE dropbox_link IS NOT NULL AND dropbox_link <> ''
  ORDER BY event_id, updated_at DESC
) sub
WHERE e.id = sub.event_id AND (e.banner_dropbox_link IS NULL OR e.banner_dropbox_link = '');