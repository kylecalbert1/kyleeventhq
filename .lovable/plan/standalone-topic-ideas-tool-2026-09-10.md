# Standalone Topic Ideas tool

Turn topic ideas into a scratchpad tool Kyle can use before anyone is added as a speaker, while keeping the existing per-speaker card working.

## What changes for Kyle

- New **Topic ideas** page in the main nav, usable with nothing tracked yet.
- On it: a big box to paste LinkedIn profile text, a summit series picker, an event picker (choose a tracked event or just type a name), a slot format picker, and an optional box for topics already being pitched to others.
- **Generate** returns the same three ranked ideas plus fit and overlap notes as the speaker card.
- Nothing is saved unless he clicks **Save as speaker**, which creates a real speaker record carrying the profile text, event, format and generated topics.
- The wording of the ideas now adapts to the summit series chosen, instead of always assuming a senior customer-success executive room.

## Summit series calibration

Added to the system prompt per selection:
- CCO Summit: senior executive peers, never career-journey topics.
- Customer Success Summit: mixed-seniority practitioners, career development is fine.
- AI for Customer Support Summit: narrow support-ops functional audience.
- Generative AI Summit / Agentic AI Summit: technical engineers and AI execs; a CS/CX leadership background is only relevant with a real technical angle.

## Technical notes

- `src/lib/topic-ideas.functions.ts`: extract `runTopicIdeas(input)` core taking `{ profile, event_name, event_context, series, session_format, other_topics }` and returning the existing result shape. `generateTopicIdeas` (speaker-linked) keeps its signature and calls the core with speaker/event data loaded as today.
- New `generateTopicIdeasAdhoc` server fn: `requireSupabaseAuth`, zod input of the plain fields, optional `event_id` used only to look up event context and sibling session titles; returns the result without persisting.
- New `SUMMIT_SERIES` list + labels in `src/lib/status.ts`.
- New route `src/routes/_authenticated/topic-ideas.tsx` plus `src/components/speakers/TopicIdeasResult.tsx` extracted from `TopicIdeasCard.tsx` so both surfaces render results identically (pills, cards, amber overlap banner).
- Save as speaker calls existing `createSpeaker` with `profile_notes`, `session_format`, `event_id`, `status: "new"`, then writes `topic_ideas` via `updateSpeaker`. Disabled unless a tracked event is selected, since speakers require an event.
- Nav entry added to `NAV_PRIMARY` in `AppShell.tsx` (Lightbulb icon).
- No database migration needed.
