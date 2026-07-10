import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AccountInput = z.object({
  week_start: z.string(),
  account_name: z.string().min(1),
  owner: z.string().nullable().optional(),
  event_id: z.string().uuid().nullable().optional(),
  li_invite_template: z.string().nullable().optional(),
  inmail_template: z.string().nullable().optional(),
  camp_a_template: z.string().nullable().optional(),
  camp_b_template: z.string().nullable().optional(),
  li_invite_done: z.boolean().optional(),
  inmail_done: z.boolean().optional(),
  camp_a_done: z.boolean().optional(),
  camp_b_done: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export const listOutreachAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ week_start: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("outreach_accounts")
      .select("*")
      .eq("week_start", data.week_start)
      .order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createOutreachAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AccountInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("outreach_accounts")
      .insert(data as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateOutreachAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), patch: AccountInput.partial() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("outreach_accounts")
      .update(data.patch as never)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteOutreachAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("outreach_accounts")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const carryForwardWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ from_week: z.string(), to_week: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("outreach_accounts")
      .select("*")
      .eq("week_start", data.from_week);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return { count: 0 };
    const clones = rows.map((r: Record<string, unknown>) => ({
      week_start: data.to_week,
      account_name: r.account_name,
      owner: r.owner,
      event_id: r.event_id,
      li_invite_template: r.li_invite_template,
      inmail_template: r.inmail_template,
      camp_a_template: r.camp_a_template,
      camp_b_template: r.camp_b_template,
    }));
    const { error: insErr } = await context.supabase
      .from("outreach_accounts")
      .insert(clones as never);
    if (insErr) throw new Error(insErr.message);
    return { count: clones.length };
  });

// Team checklist
const ChecklistInput = z.object({
  week_start: z.string(),
  category: z.enum(["sales", "marketing", "content", "community"]),
  text: z.string().min(1),
  done: z.boolean().optional(),
  position: z.number().int().optional(),
});

export const listTeamChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ week_start: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("team_checklist_items")
      .select("*")
      .eq("week_start", data.week_start)
      .order("category")
      .order("position");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ChecklistInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("team_checklist_items")
      .insert(data as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.object({ text: z.string().optional(), done: z.boolean().optional() }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("team_checklist_items")
      .update(data.patch as never)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("team_checklist_items")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
