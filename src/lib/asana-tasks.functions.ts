import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Read-only surface for asana_tasks. The nightly sync (asana-nightly.ts) writes.

// Case-insensitive, emoji-stripped patterns of the milestone tasks we track.
export const TRACKED_TASK_PATTERNS: Array<{ key: string; test: (n: string) => boolean; website?: boolean }> = [
  { key: "1st website proof", test: (n) => n.includes("1st website proof") || n.includes("first website proof"), website: true },
  { key: "2nd website proof", test: (n) => n.includes("2nd website proof") || n.includes("second website proof"), website: true },
  { key: "final website sign off", test: (n) => n.includes("final website sign off") || n.includes("final website signoff"), website: true },
  { key: "website sign off", test: (n) => (n.includes("website sign off") || n.includes("website signoff")) && !n.includes("final"), website: true },
  { key: "prepare for kick-off", test: (n) => n.includes("prepare for kick off") || n.includes("prepare for kickoff") },
  { key: "run kick-off meeting", test: (n) => n.includes("run kick off meeting") || n.includes("run kickoff meeting") },
  { key: "launch day", test: (n) => n.includes("launch day") },
];

export function normalizeAsanaName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchTrackedPattern(name: string) {
  const n = normalizeAsanaName(name);
  return TRACKED_TASK_PATTERNS.find((p) => p.test(n)) ?? null;
}

export function isWebsiteTaskName(name: string): boolean {
  const m = matchTrackedPattern(name);
  return !!m?.website;
}

export const listAsanaTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_id: z.string().uuid().nullable().optional(),
        website_only: z.boolean().optional(),
        hide_completed: z.boolean().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("asana_tasks")
      .select("*, events(id, code, name, asana_project_gid)")
      .order("due_on", { ascending: true, nullsFirst: false });
    if (data.event_id) q = q.eq("event_id", data.event_id);
    if (data.hide_completed) q = q.eq("completed", false);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let out = rows ?? [];
    if (data.website_only) {
      out = out.filter((r: any) => isWebsiteTaskName(r.name ?? ""));
    }
    return out;
  });

export const getOverdueWebsiteAsanaCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await context.supabase
      .from("asana_tasks")
      .select("id, name, due_on, completed")
      .eq("completed", false)
      .lt("due_on", today);
    if (error) throw new Error(error.message);
    return (data ?? []).filter((r: any) => isWebsiteTaskName(r.name ?? "")).length;
  });
