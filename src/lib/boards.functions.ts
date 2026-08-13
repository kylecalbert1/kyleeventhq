import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_COLUMNS: Array<{ name: string; position: number; kind: string }> = [
  { name: "Interest", position: 0, kind: "interest" },
  { name: "In conversation", position: 1, kind: "in_conversation" },
  { name: "Confirmed", position: 2, kind: "confirmed" },
  { name: "Registered", position: 3, kind: "registered" },
  { name: "Declined", position: 4, kind: "declined" },
];

import { statusForKind } from "@/lib/board-status";

export { statusForKind };


export const listBoards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [boardsRes, eventsRes, speakersRes, colsRes] = await Promise.all([
      context.supabase
        .from("speaker_boards")
        .select("*")
        .order("created_at", { ascending: false }),
      context.supabase.from("events").select("id, code, name, event_date, business_line"),
      context.supabase.from("speakers").select("id, board_column_id, status"),
      context.supabase.from("speaker_board_columns").select("id, board_id"),
    ]);
    if (boardsRes.error) throw new Error(boardsRes.error.message);
    if (eventsRes.error) throw new Error(eventsRes.error.message);

    const boardByColumn = new Map<string, string>();
    for (const c of colsRes.data ?? []) boardByColumn.set(c.id, c.board_id);
    const counts = new Map<string, number>();
    const confirmed = new Map<string, number>();
    for (const s of speakersRes.data ?? []) {
      if (!s.board_column_id) continue;
      const b = boardByColumn.get(s.board_column_id);
      if (!b) continue;
      counts.set(b, (counts.get(b) ?? 0) + 1);
      if (s.status === "confirmed") confirmed.set(b, (confirmed.get(b) ?? 0) + 1);
    }
    const eventById = new Map((eventsRes.data ?? []).map((e) => [e.id, e]));

    return (boardsRes.data ?? []).map((b) => ({
      ...b,
      event: b.event_id ? (eventById.get(b.event_id) ?? null) : null,
      speaker_count: counts.get(b.id) ?? 0,
      confirmed_count: confirmed.get(b.id) ?? 0,
    }));
  });

async function seedColumns(supabase: any, boardId: string) {
  const { error } = await supabase
    .from("speaker_board_columns")
    .insert(DEFAULT_COLUMNS.map((c) => ({ ...c, board_id: boardId })));
  if (error) throw new Error(error.message);
}

export const createBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ name: z.string().min(1), event_id: z.string().uuid().nullable().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: board, error } = await context.supabase
      .from("speaker_boards")
      .insert({ name: data.name, event_id: data.event_id ?? null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await seedColumns(context.supabase, board.id);
    return board;
  });

/** Returns the board for an event, creating it (with default columns) if absent. */
export const ensureEventBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing, error } = await context.supabase
      .from("speaker_boards")
      .select("*")
      .eq("event_id", data.event_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (existing) return existing;

    const { data: ev } = await context.supabase
      .from("events")
      .select("code, name")
      .eq("id", data.event_id)
      .maybeSingle();
    const { data: board, error: insErr } = await context.supabase
      .from("speaker_boards")
      .insert({
        name: `${ev?.code ?? ev?.name ?? "Event"} speakers`,
        event_id: data.event_id,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);
    await seedColumns(context.supabase, board.id);
    return board;
  });

export const renameBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), name: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("speaker_boards")
      .update({ name: data.name })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("speaker_boards").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Full board payload: board, its columns (ordered), the speakers placed on it,
 * and a per-speaker "registered in Tito" flag computed with the same speaker
 * pass / guest pass rule the reconciliation view uses.
 */
