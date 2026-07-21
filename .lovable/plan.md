
## Approach

Build in three sequenced phases so nothing lands half-wired. Phase 1 is a single approved migration + one data-cleanup pass — everything else depends on it.

## Phase 1 — Schema & data cleanup (one migration + one data pass)

**Migration (schema only):**

- `events.tito_slug text` (nullable, unique). Nullable so virtual events / unmapped events keep working.
- New `tito_releases` table:
  ```
  id uuid pk, event_slug text not null, tito_release_id text not null,
  slug text, title text not null, registration_url text,
  quantity int, tickets_count int, state text,
  created_at, updated_at,
  unique (event_slug, tito_release_id)
  ```
  RLS: `authenticated` full access (matches existing tito_events pattern).
- `tito_tickets` additions: `release_title text`, `release_slug text`, `release_id text` — needed so a ticket can be classified as Speaker Pass / Speaker Guest / delegate without a join. Indexed on `(event_slug, release_slug)`.
- `speakers` additions:
  - `source text default 'manual'` — values: `manual`, `tito`, `copied_from_past`.
  - `source_ticket_id uuid` (fk `tito_tickets(id)` on delete set null) — links speaker → the ticket they were backfilled from.
  - `copied_from_speaker_id uuid` (fk `speakers(id)` on delete set null) — "copy past speaker into new event" chain.
  - Index on `(event_id, source)`.

Note: `speakers.event_id` stays **required**. Prospects always sit under an event in the current model; loosening it is out of scope and would need extensive audit of every speaker query in the app.

**Data pass (via insert tool, after migration lands):**

- Pre-populate `events.tito_slug` for the 6 mappings (CCO-SF-26, AICS-BOS-26, GENAI-BOS-26, CSS-TOR-26, GENAI-LDN-26, AICS-LDN-26).
- Delete broken `tito_event_filters` row with slug `generative -london`.

## Phase 2 — Sync rework (`src/lib/tito.functions.ts`)

- New scope rule: the primary sync path only walks tito_events whose slug appears in `events.tito_slug` (mapped set). The "sync all account events for discovery" path stays available but moves to an explicit "Discover new Tito events" action so ongoing syncs stop hammering the 758 irrelevant events.
- Per mapped event, fetch:
  1. `GET /:account/:slug/releases?view=extended` → upsert into new `tito_releases` (captures `registration_url` from the release's `share_url` / `public_url` field, plus title, quantity, tickets_count, state).
  2. For each release, fetch its tickets (existing path, but now also stamp `release_title/slug/id` onto each ticket row).
- New server fn `syncEventFromTito({ event_id })` for the per-event "Sync" button — syncs only that event's slug + releases + tickets.
- Existing "Sync now" full-account discovery becomes `discoverTitoEvents({ force })` — used rarely, only to find new events to potentially map.
- Add `listReleasesForEvent({ event_slug })` and `getSpeakerAndGuestLinks({ event_slug })` helpers.

## Phase 3 — UI (feature-by-feature)

### 3a. Event settings — Tito mapping picker

- In `EventFormDialog`, add a `SearchableSelect` populated from synced `tito_events` — options default-sorted by future `start_date` first. Shows current mapping + "Clear mapping" button. Hidden when `format === 'virtual'` unless already mapped.

### 3b. Event page — Tito panels (`events.$eventId.tsx`)

New collapsible sections, only rendered when the event has a `tito_slug`:

- **Registration links panel**: Speaker Pass + Speaker Guest links with copy buttons; "all other releases" listed compactly below.
- **Tito breakdown** (Part 6): stat tiles for Confirmed / Target, Speaker Pass count, Speaker Guest count, Delegate count. Each tile is a link that filters the on-page list.
- **Tito reconciliation** (Part 4): three collapsed lists —
  - "Confirmed speakers with no Tito registration" — with per-row copy-link shortcut.
  - "Tito Speaker Pass holders not in tracker" — each with "Add to tracker" that creates a speaker record (source='tito', source_ticket_id=ticket.id) pre-filled from ticket fields.
  - "Likely same person, different email" — surfaced from an in-memory match engine:
    - Primary key: normalized email (lowercase, trim).
    - Fallback: fuzzy name match via a simple normalized-token Jaccard score ≥ 0.75 (handles Rahman/Ishan cases). Confirm button writes `source_ticket_id` linking speaker → ticket so they leave lists a) and b).
  - Small red warning strip listing confirmed speakers with no email at all (unreachable).

### 3c. Speakers page — three sections (Part 5)

Restructure `_authenticated/speakers.tsx` into three collapsible sections per event context:

- **Prospective** — status ∈ {new, contacted, responded, call_scheduled}. Independent bulk select + bulk email.
- **Current** — status = confirmed, event_date ≥ today. Independent bulk select + bulk email.
- **Past** — event_date < today, permanently visible. Shows event name + session title. Row action: "Copy into new event as prospect" → picker → creates new speakers row (status='new', source='copied_from_past', copied_from_speaker_id=old.id, session_title cleared).

Filters: event / company / status apply across sections. Existing filter/history logic stays.

### 3d. Email composer template variables

Extend the existing template renderer to expand:
- `{{speaker_pass_link}}` → registration_url of the release titled "Speaker Pass" for the current event.
- `{{guest_pass_link}}` → registration_url for "Speaker Guest".
- Falls back to empty string with a lint warning when the event has no tito mapping or the release isn't found.

## Files touched

**Created**
- `src/components/events/TitoReconciliationPanel.tsx`
- `src/components/events/TitoRegistrationLinks.tsx`
- `src/components/events/TitoStatsBreakdown.tsx`
- `src/components/speakers/CopyPastSpeakerDialog.tsx`
- `src/lib/tito-matching.ts` (email/name fuzzy matcher — pure, unit-testable)

**Modified**
- `src/lib/tito.functions.ts` — new sync fns, release upsert, per-event scoping
- `src/lib/events.functions.ts` — accept tito_slug in patch
- `src/lib/speakers.functions.ts` — accept source/source_ticket_id/copied_from_speaker_id; add `copySpeakerToEvent` server fn
- `src/lib/email.functions.ts` (or wherever the template renderer lives) — new variables
- `src/components/dialogs/EventFormDialog.tsx` — Tito mapping picker
- `src/routes/_authenticated/events.$eventId.tsx` — mount new panels + Tito breakdown filter
- `src/routes/_authenticated/speakers.tsx` — 3-section layout, past speakers visible, copy action

**Untouched** (deliberately)
- Agenda builder, website tasks, reply-needed queue, banners page — no functional changes.
- Existing speaker records — additive columns only, no deletion or field rewrites.

## Verification

After each phase:
- Phase 1: `select tito_slug from events where code in (…)` returns the 6 mappings; `select count(*) from tito_event_filters where slug like '% %'` = 0.
- Phase 2: invoking `syncEventFromTito` for GENAI-BOS-26 populates `tito_releases` with Speaker Pass + Speaker Guest rows carrying non-null `registration_url`, and its tickets carry `release_title`.
- Phase 3: reconciliation surfaces Rahman/Ishan under "likely same person" (not in lists a/b); Speakers page shows a Past section that would otherwise be empty today.

## Order of execution

1. Migration (needs your approval).
2. Data cleanup + mappings pass.
3. Sync fn rework + per-event Sync wired to the button on Event pages.
4. Reconciliation + registration links + breakdown UI on Event page.
5. Speakers page 3-section restructure + past-speaker copy flow.
6. Template variable expansion in composer.

If you're happy with this shape, I'll ship the migration first and then execute 3→6 without further check-ins unless something surprises me in the Tito API response shape.
