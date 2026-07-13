import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ASANA_GATEWAY = "https://connector-gateway.lovable.dev/asana";

// Exact task names in each event's Asana Timeline project.
const TASK_NAMES = {
  buddy_proof: "1st website proof - assign to your CO proofer (read description!)",
  marketer_proof: "2nd website proof for launch - by marketing - read description!",
  amendments_actioned: "All amendments from marketing proof actioned",
  final_signoff:
    "Final website sign off by your line manager - pre-requisite for launch (read task description)",
} as const;

export type ProofingStageKey = keyof typeof TASK_NAMES;

export type ProofingDueDates = Record<ProofingStageKey, string | null>;

function normalize(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

async function fetchProjectTasks(projectGid: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const asanaKey = process.env.ASANA_API_KEY;
  if (!lovableKey || !asanaKey) throw new Error("Asana not connected");

  const url = new URL(`${ASANA_GATEWAY}/tasks`);
  url.searchParams.set("project", projectGid);
  url.searchParams.set("limit", "100");
  url.searchParams.set("opt_fields", "gid,name,due_on,completed");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": asanaKey,
    },
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`Asana tasks failed [${res.status}]: ${t}`);
    throw new Error(`Asana request failed (${res.status})`);
  }
  return (await res.json()) as {
    data?: Array<{ gid: string; name: string; due_on: string | null; completed: boolean }>;
  };
}

export const getAsanaProofingDueDates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ev, error } = await context.supabase
      .from("events")
      .select("asana_project_gid")
      .eq("id", data.event_id)
      .single();
    if (error) throw new Error(error.message);

    const empty: ProofingDueDates = {
      buddy_proof: null,
      marketer_proof: null,
      amendments_actioned: null,
      final_signoff: null,
    };

    if (!ev?.asana_project_gid) {
      return { connected: false as const, project_gid: null, dues: empty };
    }
    if (!process.env.LOVABLE_API_KEY || !process.env.ASANA_API_KEY) {
      return { connected: false as const, project_gid: ev.asana_project_gid, dues: empty };
    }

    try {
      const body = await fetchProjectTasks(ev.asana_project_gid);
      const targets: Record<string, ProofingStageKey> = {};
      for (const [k, name] of Object.entries(TASK_NAMES)) {
        targets[normalize(name)] = k as ProofingStageKey;
      }
      const dues: ProofingDueDates = { ...empty };
      for (const t of body.data ?? []) {
        const key = targets[normalize(t.name)];
        if (key) dues[key] = t.due_on;
      }
      return { connected: true as const, project_gid: ev.asana_project_gid, dues };
    } catch (e) {
      console.error("Asana proofing fetch failed", e);
      return { connected: false as const, project_gid: ev.asana_project_gid, dues: empty };
    }
  });
