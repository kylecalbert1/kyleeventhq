
## Scope

Seven-item batch. I'll execute them in dependency order (theme first, then structural moves, then UX polish) so nothing gets restyled twice.

### 1. "Compose email" button (Sourcing + per-event Tito page)
Add a second button next to "Draft outreach" on `speaker-sourcing.tsx` and `tito.$slug.tsx`. It opens `BulkEmailDialog` directly with the selected attendees — no AI step. Enabled when ≥1 selected. Uses the existing template/`{{firstName}}`/per-row Send flow already in `BulkEmailDialog`.

### 2. Split sourced candidates out of Speaker pipeline
In `speakers.tsx`, partition the list:
- **Main pipeline feed** (current single-column layout): only speakers whose `status` is one of `contacted / responded / confirmed / declined` **and** who are not "sourced-but-untouched" (i.e. exclude rows where `source = 'tito'` AND status is still the default `contacted` AND `last_message_at IS NULL` — the state a freshly tagged candidate lands in).
- **New "Potential speakers" collapsible section** above or below the pipeline, grouped by event with headers like `Potential speakers — <event name>`. Each row uses the same card but with a lighter treatment and a "Move to pipeline" affordance (set `last_message_at = now()` or flip a flag so it graduates into the main feed).

Assumption to confirm: the graduation trigger is "user actually sends/records first outreach" — I'll use `last_message_at IS NOT NULL` as the signal, since that's already what other views key off. If you'd rather have an explicit "Move to pipeline" button that just marks it, that's a one-line change.

### 3. Theme + event detail restructure
**3a. Theme (site-wide).** Update `src/styles.css` design tokens only — no per-component rewrites:
- `--background`: soft light gray (was likely white)
- Card surface stays white with `--shadow-soft` (subtle) and rounded-xl
- Add semantic pill tokens: `--pill-amber`, `--pill-green`, `--pill-purple`, `--pill-red` (bg + fg pairs) and expose as `.pill-amber` etc. utilities via `@utility`
- Add `--accent-bar` gradient for the thin colored bar under section headers
- Keep current font stack unless you want a specific swap (say the word and I'll wire Inter Tight or similar)

Because `StatusPill`, cards, and shells already read from tokens, the visual shift propagates without touching each component. I'll spot-fix any hardcoded `bg-white` / `bg-slate-50` I find that fights the new page bg.

**3b. Event detail page (`events.$eventId.tsx`) — flatten.**
Replace the tab interface with a single scrollable page:
- **Header**: event name, date, venue, owner
- **Accent bar** (thin colored strip)
- **Action row**: Edit Event, Sync from Tito, Add Speaker, Export CSV (keep the buttons that already exist; drop ones we don't have backing for rather than stubbing)
- **Stat pills**: registered / confirmed speakers / banners live / etc. using the new pill tokens
- **Speakers section** rendered directly (most-used, no click needed)
- **Banners**, **Website**, **Kickoff & Washup** as lighter-weight sections stacked below
- **Outreach** and **Agenda** are removed from this page (see item 7)

### 4. Two-CSV company filter
Replace the single upload + include/exclude toggle in `CompaniesCsvPanel` with two side-by-side slots:
- **Include list** upload (only these)
- **Exclude list** upload (never these)
Each shows filename, count, clear button. Both applied together when both loaded. Backend `Filters` schema already has `companies_include` / `companies_exclude` — just wire both from the UI.

### 5. Rename "Speaker Sourcing" → "Speaker Prospecting"
- Nav link label in `AppShell.tsx`
- Page `<h1>` and any breadcrumbs ("Back to Speaker Sourcing" on `tito.$slug.tsx`)
- Route path stays `/speaker-sourcing` to avoid breaking bookmarks (URL rename is unnecessary risk; label change achieves the disambiguation goal). If you want the URL changed too, tell me and I'll add a redirect.

### 6. Speaker pipeline filter cleanup
In `speakers.tsx`, keep visible: Search box, Event picker, Business line (AIAI/CSC).
Move into "More filters" collapsible: Sort, Channels, Attention, "Bio & headshot missing".

### 7. Promote Outreach & Agenda to top-level pages
- New route `src/routes/_authenticated/outreach-templates.tsx` (renaming to avoid collision with existing `/outreach` weekly outreach page — I'll confirm which is which before picking the final path). Wraps `OutreachHub` with an event picker at the top.
- New route `src/routes/_authenticated/agenda.tsx`. Wraps `AgendaTab` with an event picker at the top.
- Add both to `AppShell.tsx` nav under "Event delivery".
- Remove the "Outreach" and "Agenda" tabs from the event detail page (already gone as part of item 3b flattening).

Assumption to confirm: the existing `/outreach` nav link ("Weekly Outreach" → `outreach.tsx`) is a *different* feature (the weekly outreach hub). I'll place the new one at `/outreach-templates` or `/speaker-outreach` — will pick the clearer of the two once I read `OutreachHub.tsx`.

## Order of execution

1. Theme tokens (3a) — everything downstream inherits.
2. New top-level Outreach + Agenda pages (7) — needed before flattening event page.
3. Flatten event detail (3b).
4. Speakers page: partition tagged candidates (2) + collapse filters (6).
5. Sourcing page: Compose button (1), two-CSV panel (4), rename to Prospecting (5).
6. `tito.$slug.tsx`: Compose button (1) + breadcrumb rename (5).

## What I won't do without a signal from you

- Change the URL path for Sourcing → Prospecting (label change only, per above)
- Add net-new stats to the event page that don't have data behind them (I'll use what's already queried)
- Introduce a new font family (current stack stays unless you name one)

Confirm and I'll execute end-to-end and give you the per-item summary at the finish.