export const getBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ board_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { normEmail } = await import("@/lib/tito-matching");

    const { data: board, error: bErr } = await context.supabase
      .from("speaker_boards")
      .select("*")
      .eq("id", data.board_id)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!board) throw new Error("Board not found");

    const { data: columns, error: cErr } = await context.supabase
      .from("speaker_board_columns")
      .select("*")
      .eq("board_id", board.id)
      .order("position", { ascending: true });
    if (cErr) throw new Error(cErr.message);

    const columnIds = (columns ?? []).map((c) => c.id);
    let speakers: any[] = [];
    if (columnIds.length) {
      const { data: rows, error: sErr } = await context.supabase
        .from("speakers")
        .select("*")
        .in("board_column_id", columnIds)
        .order("created_at", { ascending: false });
      if (sErr) throw new Error(sErr.message);
      speakers = rows ?? [];
    }

    // Event lookup for the speakers on this board (a standalone board can mix events).
    const eventIds = Array.from(
      new Set(speakers.map((s) => s.event_id).filter(Boolean) as string[]),
    );
    let events: any[] = [];
    if (eventIds.length) {
      const { data: evs } = await context.supabase
        .from("events")
        .select("id, code, name, event_date, tito_slug, business_line")
        .in("id", eventIds);
      events = evs ?? [];
    }
    const eventById = new Map(events.map((e) => [e.id, e]));

    // Tito registration: speaker pass / guest pass holders per relevant slug.
    const slugs = Array.from(
      new Set(events.map((e) => e.tito_slug).filter(Boolean) as string[]),
    );
    const registeredBySlug = new Map<string, { emails: Set<string>; ids: Set<string> }>();
    if (slugs.length) {
      const { data: tickets } = await context.supabase
        .from("tito_tickets")
        .select("id, email, event_slug, release_title")
        .in("event_slug", slugs);
      for (const t of tickets ?? []) {
        const rt = (t.release_title ?? "").toLowerCase();
        const isSpeakerRelease =
          rt.includes("speaker pass") || rt.includes("speaker guest") || rt.includes("guest pass");
        if (!isSpeakerRelease) continue;
        const bucket =
          registeredBySlug.get(t.event_slug) ?? { emails: new Set<string>(), ids: new Set<string>() };
        const e = normEmail(t.email);
        if (e) bucket.emails.add(e);
        bucket.ids.add(t.id);
        registeredBySlug.set(t.event_slug, bucket);
      }
    }

    const decorated = speakers.map((s) => {
      const ev = s.event_id ? eventById.get(s.event_id) : null;
      const bucket = ev?.tito_slug ? registeredBySlug.get(ev.tito_slug) : null;
      const email = normEmail(s.email);
      const in_tito = Boolean(
        bucket && ((email && bucket.emails.has(email)) || (s.source_ticket_id && bucket.ids.has(s.source_ticket_id))),
      );
      return { ...s, in_tito, event: ev ?? null };
    });

    return { board, columns: columns ?? [], speakers: decorated };
  });

