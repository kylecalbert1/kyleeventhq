# Punch list plan

Sequenced by dependency, not by list order. Quick wins first, then agenda work, then Asana (which needs your input to link).

## 1. Nav + dashboard cleanup (items 4, 5)
- Remove "Banners" from left sidebar under Event Delivery (route + underlying data stay, per-event tab stays).
- Remove "Banners Sent x/y" stat card from the main Events dashboard.

## 2. Editable speaker target per event (item 6)
- Migration: add `speaker_target int not null default 15` to `events`.
- Expose in Event form dialog (number input).
- Update every "Speakers Confirmed X/Y" surface (dashboard, per-event header, anywhere else) to use `event.speaker_target` as denominator.

## 3. Merge bio + headshot into one status (item 3)
- Migration: add `bio_and_headshot_received boolean not null default false` on `speakers`; backfill = `bio_received AND headshot_received`. Keep the old columns for now (safer, no data loss) but stop reading/writing them from the UI.
- Speaker form dialog: replace the two checkboxes with one "Bio & headshot received".
- Speaker Pipeline cards, per-event Speakers tab, detail dialog, anywhere pills render: single "Bio & headshot" pill (received / missing).

## 4. Agenda read-only running-order view + Edit toggle (item 2)
- Agenda tab shows a clean running-order sheet by default (grouped rows, session-type badges, times, speakers, AV notes) with **Edit** and **Export CSV** buttons top right.
- **Edit** flips to the existing spreadsheet builder with **Save** / **Cancel**.
- New events with no agenda land straight in edit mode.

## 5. Agenda import from .xlsx / .csv / .docx (item 1)
- "Import" button on the Agenda tab, opens a file picker.
- **.xlsx / .csv**: parse client-side with `xlsx` (SheetJS). Expect columns Start / End / Mins / Session Type / Session Title / Speaker(s) / AV Requirements; tolerate reordering + missing columns; map session-type text to enum by fuzzy match.
- **.docx**: parse client-side with `mammoth` → HTML → read first `<table>`. Best-effort; if no table found, show a clear error and suggest xlsx/csv.
- Speaker matching: split the Speaker(s) cell on `,` / `&` / `and`, match each name case-insensitively against existing speakers for this event; matched → `speaker_ids`, unmatched → concatenated into `speaker_extra` text.
- Preview parsed rows in a dialog before committing (so you can spot bad rows), then **Import** replaces the current agenda via the existing bulk-replace server fn.

## 6. Asana proofing sync (item 7)
Asana isn't linked to the workspace yet. Two-step:
- **You**: connect Asana in Lovable → Connectors, then tell me the Asana project (or a section) that holds the website proofing tasks and how you name tasks per stage (e.g. "Buddy proof — CCO SF", or three tasks per event tagged by stage).
- **Me**, once linked: extend the existing Sync run to pull tasks from that project via the connector gateway, match each task to `(event, stage)` by title/tag rule you confirm, and stash `asana_due_date` per stage on `website_tasks`. Website tracker + per-event Website tab render the Asana due date next to each stage chip, read-only, with a "last synced" timestamp. No write-back, no alerts.

If you'd rather I stub this behind a feature flag now and wire it fully once Asana is linked, say so — otherwise I'll do items 1–5 this pass and pause before 6 for the connector + naming rules.

## Out of scope this pass
- Docx generation of the running order (you said CSV is fine).
- Alerting on Asana date drift.
- Any change to banner data model or the per-event Banners tab beyond nav removal.
