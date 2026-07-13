import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listSponsorMentions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ only_unactioned: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("sponsor_mentions")
      .select("*")
      .order("message_date", { ascending: false, nullsFirst: false });
    if (data.only_unactioned) q = q.eq("actioned", false);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setSponsorMentionActioned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), actioned: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sponsor_mentions")
      .update({ actioned: data.actioned })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
