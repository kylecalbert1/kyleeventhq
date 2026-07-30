import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SpeakerInput = z.object({
  event_id: z.string().uuid(),
  name: z.string().min(1),
  company: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  status: z.enum(["new", "contacted", "in_conversation", "responded", "confirmed", "declined"]),
  call_scheduled: z.boolean().optional(),
  call_scheduled_at: z.string().nullable().optional(),
  session_title: z.string().nullable().optional(),
  session_format: z.enum(["keynote", "panel", "workshop", "fireside"]).nullable().optional(),
  banner_status: z.enum(["not_started", "created", "sent", "confirmed_live"]),
  bio_received: z.boolean().optional(),
  bio_text: z.string().nullable().optional(),
  headshot_received: z.boolean().optional(),
  bio_and_headshot_received: z.boolean().optional(),
  linkedin_url: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  dropbox_link: z.string().nullable().optional(),
  linkedin_post_confirmed: z.boolean(),
  outreach_channel: z.enum(["linkedin_connect","group_message","old_attendee_list","warm_intro","cold_email"]).nullable().optional(),
  gmail_thread_id: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  source_ticket_id: z.string().uuid().nullable().optional(),
  copied_from_speaker_id: z.string().uuid().nullable().optional(),
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
    const { findOrMergeSpeaker } = await import("@/lib/speaker-dedupe.server");
    const { row } = await findOrMergeSpeaker(context.supabase, data);
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

export const markSpeakerReplied = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("speakers")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_direction: "outbound",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
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

// Duplicate a speaker into a new event as a fresh prospect. Keeps a link
// back to the original via copied_from_speaker_id so history is preserved.
export const copySpeakerToEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      source_speaker_id: z.string().uuid(),
      target_event_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: src, error: srcErr } = await context.supabase
      .from("speakers")
      .select("name, email, company, title, linkedin_url, notes, session_format")
      .eq("id", data.source_speaker_id)
      .maybeSingle();
    if (srcErr) throw new Error(srcErr.message);
    if (!src) throw new Error("Source speaker not found");

    const { findOrMergeSpeaker } = await import("@/lib/speaker-dedupe.server");
    const { row } = await findOrMergeSpeaker(context.supabase, {
      event_id: data.target_event_id,
      name: src.name,
      email: src.email,
      company: src.company,
      title: src.title,
      linkedin_url: src.linkedin_url,
      notes: src.notes ? `Copied from past speaker.\n\n${src.notes}` : "Copied from past speaker.",
      session_format: src.session_format,
      status: "new",
      banner_status: "not_started",
      linkedin_post_confirmed: false,
      copied_from_speaker_id: data.source_speaker_id,
      source: "recurring",
    });
    return row;

  });
