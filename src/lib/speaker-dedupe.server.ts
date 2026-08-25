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

/** Same normalization as the Asana import: lowercase, non-alphanumeric -> space. */
function normName(v: unknown): string {
  return typeof v === "string" ? v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : "";
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
  const name = normName(input.name);

  if (eventId && (email || name)) {
    const { data: candidates, error: findErr } = await supabase
      .from("speakers")
      .select("*")
      .eq("event_id", eventId);
    if (findErr) throw new Error(findErr.message);

    const list = (candidates ?? []) as Array<Record<string, unknown>>;
    const existing =
      (email ? list.find((r) => normEmail(r.email) === email) : undefined) ??
      (name ? list.find((r) => normName(r.name) === name) : undefined);

    if (existing) {
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input)) {
        if (SKIP_FIELDS.has(k)) continue;
        if (isBlank(v)) continue;
        if (isBlank(existing[k])) patch[k] = v;
      }
      // Email is normally skipped (it is the match key); fill it when blank.
      if (email && isBlank(existing.email)) patch.email = input.email;
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


  // Every speaker on an event that has a board must land on that board, so it
  // can never become an invisible orphan. Default to the board's first column.
  const payload: Record<string, unknown> = { ...input };
  if (eventId && !payload.board_column_id) {
    const col = await defaultColumnForEvent(supabase, eventId);
    if (col) payload.board_column_id = col;
  }

  const { data: row, error } = await supabase
    .from("speakers")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { row, merged: false, merged_fields: [] };
}

/** First column of the (oldest) board linked to an event, if any. */
export async function defaultColumnForEvent(
  supabase: AnyClient,
  eventId: string,
): Promise<string | null> {
  const { data: boards } = await supabase
    .from("speaker_boards")
    .select("id, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true })
    .limit(1);
  const boardId = (boards ?? [])[0]?.id;
  if (!boardId) return null;
  const { data: cols } = await supabase
    .from("speaker_board_columns")
    .select("id, position")
    .eq("board_id", boardId)
    .order("position", { ascending: true })
    .limit(1);
  return (cols ?? [])[0]?.id ?? null;
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
