import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listWeeklyPriorities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ week_start: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("weekly_priorities")
      .select("*")
      .eq("user_id", context.userId)
      .eq("week_start", data.week_start)
      .order("position");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertWeeklyPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        week_start: z.string(),
        position: z.number().int().min(1).max(5),
        text: z.string().optional(),
        done: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload: Record<string, unknown> = {
      user_id: context.userId,
      week_start: data.week_start,
      position: data.position,
    };
    if (data.text !== undefined) payload.text = data.text;
    if (data.done !== undefined) payload.done = data.done;
    const { data: row, error } = await context.supabase
      .from("weekly_priorities")
      .upsert(payload as never, { onConflict: "user_id,week_start,position" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
