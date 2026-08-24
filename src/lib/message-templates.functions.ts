import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MessageTemplate = {
  id: string;
  name: string;
  stream: "speakers" | "attendees" | "incomplete_tickets" | "everyone";
  /** Points in the cycle this type usually goes out. A hint only, never a schedule. */
  typical_weeks: number[] | null;
  business_line: "AIAI" | "CSC" | null;
  event_format: "in_person" | "virtual" | null;
  subject: string;
  body_markdown: string;
  tito_filter_hint: string;
  position: number;
  is_seed: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type MessageBlock = {
  id: string;
  name: string;
  body_markdown: string;
  position: number;
  is_seed: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type EventMessageSend = {
  id: string;
  event_id: string;
  template_id: string | null;
  sent_at: string;
  recipient_count: number | null;
  notes: string | null;
  created_at: string;
};

const TemplateInput = z.object({
  name: z.string().min(1),
  stream: z.enum(["speakers", "attendees", "incomplete_tickets", "everyone"]),
  typical_weeks: z.array(z.number().int()).nullable(),
  business_line: z.enum(["AIAI", "CSC"]).nullable(),
  event_format: z.enum(["in_person", "virtual"]).nullable(),
  subject: z.string(),
  body_markdown: z.string(),
  tito_filter_hint: z.string(),
  position: z.number().int().optional(),
});


export const listMessageTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("message_templates")
      .select("*")
      .eq("is_archived", false)
      .order("position")
      .order("position")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as MessageTemplate[];
  });

export const createMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TemplateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("message_templates")
      .insert({ ...data, is_seed: false })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as MessageTemplate;
  });

export const updateMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), patch: TemplateInput.partial() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("message_templates")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as MessageTemplate;
  });

export const duplicateMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src, error: e1 } = await context.supabase
      .from("message_templates")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!src) throw new Error("Template not found");
    const { data: row, error } = await context.supabase
      .from("message_templates")
      .insert({
        name: `${src.name} (copy)`,
        stream: src.stream,
        typical_weeks: src.typical_weeks,
        business_line: src.business_line,
        event_format: src.event_format,
        subject: src.subject,
        body_markdown: src.body_markdown,
        tito_filter_hint: src.tito_filter_hint,
        position: (src.position ?? 0) + 1,
        is_seed: false,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as MessageTemplate;
  });

export const deleteMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Seeds archive (so send history keeps resolving); user templates hard-delete.
    const { data: t } = await context.supabase
      .from("message_templates")
      .select("is_seed")
      .eq("id", data.id)
      .maybeSingle();
    if (t?.is_seed) {
      const { error } = await context.supabase
        .from("message_templates")
        .update({ is_archived: true })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("message_templates")
        .delete()
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/* ---------------- per-event send log ---------------- */

export const listEventMessageSends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("event_message_sends")
      .select("*")
      .eq("event_id", data.event_id)
      .order("sent_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as EventMessageSend[];
  });

export const markMessageSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_id: z.string().uuid(),
        template_id: z.string().uuid().nullable(),
        recipient_count: z.number().int().min(0).nullable().optional(),
        notes: z.string().nullable().optional(),
        sent_at: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("event_message_sends")
      .insert({
        event_id: data.event_id,
        template_id: data.template_id ?? null,
        recipient_count: data.recipient_count ?? null,
        notes: data.notes ?? null,
        ...(data.sent_at ? { sent_at: data.sent_at } : {}),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as EventMessageSend;
  });

export const deleteMessageSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("event_message_sends")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * First name of the signed-in user, used to build [[signoff]].
 * Never hardcoded into template bodies.
 */
export const getMessageSenderName = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const claims = context.claims as Record<string, any>;
    const meta = (claims?.user_metadata ?? {}) as Record<string, any>;
    const raw: string =
      meta.full_name || meta.name || meta.first_name || "";
    if (raw.trim()) {
      const first = raw.trim().split(/\s+/)[0] ?? "";
      if (first) return { firstName: first[0].toUpperCase() + first.slice(1) };
    }
    const email: string = claims?.email ?? "";
    const local = email.split("@")[0] ?? "";
    const token = local.split(/[._\-+0-9]+/).filter(Boolean)[0] ?? "";
    if (!token) return { firstName: "Team" };
    return { firstName: token[0].toUpperCase() + token.slice(1) };
  });

/* ---------------- reusable content blocks ---------------- */

const BlockInput = z.object({
  name: z.string().min(1),
  body_markdown: z.string(),
  position: z.number().int().optional(),
});

export const listMessageBlocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("message_blocks")
      .select("*")
      .eq("is_archived", false)
      .order("position")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as MessageBlock[];
  });

export const createMessageBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => BlockInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("message_blocks")
      .insert({ ...data, is_seed: false })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as MessageBlock;
  });

export const updateMessageBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), patch: BlockInput.partial() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("message_blocks")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as MessageBlock;
  });

export const deleteMessageBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: b } = await context.supabase
      .from("message_blocks")
      .select("is_seed")
      .eq("id", data.id)
      .maybeSingle();
    if (b?.is_seed) {
      const { error } = await context.supabase
        .from("message_blocks")
        .update({ is_archived: true })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("message_blocks")
        .delete()
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
