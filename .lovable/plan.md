# Persistent AI refinement, Tito pass links, and richer event cards

## What will change

### 1. Keep AI refinement available throughout message editing
- Update the first “Describe a message” dialog to show the generated markdown beside the same rendered preview used in the review dialog.
- Add a “Refine this draft” prompt to the message review dialog. Each refinement will use the latest subject and manually edited body, so manual edits and AI changes can be alternated without losing work.
- Bring the email flow to parity: allow repeated refinement in the initial email drafting dialog, show a rendered email preview, and add refinement directly inside the send dialog using its current subject and edited email body.
- Extend the email AI function with the same optional `current_draft` refinement input already supported by message drafting.

### 2. Show Tito pass links on each event
- Add a compact “Tito pass links” card immediately below the event header/board area.
- Load links with the existing event Tito-links query.
- Show Speaker pass and Guest pass rows with their URL, Copy, and Open controls.
- Keep both rows visible when unavailable and explain that the Tito event/release title needs configuring.

### 3. Add full speaker status counts to event cards
- Centralize the speaker-stage categorization and chip colour definitions so the event page and home cards stay consistent.
- Extend the home page’s per-event counts to include Confirmed, Prospective, In conversation, and Responded.
- For Tito-linked events, also calculate Registered in Tito and Not yet registered from the same reconciliation rule used on event detail pages.
- Preserve all current card information, including date, venue, timing pills, declined count, banner count, and target progress.

## Technical details
- AI refinement will always pass the latest edited subject/body as `current_draft`, not the original generated text.
- The home page will obtain the Tito registration exception IDs needed for linked events without changing speaker records.
- Existing message sending, template saving, and logging behavior will remain unchanged.
- Validate with type checks, the app build signal, and desktop UI interaction checks for both dialog flows and event displays.