export const addBoardColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ board_id: z.string().uuid(), name: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: last } = await context.supabase
      .from("speaker_board_columns")
      .select("position")
      .eq("board_id", data.board_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: row, error } = await context.supabase
      .from("speaker_board_columns")
      .insert({
        board_id: data.board_id,
        name: data.name,
        position: (last?.position ?? -1) + 1,
        kind: null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const renameBoardColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), name: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("speaker_board_columns")
      .update({ name: data.name })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderBoardColumns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ board_id: z.string().uuid(), ordered_ids: z.array(z.string().uuid()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    for (let i = 0; i < data.ordered_ids.length; i++) {
      const { error } = await context.supabase
        .from("speaker_board_columns")
        .update({ position: i })
        .eq("id", data.ordered_ids[i])
        .eq("board_id", data.board_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Deleting a column moves its cards to the board's first remaining column. */
export const deleteBoardColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: col, error } = await context.supabase
      .from("speaker_board_columns")
      .select("id, board_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!col) throw new Error("Column not found");

    const { data: rest } = await context.supabase
      .from("speaker_board_columns")
      .select("id")
      .eq("board_id", col.board_id)
      .neq("id", col.id)
      .order("position", { ascending: true })
      .limit(1);
    const fallback = rest?.[0]?.id ?? null;

    const { error: mvErr } = await context.supabase
      .from("speakers")
      .update({ board_column_id: fallback })
      .eq("board_column_id", col.id);
    if (mvErr) throw new Error(mvErr.message);

    const { error: delErr } = await context.supabase
      .from("speaker_board_columns")
      .delete()
      .eq("id", col.id);
    if (delErr) throw new Error(delErr.message);
    return { ok: true, moved_to: fallback };
  });

/**
 * Move a card. When the target column carries a semantic kind we mirror it
 * onto speakers.status (the source of truth); custom columns leave it alone.
 */
export const moveSpeakerToColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ speaker_id: z.string().uuid(), column_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: col, error } = await context.supabase
      .from("speaker_board_columns")
      .select("id, kind")
      .eq("id", data.column_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!col) throw new Error("Column not found");

    const patch: Record<string, unknown> = { board_column_id: col.id };
    const status = statusForKind(col.kind);
    if (status) patch.status = status;

    const { error: upErr } = await context.supabase
      .from("speakers")
      .update(patch as never)
      .eq("id", data.speaker_id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

/** Self-set "On site" flag, stored on the existing bio_and_headshot_received column. */
export const setSpeakerOnSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ speaker_id: z.string().uuid(), on_site: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("speakers")
      .update({ bio_and_headshot_received: data.on_site })
      .eq("id", data.speaker_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Explicit, user-driven merge. Survivor gains any field it is missing. */
export const mergeSpeakers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ survivor_id: z.string().uuid(), loser_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.survivor_id === data.loser_id) throw new Error("Pick two different records");
    const { data: rows, error } = await context.supabase
      .from("speakers")
      .select("*")
      .in("id", [data.survivor_id, data.loser_id]);
    if (error) throw new Error(error.message);
    const survivor = rows?.find((r) => r.id === data.survivor_id);
    const loser = rows?.find((r) => r.id === data.loser_id);
    if (!survivor || !loser) throw new Error("Speaker not found");

    const skip = new Set(["id", "created_at", "updated_at", "event_id"]);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(loser)) {
      if (skip.has(k)) continue;
      const current = (survivor as Record<string, unknown>)[k];
      if ((current === null || current === undefined || current === "") && v !== null && v !== "") {
        patch[k] = v;
      }
    }
    if (Object.keys(patch).length) {
      const { error: upErr } = await context.supabase
        .from("speakers")
        .update(patch as never)
        .eq("id", survivor.id);
      if (upErr) throw new Error(upErr.message);
    }
    const { error: delErr } = await context.supabase
      .from("speakers")
      .delete()
      .eq("id", loser.id);
    if (delErr) throw new Error(delErr.message);
    return { ok: true, merged_fields: Object.keys(patch) };
  });

/** Manually add a speaker card to a board column. */
export const createBoardSpeaker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        board_id: z.string().uuid(),
        column_id: z.string().uuid(),
        name: z.string().min(1),
        title: z.string().nullable().optional(),
        company: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        source: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { findOrMergeSpeaker } = await import("@/lib/speaker-dedupe.server");

    const { data: board, error: bErr } = await context.supabase
      .from("speaker_boards")
      .select("id, event_id")
      .eq("id", data.board_id)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!board?.event_id)
      throw new Error("This board isn't linked to an event, so speakers can't be added to it.");

    const { data: col, error: cErr } = await context.supabase
      .from("speaker_board_columns")
      .select("id, kind")
      .eq("id", data.column_id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!col) throw new Error("Column not found");

    const status = statusForKind(col.kind) ?? "new";
    const { row } = await findOrMergeSpeaker(context.supabase, {
      event_id: board.event_id,
      name: data.name.trim(),
      title: data.title?.trim() || null,
      company: data.company?.trim() || null,
      email: data.email?.trim() || null,
      status,
      banner_status: "not_started",
      linkedin_post_confirmed: false,
      source: data.source?.trim() || "manual",
      board_column_id: col.id,
    });
    if (row?.board_column_id !== col.id) {
      await context.supabase
        .from("speakers")
        .update({ board_column_id: col.id })
        .eq("id", row.id);
    }
    return row;
  });

