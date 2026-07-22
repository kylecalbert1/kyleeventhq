## Goal

Kill the "my laptop must be open" problem. Tito stays fresh via webhooks + a nightly full reconcile. Asana milestones sync themselves every morning. A Settings "Sync health" card shows if any of it drifts.

---

## 1. Tito — real-time via webhook

**New public route** `src/routes/api/public/hooks/tito-webhook.ts`
- POST handler, no auth (public prefix).
- If `TITO_WEBHOOK_SECRET` is set, verify Tito's `X-Webhook-Signature` (HMAC-SHA256 of raw body). Timing-safe compare. Reject 401 otherwise.
- Parse payload; branch on event name:
  - `ticket.created` / `ticket.updated` / `ticket.completed` / `registration.finished` → upsert into `tito_tickets` using the exact same shape and `onConflict: 'tito_ticket_id'` used by manual sync (extracted into a shared helper).
- Update `tito_events.last_webhook_at = now()` for the event slug so Settings can show "last received".
- Return 200 fast; errors logged but non-throwing so Tito doesn't retry-storm.

**Refactor**: extract the ticket-row builder from `src/lib/tito.functions.ts` into `src/lib/tito-shared.ts` (client-safe types + row mapper, no DB import) so both the manual sync and the webhook use one implementation.

**Schema (migration)**
- `tito_events.last_webhook_at timestamptz`
- New `sync_health` table (see §3) — single source of truth for sync stamps other than Tito's own tables.

## 2. Tito — nightly full reconcile

**New public route** `src/routes/api/public/hooks/tito-nightly.ts`
- POST, `apikey` header check against `SUPABASE_PUBLISHABLE_KEY`.
- For every `events` row with `tito_slug` set, run the same logic as `syncEventFromTito` (releases + tickets, `view=extended`, mapped events only), updating `last_synced_at` and `tito_releases`.
- Writes `sync_health` row `{ kind: 'tito_full', last_run_at, ok, note }`.

**pg_cron** (via `supabase--insert`, not migration): daily at `0 3 * * *` calling that route with empty body.

## 3. Asana — nightly milestone sync

**Storage**: `ASANA_PAT` as a Supabase secret. Settings page has a "Save Asana token" input that calls a `saveAsanaToken` server function (admin role check → writes secret via… note: Supabase secret writes aren't runtime — we can't `set_secret` from user code). **Practical path**: instruct the user to paste the PAT into Project Settings → Secrets as `ASANA_PAT`, exactly the same UX as `TITO_API_TOKEN`. Settings shows whether the secret is present (via a server fn that returns `!!process.env.ASANA_PAT`), not a save input.

**Schema (migration)**
- `events.asana_last_synced_at timestamptz`

**New public route** `src/routes/api/public/hooks/asana-nightly.ts`
- Auth: `apikey` header check.
- For each event with `asana_project_gid`:
  - `GET https://app.asana.com/api/1.0/projects/{gid}/tasks?opt_fields=name,due_on,completed,resource_subtype&limit=100` (paginate on `next_page.offset`), `Authorization: Bearer $ASANA_PAT`.
  - Normalize names: lowercase, strip emoji + non-alphanumerics → spaces.
  - `kickoff` = first task whose normalized name contains `run kick off meeting` (also matches "run kickoff meeting" after normalization).
  - `launch` = task whose normalized name contains `launch day`; fallback for virtual events = normalized name contains both `launch` and `to members`.
  - Compare `due_on` to current `events.kickoff_date` / `events.launch_date`. Update only when different **and new value is non-null**. Never null-out an existing date.
  - Wrap per-event in try/catch; failures logged, other events continue.
  - Set `events.asana_last_synced_at = now()` on success.
- Writes `sync_health` row `{ kind: 'asana', last_run_at, ok, note }`.

**pg_cron**: daily at `0 7 * * *`.

**Event page**: under kickoff/launch dates, show "Asana synced Xh ago" pill (reads `asana_last_synced_at`).

## 4. Settings page — Sync health card

Restructure `src/routes/_authenticated/settings.tsx` (or create if missing).

**Sections**
1. **Tito webhook**
   - Copy-to-clipboard URL: `https://project--1b69743f-dcda-484f-a3af-afd5b0f775a7.lovable.app/api/public/hooks/tito-webhook`
   - Instructions: paste into Tito → Settings → Webhooks, subscribe to the 4 events, optionally set a signing secret and store it as `TITO_WEBHOOK_SECRET` in Project Settings → Secrets.
   - "Last webhook received" (max `tito_events.last_webhook_at`) with staleness tone.
2. **Sync health card** (grid of 4)
   - Tito webhook · Tito full reconcile · Asana · Goldcast
   - Each: last-run timestamp, tone chip (green <24h, amber 24–48h, red >48h or never), "Run now" button.
     - Tito full → invokes `runTitoNightly` server fn (same logic as the hook, callable by authenticated user).
     - Asana → invokes `runAsanaNightly` server fn.
     - Goldcast → existing manual sync fn if any (leave stubbed otherwise).
3. **Secret status** (booleans only, never values): `TITO_API_TOKEN`, `TITO_WEBHOOK_SECRET`, `ASANA_PAT`, `GOLDCAST_API_TOKEN`.

**Dashboard banner**: `src/routes/_authenticated/index.tsx` — if any sync_health row's `last_run_at` is >48h old (or missing for enabled integrations), render an amber warning strip at the top linking to `/settings`.

## 5. Schema

```sql
-- Migration
ALTER TABLE tito_events ADD COLUMN IF NOT EXISTS last_webhook_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS asana_last_synced_at timestamptz;

CREATE TABLE public.sync_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL UNIQUE,          -- 'tito_full' | 'asana' | 'goldcast'
  last_run_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL DEFAULT true,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sync_health TO authenticated;
GRANT ALL ON public.sync_health TO service_role;
ALTER TABLE public.sync_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read sync_health" ON public.sync_health
  FOR SELECT TO authenticated USING (true);
```

## 6. Files touched

**New**
- `src/lib/tito-shared.ts` — ticket row mapper, name normalizer.
- `src/routes/api/public/hooks/tito-webhook.ts`
- `src/routes/api/public/hooks/tito-nightly.ts`
- `src/routes/api/public/hooks/asana-nightly.ts`
- `src/lib/sync-health.functions.ts` — read health, run-now wrappers.
- `src/routes/_authenticated/settings.tsx` (rebuild).

**Edited**
- `src/lib/tito.functions.ts` — use shared mapper.
- `src/lib/asana.functions.ts` — reuse Asana fetch logic in nightly hook.
- `src/routes/_authenticated/events.$eventId.tsx` — Asana synced pill.
- `src/routes/_authenticated/index.tsx` — staleness banner.
- `src/components/AppShell.tsx` — Settings nav entry if missing.

## 7. Rules honored

- Manual "Sync from Tito" and per-event "Sync" buttons stay.
- Only `asana_project_gid` used for Asana matching; no name search.
- Never overwrite an existing kickoff/launch date with null.
- Secrets stay in Supabase secrets — no DB rows for `ASANA_PAT` or `TITO_WEBHOOK_SECRET`.
- `/api/public/*` prefix for external callers; signature/apikey verified in handler.

## 8. Post-deploy checklist (for you)

1. Approve migration.
2. Paste `ASANA_PAT` (Asana profile → Developer console → Personal access tokens) into Project Settings → Secrets.
3. Copy webhook URL from Settings into Tito → Webhooks; optionally set `TITO_WEBHOOK_SECRET`.
4. I'll register the two pg_cron jobs after the routes deploy.
