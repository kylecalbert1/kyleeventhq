import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EventLink = {
  id: string;
  section_id: string;
  label: string;
  url: string;
  position: number;
};

export type EventLinkSection = {
  id: string;
  event_id: string;
  name: string;
  position: number;
  event_links: EventLink[];
};

export const listEventLinkSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("event_link_sections")
      .select("id, event_id, name, position, event_links(id, section_id, label, url, position)")
      .eq("event_id", data.event_id)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const row = r as unknown as EventLinkSection;
      return {
        ...row,
        event_links: [...(row.event_links ?? [])].sort((a, b) => a.position - b.position),
      };
    });
  });

export const createEventLinkSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ event_id: z.string().uuid(), name: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("event_link_sections")
      .select("id", { count: "exact", head: true })
      .eq("event_id", data.event_id);
    const { data: row, error } = await context.supabase
      .from("event_link_sections")
      .insert({ event_id: data.event_id, name: data.name, position: count ?? 0 })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const renameEventLinkSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), name: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("event_link_sections")
      .update({ name: data.name })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteEventLinkSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("event_link_sections")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertEventLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        section_id: z.string().uuid(),
        label: z.string().min(1),
        url: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const url = /^https?:\/\//i.test(data.url) ? data.url : `https://${data.url}`;
    if (data.id) {
      const { error } = await context.supabase
        .from("event_links")
        .update({ label: data.label, url })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { count } = await context.supabase
      .from("event_links")
      .select("id", { count: "exact", head: true })
      .eq("section_id", data.section_id);
    const { data: row, error } = await context.supabase
      .from("event_links")
      .insert({ section_id: data.section_id, label: data.label, url, position: count ?? 0 })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteEventLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("event_links").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
