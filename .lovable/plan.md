## Event Ops Command Center — Phase 1

Internal event ops tracker for a B2B events producer. Single-user auth, manual entry only, all data in Lovable Cloud (Postgres + Auth). No external integrations yet.

### Assumptions (flag if wrong)
- Single shared login is fine as regular email/password auth (one seeded user). No roles, no multi-tenant.
- "Owner" and "assignee" are free-text strings (no separate team-members table yet).
- Sponsors don't need a full pipeline in Phase 1 — they show up only in the Banner tracker and on the event detail page.
- Speaker Kanban's "Banner Sent" and "Bio/Headshot In" columns are derived from the `banner_status` and `bio_received`/`headshot_received` fields, not separate statuses. Speakers appear in the column matching their furthest-progressed state.
- "Days to launch" = `launch_date - today`. Website status pill on the home grid mirrors the event's latest website-task stage (or explicit `website_status`).
- Bulk reschedule of website tasks isn't a Phase 1 screen; the `protected` flag exists on the row and the Website Kanban shows the lock + confirms on drag. Bulk operations = Speaker "mark banner sent" only.

### Backend (Lovable Cloud)

Enable Lovable Cloud, then create these tables (all with RLS + grants to `authenticated`):
- `events` — code, name, business_line (enum: AIAI/CSC), format (enum: in_person/virtual), event_date, venue, kickoff_date, washup_date, website_status (enum: draft/proof_1/proof_2/signed_off/live), launch_date, owner
- `speakers` — event_id FK, name, company, title, status (enum: contacted/responded/confirmed/declined), session_title, session_format (enum: keynote/panel/workshop/fireside), banner_status (enum: not_started/created/sent/confirmed_live), bio_received bool, headshot_received bool, linkedin_url, notes, dropbox_link, linkedin_post_confirmed bool
- `sponsors` — event_id FK, name, spend_tier, session_type, banner_status (same enum), dropbox_link, linkedin_post_confirmed bool
- `website_tasks` — event_id FK, task_type (enum: proof_1/proof_2/final_signoff/launch/audit/refresh), status (enum: draft/proof_1/proof_2/signed_off/live), due_date, assignee, protected bool
- `event_milestones` — event_id FK, type (enum: kickoff/washup), scheduled_date, doc_link, recap_link, status (enum: scheduled/done), key_action_items text

All FKs `ON DELETE CASCADE`. RLS: `authenticated` can do everything (single-user app). Timestamps + `updated_at` triggers.

### Auth
- Email/password only (single seeded internal user; user creates it via signup on first load).
- `_authenticated/` layout gates the whole app. `/auth` is the only public route.
- Signup disabled visually after first user? — skip; just leave standard email/password with a note. User can lock down via Cloud settings later.

### Routes
```
src/routes/
  __root.tsx                          (existing, refresh metadata)
  auth.tsx                            (login/signup)
  _authenticated/
    route.tsx                         (managed gate)
    index.tsx                         (Event grid — home)
    events.$eventId.tsx               (Event detail w/ tabs)
    speakers.tsx                      (Speaker Kanban)
    banners.tsx                       (Banner tracker table)
    website.tsx                       (Website Kanban)
    milestones.tsx                    (Kickoff & Washup list)
```

Shared shell (sidebar nav + top bar) inside `_authenticated/route.tsx`.

### Server functions (all `requireSupabaseAuth`)
- `src/lib/events.functions.ts` — list, get, create, update, delete + derived summary (speaker counts, banner counts, milestone status) for the home grid in one query.
- `src/lib/speakers.functions.ts` — CRUD + bulk `markBannersSent(ids[])`.
- `src/lib/sponsors.functions.ts` — CRUD.
- `src/lib/website-tasks.functions.ts` — CRUD + `bulkUpdateStatus(ids[], status, confirmProtected)`.
- `src/lib/milestones.functions.ts` — CRUD.

Client uses TanStack Query (`useSuspenseQuery` in components, `ensureQueryData` in loaders under `_authenticated/`).

### UI / Design
- Clean modern admin aesthetic: neutral surfaces, one accent color, generous spacing, dense-but-readable tables.
- Semantic tokens in `src/styles.css`: status color tokens (`--status-draft`, `--status-in-progress`, `--status-done`, `--status-blocked`, `--status-live`) exposed as Tailwind utilities + a `<StatusPill status="...">` component that maps every domain enum to one of them.
- Cards: subtle border + shadow, hover lift.
- Kanban columns: fixed-width, scroll-y, drag with `@dnd-kit/core`.
- Confirmation dialog (shadcn `AlertDialog`) on protected-card drag.
- Sidebar nav with icons (lucide): Grid, Users, Image, Globe, Calendar.

### Components
- `StatusPill`, `EventCard`, `KanbanBoard` (generic), `SpeakerCard`, `WebsiteCard`, `BannerRow`, `MilestoneRow`, `EventFormDialog`, `SpeakerFormDialog`, `SponsorFormDialog`, `WebsiteTaskFormDialog`, `MilestoneFormDialog`, `AppShell` (sidebar + header + outlet).

### Out of scope for Phase 1
- Real-time collaboration, activity log, notifications, email, exports, roles, multi-workspace, mobile-optimized layouts (desktop-first), calendar integrations, Dropbox API, LinkedIn scraping.

### Sequence
1. Enable Lovable Cloud + create migration for all tables/enums/RLS.
2. Add auth page + `_authenticated` layout + `AppShell`.
3. Build design tokens, `StatusPill`, shared form dialogs.
4. Home event grid + event CRUD.
5. Event detail with tabs (reuses speaker/sponsor/website/milestone components).
6. Speaker Kanban with bulk banner-sent action.
7. Banner tracker table.
8. Website Kanban with protected-lock confirmation.
9. Kickoff/Washup list.
10. Polish: empty states, loading, error boundaries per route.

Ready to proceed on approval.
