/**
 * Shared duplicate guard for speaker creation.
 *
 * Any code path that would insert a row into `speakers` should go through
 * `findOrMergeSpeaker`. If a speaker already exists for the same event with the
 * same email (case-insensitive, trimmed), we do NOT insert a second row —
 * instead we fold in any non-blank fields from the incoming data where the
 * existing record is blank/null, mirroring the "only fill in blanks, never
 * overwrite" rule used by `mergeSpeakers` in src/lib/boards.functions.ts.
 */

type AnyClient = {
  from: (t: string) => any;
};

const SKIP_FIELDS = new Set(["id", "created_at", "updated_at", "event_id", "email"]);

function normEmail(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/**
 * Returns `{ row, merged }`. `merged: true` means an existing speaker was
 * reused (and possibly enriched) instead of a new row being created.
 */
export async function findOrMergeSpeaker(
  supabase: AnyClient,
  input: Record<string, unknown>,
): Promise<{ row: any; merged: boolean; merged_fields: string[] }> {
  const eventId = typeof input.event_id === "string" ? input.event_id : "";
  const email = normEmail(input.email);

  if (eventId && email) {
    const { data: candidates, error: findErr } = await supabase
      .from("speakers")
      .select("*")
      .eq("event_id", eventId)
      .not("email", "is", null);
    if (findErr) throw new Error(findErr.message);

    const existing = (candidates ?? []).find(
      (r: Record<string, unknown>) => normEmail(r.email) === email,
    );

    if (existing) {
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input)) {
        if (SKIP_FIELDS.has(k)) continue;
        if (isBlank(v)) continue;
        if (isBlank(existing[k])) patch[k] = v;
      }
      if (Object.keys(patch).length) {
        const { data: updated, error: upErr } = await supabase
          .from("speakers")
          .update(patch)
          .eq("id", existing.id)
          .select()
          .single();
        if (upErr) throw new Error(upErr.message);
        return { row: updated, merged: true, merged_fields: Object.keys(patch) };
      }
      return { row: existing, merged: true, merged_fields: [] };
    }
  }

  const { data: row, error } = await supabase
    .from("speakers")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { row, merged: false, merged_fields: [] };
}

/** Batch variant: processes rows sequentially, reusing existing matches. */
export async function findOrMergeSpeakers(
  supabase: AnyClient,
  rows: Array<Record<string, unknown>>,
): Promise<{ created: any[]; mergedRows: any[] }> {
  const created: any[] = [];
  const mergedRows: any[] = [];
  for (const r of rows) {
    const res = await findOrMergeSpeaker(supabase, r);
    if (res.merged) mergedRows.push(res.row);
    else created.push(res.row);
  }
  return { created, mergedRows };
}
