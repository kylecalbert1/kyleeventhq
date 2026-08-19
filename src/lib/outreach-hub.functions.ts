import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OutreachPatch = z.object({
  inmail_subject: z.string().nullable().optional(),
  inmail_message: z.string().nullable().optional(),
  connect_message: z.string().nullable().optional(),
  colleague_slack: z.string().nullable().optional(),
  colleague_linkedin: z.string().nullable().optional(),
});

export const getEventOutreach = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [outreach, searches] = await Promise.all([
      context.supabase
        .from("event_outreach")
        .select("*")
        .eq("event_id", data.event_id)
        .maybeSingle(),
      context.supabase
        .from("event_saved_searches")
        .select("*")
        .eq("event_id", data.event_id)
        .order("position"),
    ]);
    if (outreach.error) throw new Error(outreach.error.message);
    if (searches.error) throw new Error(searches.error.message);
    return { outreach: outreach.data, searches: searches.data ?? [] };
  });

export const upsertEventOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ event_id: z.string().uuid(), patch: OutreachPatch }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("event_outreach")
      .select("id")
      .eq("event_id", data.event_id)
      .maybeSingle();
    if (existing) {
      const { data: row, error } = await context.supabase
        .from("event_outreach")
        .update(data.patch)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("event_outreach")
      .insert({ event_id: data.event_id, ...data.patch })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const createSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_id: z.string().uuid(),
        label: z.string().min(1),
        url: z.string().nullable().optional(),
        position: z.number().int().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("event_saved_searches")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.object({
          label: z.string().optional(),
          url: z.string().nullable().optional(),
          position: z.number().int().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("event_saved_searches")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("event_saved_searches")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- custom message types (VIP, more-info, etc.) ---------------- */

export type OutreachSnippet = {
  id: string;
  event_id: string;
  label: string;
  description: string | null;
  body: string;
  position: number;
};

export const createOutreachSnippet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_id: z.string().uuid(),
        label: z.string().min(1),
        description: z.string().nullable().optional(),
        body: z.string().optional(),
        position: z.number().int().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("event_outreach_snippets")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as OutreachSnippet;
  });

export const updateOutreachSnippet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.object({
          label: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          body: z.string().optional(),
          position: z.number().int().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("event_outreach_snippets")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as OutreachSnippet;
  });

export const deleteOutreachSnippet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("event_outreach_snippets")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
