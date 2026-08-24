import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EventInput = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  business_line: z.enum(["AIAI", "CSC"]),
  format: z.enum(["in_person", "virtual"]),
  event_date: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
  kickoff_date: z.string().nullable().optional(),
  washup_date: z.string().nullable().optional(),
  website_status: z.enum(["draft", "proof_1", "proof_2", "signed_off", "live"]),
  launch_date: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  proof1_due: z.string().nullable().optional(),
  proof2_due: z.string().nullable().optional(),
  final_signoff_due: z.string().nullable().optional(),
  proof1_done: z.boolean().optional(),
  proof2_done: z.boolean().optional(),
  signoff_done: z.boolean().optional(),
  self_status: z.enum(["on_track", "needs_attention", "off_track"]).optional(),
  banner_dropbox_link: z.string().nullable().optional(),
  asana_project_gid: z.string().nullable().optional(),
  speaker_target: z.number().int().min(0).optional(),
  external_agenda_url: z.string().nullable().optional(),
  av_agenda_doc_url: z.string().nullable().optional(),
  tito_slug: z.string().nullable().optional(),
  sales_contact_name: z.string().nullable().optional(),
  sales_contact_email: z.string().nullable().optional(),
  sales_contact_booking_link: z.string().nullable().optional(),
  // Message details - feed the [[placeholders]] in the message templates.
  event_site_url: z.string().nullable().optional(),
  venue_url: z.string().nullable().optional(),
  venue_address: z.string().nullable().optional(),
  registration_time: z.string().nullable().optional(),
  sessions_start_time: z.string().nullable().optional(),
  venue_notes: z.string().nullable().optional(),
  join_instructions: z.string().nullable().optional(),
  dietary_url: z.string().nullable().optional(),
  room_block_url: z.string().nullable().optional(),
  room_block_notes: z.string().nullable().optional(),
});


export const listEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("events")
      .select("*")
      .order("launch_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listEventSummaries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [events, speakers, milestones] = await Promise.all([
      context.supabase.from("events").select("*"),
      context.supabase
        .from("speakers")
        .select("id,event_id,status,banner_status"),
      context.supabase.from("event_milestones").select("id,event_id,type,status"),
    ]);
    if (events.error) throw new Error(events.error.message);
    if (speakers.error) throw new Error(speakers.error.message);
    if (milestones.error) throw new Error(milestones.error.message);

    return (events.data ?? []).map((e) => {
      const evSpeakers = (speakers.data ?? []).filter((s) => s.event_id === e.id);
      const confirmed = evSpeakers.filter((s) => s.status === "confirmed").length;
      const bannersSent = evSpeakers.filter(
        (s) => s.banner_status === "sent" || s.banner_status === "confirmed_live",
      ).length;
      const evMilestones = (milestones.data ?? []).filter((m) => m.event_id === e.id);
      const kickoff = evMilestones.find((m) => m.type === "kickoff");
      const washup = evMilestones.find((m) => m.type === "washup");
      return {
        event: e,
        speakerCount: evSpeakers.length,
        confirmedCount: confirmed,
        bannersSent,
        bannerTotal: evSpeakers.length,
        kickoffDone: kickoff?.status === "done",
        kickoffExists: !!kickoff,
        washupDone: washup?.status === "done",
        washupExists: !!washup,
      };
    });
  });

export const getEvent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("events")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Event not found");
    return row;
  });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => EventInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("events")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), patch: EventInput.partial() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("events")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
