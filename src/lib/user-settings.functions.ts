import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UserSettings = {
  user_id: string;
  email_signature_html: string;
  excluded_ticket_types: string[];
  sponsor_watch_emails: string[];
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
    if (!data) {
      return {
        user_id: context.userId,
        email_signature_html: "",
        excluded_ticket_types: [],
        sponsor_watch_emails: [],
        updated_at: new Date().toISOString(),
      } as UserSettings;
    }
    return {
      ...data,
      excluded_ticket_types: data.excluded_ticket_types ?? [],
      sponsor_watch_emails: data.sponsor_watch_emails ?? [],
    } as UserSettings;
  });

export const updateUserSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        email_signature_html: z.string().max(20000).optional(),
        excluded_ticket_types: z.array(z.string().max(300)).max(200).optional(),
        sponsor_watch_emails: z.array(z.string().max(320)).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { data: row, error } = await context.supabase
      .from("user_settings")
      .upsert(
        {
          user_id: context.userId,
          email_signature_html:
            data.email_signature_html ?? existing?.email_signature_html ?? "",
          excluded_ticket_types:
            data.excluded_ticket_types ?? existing?.excluded_ticket_types ?? [],
          sponsor_watch_emails:
            data.sponsor_watch_emails ?? existing?.sponsor_watch_emails ?? [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return {
      ...row,
      excluded_ticket_types: row.excluded_ticket_types ?? [],
      sponsor_watch_emails: row.sponsor_watch_emails ?? [],
    } as UserSettings;
  });

