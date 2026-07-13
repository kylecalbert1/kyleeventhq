import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SpeakerInput = z.object({
  event_id: z.string().uuid(),
  name: z.string().min(1),
  company: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  status: z.enum(["contacted", "responded", "confirmed", "declined"]),
  session_title: z.string().nullable().optional(),
  session_format: z.enum(["keynote", "panel", "workshop", "fireside"]).nullable().optional(),
  banner_status: z.enum(["not_started", "created", "sent", "confirmed_live"]),
  bio_received: z.boolean(),
  bio_text: z.string().nullable().optional(),
  headshot_received: z.boolean(),
  linkedin_url: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  dropbox_link: z.string().nullable().optional(),
  linkedin_post_confirmed: z.boolean(),
  outreach_channel: z.enum(["linkedin_connect","group_message","old_attendee_list","warm_intro","cold_email"]).nullable().optional(),
});

export const listSpeakers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("speakers").select("*").order("created_at", { ascending: false });
    if (data.event_id) q = q.eq("event_id", data.event_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createSpeaker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SpeakerInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("speakers")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateSpeaker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), patch: SpeakerInput.partial() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("speakers")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSpeaker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("speakers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkMarkBannerSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("speakers")
      .update({ banner_status: "sent" })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export const listSpeakerActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ speaker_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("speaker_activity_log")
      .select("*")
      .eq("speaker_id", data.speaker_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      speaker_id: string;
      event_type: string;
      note: string | null;
      created_at: string;
    }>;
  });
