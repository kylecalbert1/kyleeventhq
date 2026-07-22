import { createFileRoute } from "@tanstack/react-router";

// Nightly Asana milestone sync. Replaces the external daily job.
// Called by pg_cron at 07:00 UTC.
//
// Auth: apikey header must equal SUPABASE_PUBLISHABLE_KEY.
//
// Uses the Lovable connector gateway (Kyle's Asana connection), not a
// separate PAT — mirrors the Gmail/Calendar pattern in sync.functions.ts.
//
// For each event with asana_project_gid, pulls tasks from that project
// (never search Asana by event name — shared workspace, wrong-match risk)
// and updates kickoff_date / launch_date only when the value differs and
// the new value is non-null. Never overwrites a real date with null.

const ASANA_GATEWAY = "https://connector-gateway.lovable.dev/asana";

export const Route = createFileRoute("/api/public/hooks/asana-nightly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const creds = getAsanaGatewayCreds();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (!creds) {
          await stampHealth(supabaseAdmin, "asana", false, "Asana connector not linked");
          return Response.json(
            { ok: false, error: "Asana connector not linked" },
            { status: 500 },
          );
        }

        const result = await runAsanaSync(supabaseAdmin, creds);
        await stampHealth(
          supabaseAdmin,
          "asana",
          result.failures === 0,
          `${result.updated} events updated, ${result.checked} checked, ${result.failures} failed`,
        );
        return Response.json({ ok: true, ...result });
      },
    },
  },
});

export type AsanaCreds = { lovableKey: string; asanaKey: string };

export function getAsanaGatewayCreds(): AsanaCreds | null {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const asanaKey = process.env.ASANA_API_KEY;
  if (!lovableKey || !asanaKey) return null;
  return { lovableKey, asanaKey };
}

