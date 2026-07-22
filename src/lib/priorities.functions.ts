import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { currentWeekStart } from "@/lib/weekly";

// Priorities = the old weekly_priorities table, now enriched with ASAP pins,
// optional event tagging, due date and an Asana-task source. ASAP items are
// always visible regardless of week. Non-ASAP items are the current week.

const nullableString = z.string().nullable().optional();

export const listMyPriorities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const week = currentWeekStart();
    const { data, error } = await context.supabase
      .from("weekly_priorities")
      .select("*, events(id, code, name)")
      .eq("user_id", context.userId)
      .or(`is_asap.eq.true,week_start.eq.${week}`)
      .order("is_asap", { ascending: false })
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listPrioritiesForEvent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("weekly_priorities")
      .select("id, position, text, done, is_asap, due_date, user_id, source_asana_gid")
      .eq("event_id", data.event_id)
      .order("is_asap", { ascending: false })
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const CreateInput = z.object({
  text: z.string().min(1).max(500),
  event_id: z.string().uuid().nullable().optional(),
  is_asap: z.boolean().optional(),
  due_date: nullableString,
  source_asana_gid: nullableString,
});

export const createPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    // Dedupe by asana gid if provided
    if (data.source_asana_gid) {
      const { data: existing } = await context.supabase
        .from("weekly_priorities")
        .select("id")
        .eq("user_id", context.userId)
        .eq("source_asana_gid", data.source_asana_gid)
        .maybeSingle();
      if (existing) return existing;
    }
    // Next position among current-week + ASAP scope
    const week = currentWeekStart();
    const { data: rows } = await context.supabase
      .from("weekly_priorities")
      .select("position")
      .eq("user_id", context.userId)
      .or(`is_asap.eq.true,week_start.eq.${week}`);
    const maxPos = (rows ?? []).reduce((m, r: any) => Math.max(m, r.position ?? 0), 0);
    const payload = {
      user_id: context.userId,
      week_start: week,
      position: maxPos + 1,
      text: data.text,
      done: false,
      is_asap: !!data.is_asap,
      event_id: data.event_id ?? null,
      due_date: data.due_date ?? null,
      source_asana_gid: data.source_asana_gid ?? null,
    };
    const { data: row, error } = await context.supabase
      .from("weekly_priorities")
      .insert(payload as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  patch: z.object({
    text: z.string().min(1).max(500).optional(),
    done: z.boolean().optional(),
    is_asap: z.boolean().optional(),
    event_id: z.string().uuid().nullable().optional(),
    due_date: nullableString,
  }),
});

export const updatePriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("weekly_priorities")
      .update(data.patch as never)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("weekly_priorities")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderPriorities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ ids: z.array(z.string().uuid()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Sequentially update positions to avoid a unique-constraint clash on
    // (user_id, week_start, position) — we shift into a high range then back.
    for (let i = 0; i < data.ids.length; i++) {
      await context.supabase
        .from("weekly_priorities")
        .update({ position: 10000 + i } as never)
        .eq("id", data.ids[i])
        .eq("user_id", context.userId);
    }
    for (let i = 0; i < data.ids.length; i++) {
      await context.supabase
        .from("weekly_priorities")
        .update({ position: i + 1 } as never)
        .eq("id", data.ids[i])
        .eq("user_id", context.userId);
    }
    return { ok: true };
  });
