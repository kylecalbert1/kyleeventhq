import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MessageGenerationHistoryEntry = {
  id: string;
  event_id: string;
  template_id: string | null;
  prompt: string;
  source: string;
  name: string;
  subject: string;
  body_markdown: string;
  stream: "speakers" | "attendees" | "incomplete_tickets" | "everyone";
  event_format: "in_person" | "virtual" | null;
  typical_weeks: number[] | null;
  created_at: string;
};

export const listMessageGenerationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("message_generation_history")
      .select("*")
      .eq("event_id", data.event_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as MessageGenerationHistoryEntry[];
  });

export const deleteMessageGenerationHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("message_generation_history")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
