import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ASANA_GATEWAY = "https://connector-gateway.lovable.dev/asana";

const TASK_NAMES = {
  buddy_proof: "1st website proof - assign to your CO proofer (read description!)",
  marketer_proof: "2nd website proof for launch - by marketing - read description!",
  amendments_actioned: "All amendments from marketing proof actioned",
  final_signoff:
    "Final website sign off by your line manager - pre-requisite for launch (read task description)",
} as const;

export type ProofingStageKey = keyof typeof TASK_NAMES;
export const PROOFING_STAGES: ProofingStageKey[] = [
  "buddy_proof",
  "marketer_proof",
  "amendments_actioned",
  "final_signoff",
];

export const STAGE_LABELS: Record<ProofingStageKey, string> = {
  buddy_proof: "1st Proof (buddy)",
  marketer_proof: "2nd Proof (marketing)",
  amendments_actioned: "Amendments actioned",
  final_signoff: "Final sign-off",
};

function normalize(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

async function fetchAsanaDues(projectGid: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const asanaKey = process.env.ASANA_API_KEY;
  const empty: Record<ProofingStageKey, string | null> = {
    buddy_proof: null,
    marketer_proof: null,
    amendments_actioned: null,
    final_signoff: null,
  };
  if (!lovableKey || !asanaKey) return empty;

  const url = new URL(`${ASANA_GATEWAY}/tasks`);
  url.searchParams.set("project", projectGid);
  url.searchParams.set("limit", "100");
  url.searchParams.set("opt_fields", "gid,name,due_on,completed");
  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": asanaKey,
      },
    });
    if (!res.ok) return empty;
    const body = (await res.json()) as {
      data?: Array<{ name: string; due_on: string | null }>;
    };
    const targets: Record<string, ProofingStageKey> = {};
    for (const [k, name] of Object.entries(TASK_NAMES)) {
      targets[normalize(name)] = k as ProofingStageKey;
    }
    const out = { ...empty };
    for (const t of body.data ?? []) {
      const key = targets[normalize(t.name)];
      if (key) out[key] = t.due_on;
    }
    return out;
  } catch {
    return empty;
  }
}

export function currentStage(task: {
  buddy_proof_done: boolean | null;
  marketer_proof_done: boolean | null;
  amendments_actioned_done: boolean | null;
  final_signoff_done: boolean | null;
}): ProofingStageKey | "completed" {
  if (!task.buddy_proof_done) return "buddy_proof";
  if (!task.marketer_proof_done) return "marketer_proof";
  if (!task.amendments_actioned_done) return "amendments_actioned";
  if (!task.final_signoff_done) return "final_signoff";
  return "completed";
}

export const listProofingBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: events, error: evErr } = await context.supabase
      .from("events")
      .select(
        "id, code, name, business_line, event_date, asana_project_gid, website_status",
      )
      .not("asana_project_gid", "is", null)
      .order("event_date", { ascending: true, nullsFirst: false });
    if (evErr) throw new Error(evErr.message);

    const eventIds = (events ?? []).map((e) => e.id);
    const { data: tasksRaw, error: tErr } = await context.supabase
      .from("website_tasks")
      .select("*")
      .in("event_id", eventIds.length ? eventIds : ["00000000-0000-0000-0000-000000000000"]);
    if (tErr) throw new Error(tErr.message);

    // one task per event: pick most-recent updated_at
    const byEvent = new Map<string, any>();
    for (const t of tasksRaw ?? []) {
      const cur = byEvent.get(t.event_id);
      if (!cur || (t.updated_at ?? "") > (cur.updated_at ?? "")) byEvent.set(t.event_id, t);
    }

    // auto-create missing tasks
    const toCreate = (events ?? [])
      .filter((e) => !byEvent.has(e.id))
      .map((e) => ({
        event_id: e.id,
        status: "draft" as const,
        title: "Website proofing",
        protected: false,
      }));
    if (toCreate.length > 0) {
      const { data: created, error: cErr } = await context.supabase
        .from("website_tasks")
        .insert(toCreate)
        .select("*");
      if (cErr) throw new Error(cErr.message);
      for (const t of created ?? []) byEvent.set(t.event_id, t);
    }

    // fetch Asana dues in parallel
    const dueEntries = await Promise.all(
      (events ?? []).map(async (e) => [e.id, await fetchAsanaDues(e.asana_project_gid!)] as const),
    );
    const duesByEvent = new Map(dueEntries);

    return (events ?? []).map((e) => ({
      event: e,
      task: byEvent.get(e.id),
      dues: duesByEvent.get(e.id) ?? {
        buddy_proof: null,
        marketer_proof: null,
        amendments_actioned: null,
        final_signoff: null,
      },
    }));
  });

export const moveProofingStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        task_id: z.string().uuid(),
        target_stage: z.enum([
          "buddy_proof",
          "marketer_proof",
          "amendments_actioned",
          "final_signoff",
          "completed",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const stages: ProofingStageKey[] = [
      "buddy_proof",
      "marketer_proof",
      "amendments_actioned",
      "final_signoff",
    ];
    const targetIdx =
      data.target_stage === "completed" ? stages.length : stages.indexOf(data.target_stage);

    // Get existing task to preserve existing done dates
    const { data: existing, error: exErr } = await context.supabase
      .from("website_tasks")
      .select("*")
      .eq("id", data.task_id)
      .single();
    if (exErr) throw new Error(exErr.message);

    const patch: Record<string, any> = {};
    stages.forEach((s, i) => {
      const doneKey = `${s}_done`;
      const dateKey = `${s}_date`;
      if (i < targetIdx) {
        patch[doneKey] = true;
        if (!existing[dateKey]) patch[dateKey] = today;
      } else {
        patch[doneKey] = false;
      }
    });
    // Map to overall status
    if (data.target_stage === "completed") patch.status = "signed_off";
    else if (data.target_stage === "buddy_proof") patch.status = "draft";
    else if (data.target_stage === "marketer_proof") patch.status = "proof_1";
    else if (data.target_stage === "amendments_actioned") patch.status = "proof_2";
    else if (data.target_stage === "final_signoff") patch.status = "amendments";

    const { data: row, error } = await context.supabase
      .from("website_tasks")
      .update(patch)
      .eq("id", data.task_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