// Exported so the "Run now" server function can reuse it.
export async function runAsanaSync(admin: any, creds: AsanaCreds) {
  const { data: events, error } = await admin
    .from("events")
    .select("id, format, asana_project_gid, kickoff_date, launch_date")
    .not("asana_project_gid", "is", null);
  if (error) throw new Error(error.message);

  let checked = 0;
  let updated = 0;
  let failures = 0;
  const details: Array<{ event_id: string; ok: boolean; changes?: string[]; error?: string }> = [];

  for (const ev of events ?? []) {
    checked++;
    try {
      const tasks = await fetchAsanaTasks(ev.asana_project_gid as string, creds);
      const kickoffDue = findTaskDue(tasks, (n) => n.includes("run kick off meeting"));
      const launchExact = findTaskDue(tasks, (n) => n.includes("launch day"));
      const launchFallback =
        (ev.format as string) === "virtual"
          ? findTaskDue(tasks, (n) => n.includes("launch") && n.includes("to members"))
          : null;
      const launchDue = launchExact ?? launchFallback;

      const patch: Record<string, string> = {};
      const changes: string[] = [];

      // Rule: only update when different AND new value non-null. Never null out.
      if (kickoffDue && kickoffDue !== ev.kickoff_date) {
        patch.kickoff_date = kickoffDue;
        changes.push(`kickoff: ${ev.kickoff_date ?? "∅"} → ${kickoffDue}`);
      }
      if (launchDue && launchDue !== ev.launch_date) {
        patch.launch_date = launchDue;
        changes.push(`launch: ${ev.launch_date ?? "∅"} → ${launchDue}`);
      }

      patch.asana_last_synced_at = new Date().toISOString();
      const { error: uErr } = await admin.from("events").update(patch).eq("id", ev.id);
      if (uErr) throw new Error(uErr.message);

      if (changes.length) updated++;
      details.push({ event_id: ev.id, ok: true, changes });
    } catch (err: any) {
      failures++;
      console.error("[asana-nightly] failed for event", ev.id, err);
      details.push({ event_id: ev.id, ok: false, error: err?.message ?? String(err) });
    }
  }

  return { checked, updated, failures, details };
}
  const { data: events, error } = await admin
    .from("events")
    .select("id, format, asana_project_gid, kickoff_date, launch_date")
    .not("asana_project_gid", "is", null);
  if (error) throw new Error(error.message);

  let checked = 0;
  let updated = 0;
  let failures = 0;
  const details: Array<{ event_id: string; ok: boolean; changes?: string[]; error?: string }> = [];

  for (const ev of events ?? []) {
    checked++;
    try {
      const tasks = await fetchAsanaTasks(ev.asana_project_gid as string, pat);
      const kickoffDue = findTaskDue(tasks, (n) => n.includes("run kick off meeting"));
      const launchExact = findTaskDue(tasks, (n) => n.includes("launch day"));
      const launchFallback =
        (ev.format as string) === "virtual"
          ? findTaskDue(tasks, (n) => n.includes("launch") && n.includes("to members"))
          : null;
      const launchDue = launchExact ?? launchFallback;

      const patch: Record<string, string> = {};
      const changes: string[] = [];

      // Rule: only update when different AND new value non-null. Never null out.
      if (kickoffDue && kickoffDue !== ev.kickoff_date) {
        patch.kickoff_date = kickoffDue;
        changes.push(`kickoff: ${ev.kickoff_date ?? "∅"} → ${kickoffDue}`);
      }
      if (launchDue && launchDue !== ev.launch_date) {
        patch.launch_date = launchDue;
        changes.push(`launch: ${ev.launch_date ?? "∅"} → ${launchDue}`);
      }

      patch.asana_last_synced_at = new Date().toISOString();
      const { error: uErr } = await admin.from("events").update(patch).eq("id", ev.id);
      if (uErr) throw new Error(uErr.message);

      if (changes.length) updated++;
      details.push({ event_id: ev.id, ok: true, changes });
    } catch (err: any) {
      failures++;
      console.error("[asana-nightly] failed for event", ev.id, err);
      details.push({ event_id: ev.id, ok: false, error: err?.message ?? String(err) });
    }
  }

  return { checked, updated, failures, details };
}

type AsanaTask = {
  gid: string;
  name: string;
  due_on: string | null;
  completed: boolean;
  resource_subtype?: string;
};

async function fetchAsanaTasks(projectGid: string, creds: AsanaCreds): Promise<AsanaTask[]> {
  const out: AsanaTask[] = [];
  let offset: string | undefined = undefined;
  for (let page = 0; page < 20; page++) {
    const url = new URL(`${ASANA_GATEWAY}/projects/${projectGid}/tasks`);
    url.searchParams.set("opt_fields", "name,due_on,completed,resource_subtype");
    url.searchParams.set("limit", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${creds.lovableKey}`,
        "X-Connection-Api-Key": creds.asanaKey,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Asana ${res.status}: ${body.slice(0, 200)}`);
    }
    const body = (await res.json()) as {
      data?: AsanaTask[];
      next_page?: { offset?: string } | null;
    };
    out.push(...(body.data ?? []));
    offset = body.next_page?.offset;
    if (!offset) break;
  }
  return out;
}

// Lowercase, drop emoji + punctuation, collapse whitespace. Makes
// "🚀 Run Kick-off Meeting" match "run kick off meeting".
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findTaskDue(
  tasks: AsanaTask[],
  match: (normalizedName: string) => boolean,
): string | null {
  for (const t of tasks) {
    if (t.resource_subtype === "section") continue;
    const n = normalizeName(t.name ?? "");
    if (match(n) && t.due_on) return t.due_on;
  }
  return null;
}

async function stampHealth(admin: any, kind: string, ok: boolean, note: string) {
  await admin.from("sync_health").upsert(
    { kind, last_run_at: new Date().toISOString(), ok, note, updated_at: new Date().toISOString() },
    { onConflict: "kind" },
  );
}
