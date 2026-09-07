import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UnsubscribeRow = {
  id: string;
  email: string;
  source: string;
  note: string | null;
  created_at: string;
};

export const listUnsubscribes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("email_unsubscribes")
      .select("id, email, source, note, created_at")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return (data ?? []) as UnsubscribeRow[];
  });

export const addUnsubscribe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ email: z.string().min(3), note: z.string().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const email = data.email.trim().toLowerCase();
    const { error } = await context.supabase
      .from("email_unsubscribes")
      .insert({ email, source: "manual", note: data.note ?? null });
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
    return { ok: true };
  });

export const removeUnsubscribe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_unsubscribes")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