/**
 * Remove a card. By default we only take it off the board (the speaker record
 * survives); `delete_record` deletes the speaker outright.
 */
export const removeSpeakerFromBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ speaker_id: z.string().uuid(), delete_record: z.boolean().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.delete_record) {
      const { error } = await context.supabase
        .from("speakers")
        .delete()
        .eq("id", data.speaker_id);
      if (error) throw new Error(error.message);
      return { ok: true, deleted: true };
    }
    const { error } = await context.supabase
      .from("speakers")
      .update({ board_column_id: null })
      .eq("id", data.speaker_id);
    if (error) throw new Error(error.message);
    return { ok: true, deleted: false };
  });

/** Asana projects the connected account can see, for the import picker. */
export const listAsanaProjectsForImport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listAsanaProjects } = await import("@/lib/asana-board-import.server");
    try {
      return { connected: true as const, projects: await listAsanaProjects() };
    } catch (e) {
      console.error("Asana project list failed", e);
      return {
        connected: false as const,
        projects: [] as Array<{ gid: string; name: string; workspace: string }>,
        error: e instanceof Error ? e.message : "Asana request failed",
      };
    }
  });

/** Import an Asana project's tasks onto this board as speaker cards. */
export const importAsanaBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ board_id: z.string().uuid(), project: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { importAsanaProjectToBoard, parseAsanaProject } = await import(
      "@/lib/asana-board-import.server"
    );
    const gid = parseAsanaProject(data.project);
    if (!gid) throw new Error("Couldn't read an Asana project id from that link.");
    return importAsanaProjectToBoard(context.supabase, {
      board_id: data.board_id,
      project_gid: gid,
      project_url: /^https?:/i.test(data.project.trim()) ? data.project.trim() : null,
    });
  });

/** Save (or clear) the Asana board link this board stays synced with. */
export const setBoardAsanaLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ board_id: z.string().uuid(), project: z.string().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { parseAsanaProject } = await import("@/lib/asana-board-import.server");
    const raw = data.project?.trim() ?? "";
    const patch = raw
      ? {
          asana_project_gid: parseAsanaProject(raw),
          asana_project_url: /^https?:/i.test(raw) ? raw : null,
        }
      : { asana_project_gid: null, asana_project_url: null, asana_last_synced_at: null };
    if (raw && !patch.asana_project_gid)
      throw new Error("Couldn't read an Asana project id from that link.");
    const { error } = await context.supabase
      .from("speaker_boards")
      .update(patch as never)
      .eq("id", data.board_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Re-pull columns, cards and status from the board's saved Asana link. */
export const refreshBoardFromAsana = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ board_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { importAsanaProjectToBoard } = await import("@/lib/asana-board-import.server");
    const { data: board, error } = await context.supabase
      .from("speaker_boards")
      .select("id, asana_project_gid")
      .eq("id", data.board_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!board?.asana_project_gid)
      throw new Error("No Asana board is linked yet — use Import from Asana once to link one.");
    return importAsanaProjectToBoard(context.supabase, {
      board_id: board.id,
      project_gid: board.asana_project_gid,
    });
  });

/**
 * Summary of an event's speaker board for the event page: board id, the saved
 * Asana link, and how many people are confirmed vs still prospective.
 */
export const getEventBoardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: board, error } = await context.supabase
      .from("speaker_boards")
      .select("*")
      .eq("event_id", data.event_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!board) return { board: null, confirmed: 0, prospective: 0, declined: 0 };

    const { data: cols } = await context.supabase
      .from("speaker_board_columns")
      .select("id")
      .eq("board_id", board.id);
    const ids = (cols ?? []).map((c) => c.id);
    let confirmed = 0;
    let prospective = 0;
    let declined = 0;
    if (ids.length) {
      const { data: rows } = await context.supabase
        .from("speakers")
        .select("id, status")
        .in("board_column_id", ids);
      for (const r of rows ?? []) {
        if (r.status === "confirmed") confirmed++;
        else if (r.status === "declined") declined++;
        else prospective++;
      }
    }
    return { board, confirmed, prospective, declined };
  });
