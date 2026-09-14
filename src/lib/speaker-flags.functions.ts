import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SpeakerFlagRow = {
  id: string;
  speaker_id: string;
  event_id: string | null;
  /** 'manual' for a free-text note; otherwise the automatic flag code dismissed. */
  code: string;
  note: string | null;
  dismissed_at: string | null;
  created_at: string;
};

export const listSpeakerFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("speaker_flags")
      .select("*")
      .eq("event_id", data.event_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as SpeakerFlagRow[];
  });

export const addManualFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        speaker_id: z.string().uuid(),
        event_id: z.string().uuid().nullable().optional(),
        note: z.string().min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("speaker_flags")
      .insert({
        speaker_id: data.speaker_id,
        event_id: data.event_id ?? null,
        code: "manual",
        note: data.note,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as SpeakerFlagRow;
  });

/** Hide an automatic flag for this speaker (recorded as a dismissal row). */
export const dismissAutoFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        speaker_id: z.string().uuid(),
        event_id: z.string().uuid().nullable().optional(),
        code: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.code === "manual") throw new Error("Manual flags are dismissed by id.");
    const { error } = await context.supabase.from("speaker_flags").upsert(
      {
        speaker_id: data.speaker_id,
        event_id: data.event_id ?? null,
        code: data.code,
        dismissed_at: new Date().toISOString(),
      },
      { onConflict: "speaker_id,code" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSpeakerFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("speaker_flags").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setSpeakerHealthOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        speaker_id: z.string().uuid(),
        override: z.enum(["ok", "follow_up", "at_risk"]).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("speakers")
      .update({ health_override: data.override })
      .eq("id", data.speaker_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
