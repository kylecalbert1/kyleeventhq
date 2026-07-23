import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SpeakerEmailDraft = {
  id: string;
  speaker_id: string;
  kind: string;
  subject: string;
  body: string;
  status: "draft" | "sent" | "discarded";
  speaker_pass_link: string | null;
  guest_pass_link: string | null;
  sent_at: string | null;
  sent_email_send_id: string | null;
  created_at: string;
  updated_at: string;
};

export const listDraftsForEvent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("speaker_email_drafts" as never)
      .select("*, speakers!inner(id, name, email, event_id, status)")
      .eq("status", "draft")
      .eq("speakers.event_id", data.event_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<
      SpeakerEmailDraft & {
        speakers: { id: string; name: string; email: string | null; event_id: string; status: string };
      }
    >;
  });

export const updateSpeakerDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      patch: z.object({ subject: z.string().optional(), body: z.string().optional() }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("speaker_email_drafts" as never)
      .update(data.patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const discardSpeakerDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("speaker_email_drafts" as never)
      .update({ status: "discarded" } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markSpeakerDraftSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), email_send_id: z.string().uuid().nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("speaker_email_drafts" as never)
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_email_send_id: data.email_send_id ?? null,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Assign a speaker to an agenda item. Removes them from other agenda items
// in the same event so a speaker only appears in one session at a time.
export const assignSpeakerToAgendaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      speaker_id: z.string().uuid(),
      event_id: z.string().uuid(),
      agenda_item_id: z.string().uuid().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: items, error } = await context.supabase
      .from("agenda_items")
      .select("id, speaker_ids")
      .eq("event_id", data.event_id);
    if (error) throw new Error(error.message);
    for (const item of items ?? []) {
      const row = item as { id: string; speaker_ids: string[] | null };
      const ids = new Set(row.speaker_ids ?? []);
      const had = ids.has(data.speaker_id);
      if (row.id === data.agenda_item_id) {
        if (had) continue;
        ids.add(data.speaker_id);
      } else {
        if (!had) continue;
        ids.delete(data.speaker_id);
      }
      const { error: uErr } = await context.supabase
        .from("agenda_items")
        .update({ speaker_ids: Array.from(ids) })
        .eq("id", row.id);
      if (uErr) throw new Error(uErr.message);
    }
    return { ok: true };
  });
