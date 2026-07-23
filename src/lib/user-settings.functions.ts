import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UserSettings = {
  user_id: string;
  email_signature_html: string;
  updated_at: string;
};

export const getUserSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? {
      user_id: context.userId,
      email_signature_html: "",
      updated_at: new Date().toISOString(),
    }) as UserSettings;
  });

export const updateUserSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ email_signature_html: z.string().max(20000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("user_settings")
      .upsert(
        {
          user_id: context.userId,
          email_signature_html: data.email_signature_html,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as UserSettings;
  });
