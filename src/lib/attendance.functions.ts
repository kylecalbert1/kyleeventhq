import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Per-speaker signed "confirm your speaking date" links for an event, keyed by
 * speaker id. Merged into emails exactly like {{speaker_pass_link}} is.
 */
export const listConfirmAttendanceLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { attendanceConfirmUrl } = await import("@/lib/attendance-token.server");
    const { data: rows, error } = await context.supabase
      .from("speakers")
      .select("id, email")
      .eq("event_id", data.event_id);
    if (error) throw new Error(error.message);
    const byId: Record<string, string> = {};
    const byEmail: Record<string, string> = {};
    for (const r of rows ?? []) {
      const url = attendanceConfirmUrl(r.id, data.event_id);
      byId[r.id] = url;
      if (r.email) byEmail[r.email.trim().toLowerCase()] = url;
    }
    return { byId, byEmail };
  });
