# Generate Topic Ideas for speakers

Add an AI action on a speaker that turns their pasted LinkedIn profile text into 3 ranked session topic ideas, tailored to the event and slot format, saved on the speaker so it only regenerates on demand.

## What changes for Kyle

- Each speaker gets a new **Profile notes / bio** box (paste the LinkedIn About section, work history, recent posts). The existing **Notes** box stays for internal operational notes, so the two never get mixed up.
- **Roundtable** joins Keynote, Panel, Workshop and Fireside everywhere a session format is picked or shown.
- The speaker detail popup gets a **Topic ideas** card with a **Generate topic ideas** button. Once generated the three ideas stay on the card, with when they were generated and a **Regenerate** button.
- Each idea shows a rank pill, a title and a one or two sentence description. If another speaker on the same event is already being pitched something similar, a warning line says so. If the person's background doesn't fit the event at all, the card says that plainly instead of inventing topics.
- The button is disabled with a hint when there's no profile text or no session format chosen yet.

## Database

One migration:
- `ALTER TYPE session_format ADD VALUE 'roundtable';`
- On `speakers`: `profile_notes text`, `topic_ideas jsonb`, `topic_ideas_generated_at timestamptz`.
- Existing table grants and RLS policies already cover these columns; no new policy needed.
- Regenerate `src/integrations/supabase/types.ts`.

## Server function

New `src/lib/topic-ideas.functions.ts`, same shape as `message-ai.functions.ts`: `createServerFn({method:"POST"})` + `requireSupabaseAuth`, zod-validated `{ speaker_id }`, Lovable AI Gateway chat call with `response_format: json_object`, same 429/402/!ok error handling, zod-parsed result.

It loads the speaker, their event (name, code, business line, format), and sibling speakers on the same `event_id` that have a `session_title`, then persists the result to `topic_ideas` / `topic_ideas_generated_at` and returns it.

Result shape:
```json
{ "fit": "good" | "poor", "fit_note": string|null,
  "overlap_note": string|null,
  "topics": [{ "rank": 1, "title": string, "description": string }] }
```
When `fit` is `poor`, `topics` may be empty and `fit_note` explains why.

System prompt encodes, verbatim as rules: use only verified specific facts from the profile (quotes, numbers, named projects), prefer recent original posts over About-section marketing copy; calibrate seniority (no "how I became a X" for peer-level executive audiences); reject tagline topics with no mechanism or debate; don't force one industry's detail on a mixed-industry room; flag overlap with the listed sibling topics explicitly; titles must sell the session to an attendee choosing a room, not restate a job title; no confessional "what I got wrong" framing by default; match structure to format (keynote/fireside = one narrative, panel = debatable topic, workshop = hands-on, roundtable = a discussion prompt, not a lecture); say plainly when the background doesn't fit rather than inventing topics.

## Frontend

- `src/lib/status.ts`: add `roundtable` to `SESSION_FORMATS` and `labels.sessionFormat`.
- `src/lib/speakers.functions.ts`: add `roundtable` to the session-format enum and `profile_notes` to `SpeakerInput`.
- `src/components/dialogs/SpeakerFormDialog.tsx`: add the Profile notes / bio textarea (larger, with helper text) above Notes; roundtable comes through the shared format list.
- `src/components/speakers/TopicIdeasCard.tsx` (new): card matching the existing dialog sections, uses `useServerFn` + `useServerFn`-driven mutation, `StatusPill` for rank and the overlap flag, toast on error, invalidates speaker queries.
- `src/components/dialogs/SpeakerDetailDialog.tsx`: render the card in the right column under Contact/Session, plus the Profile notes text when present.
