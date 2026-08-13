import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Assign a speaker to an agenda item. Removes them from other agenda items
// in the same event so a speaker only appears in one session at a time.
export const assignSpeakerToAgendaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      speaker_id: z.string().uuid(),
      event_id: z.string().uuid(),
      agenda_item_id: z.string().uuid().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: items, error } = await context.supabase
      .from("agenda_items")
      .select("id, speaker_ids")
      .eq("event_id", data.event_id);
    if (error) throw new Error(error.message);
    for (const item of items ?? []) {
      const row = item as { id: string; speaker_ids: string[] | null };
      const ids = new Set(row.speaker_ids ?? []);
      const had = ids.has(data.speaker_id);
      if (row.id === data.agenda_item_id) {
        if (had) continue;
        ids.add(data.speaker_id);
      } else {
        if (!had) continue;
        ids.delete(data.speaker_id);
      }
      const { error: uErr } = await context.supabase
        .from("agenda_items")
        .update({ speaker_ids: Array.from(ids) })
        .eq("id", row.id);
      if (uErr) throw new Error(uErr.message);
    }
    return { ok: true };
  });
