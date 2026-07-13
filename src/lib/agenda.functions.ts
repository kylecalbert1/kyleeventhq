import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TEMPLATE_KEYS = ["csc_in_person", "aiai", "virtual"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const SESSION_TYPES = [
  "chairperson_remarks",
  "keynote",
  "panel",
  "sponsored_keynote",
  "roundtable",
  "workshop",
  "fireside_chat",
  "coffee_break",
  "break",
  "lunch",
  "happy_hour",
  "other",
] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const SESSION_LABELS: Record<string, string> = {
  chairperson_remarks: "Chairperson remarks",
  keynote: "Keynote",
  panel: "Panel",
  sponsored_keynote: "Sponsored keynote",
  roundtable: "Roundtable",
  workshop: "Workshop",
  fireside_chat: "Fireside chat",
  coffee_break: "Coffee break",
  break: "Break",
  lunch: "Lunch",
  happy_hour: "Happy hour",
  other: "Other",
};

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  csc_in_person: "CSC in-person",
  aiai: "AIAI",
  virtual: "Virtual",
};

export function isSponsorType(t: string) {
  return t === "sponsored_keynote";
}

const AgendaItemInput = z.object({
  event_id: z.string().uuid(),
  position: z.number().int(),
  start_time: z.string().nullable().optional(),
  duration_min: z.number().int().min(1),
  session_type: z.string().min(1),
  title: z.string().nullable().optional(),
  speaker_ids: z.array(z.string().uuid()).optional(),
  speaker_extra: z.string().nullable().optional(),
  av_requirements: z.string().nullable().optional(),
});

export const listAgendaItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agenda_items")
      .select("*")
      .eq("event_id", data.event_id)
      .order("position");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createAgendaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AgendaItemInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("agenda_items")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateAgendaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), patch: AgendaItemInput.partial() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("agenda_items")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteAgendaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agenda_items")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkReplaceAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_id: z.string().uuid(),
        items: z.array(AgendaItemInput.omit({ event_id: true })),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const del = await context.supabase
      .from("agenda_items")
      .delete()
      .eq("event_id", data.event_id);
    if (del.error) throw new Error(del.error.message);
    if (data.items.length === 0) return { count: 0 };
    const rows = data.items.map((it) => ({ ...it, event_id: data.event_id }));
    const ins = await context.supabase.from("agenda_items").insert(rows);
    if (ins.error) throw new Error(ins.error.message);
    return { count: rows.length };
  });

// Templates
export const listAgendaTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agenda_templates")
      .select("*")
      .order("template_key")
      .order("position");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertAgendaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        template_key: z.string(),
        session_type: z.string(),
        minutes: z.number().int().min(1),
        position: z.number().int().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("agenda_templates")
      .upsert(data, { onConflict: "template_key,session_type" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
