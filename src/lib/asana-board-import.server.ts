/**
 * Asana → speaker board import.
 *
 * Pulls the tasks of an Asana project and turns them into speaker cards on a
 * board, mapping Asana sections onto board columns where the names reasonably
 * match and dropping everything else into the first column.
 */

const ASANA_GATEWAY = "https://connector-gateway.lovable.dev/asana";

type AnyClient = { from: (t: string) => any };

function keys() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const asanaKey = process.env.ASANA_API_KEY;
  if (!lovableKey || !asanaKey) throw new Error("Asana is not connected for this project.");
  return { lovableKey, asanaKey };
}

async function asanaGet(path: string, params: Record<string, string>) {
  const { lovableKey, asanaKey } = keys();
  const url = new URL(`${ASANA_GATEWAY}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": asanaKey,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Asana request failed [${res.status}] ${path}: ${body}`);
    throw new Error(`Asana request failed [${res.status}]: ${body}`);
  }
  return (await res.json()) as { data?: any[] };
}

/** Accepts a raw gid or any Asana project/board URL and returns the project gid. */
export function parseAsanaProject(input: string): string | null {
  const raw = input.trim();
  if (/^\d+$/.test(raw)) return raw;
  const m =
    raw.match(/\/0\/(\d+)/) ||
    raw.match(/projects?\/(\d+)/) ||
    raw.match(/\/(\d{10,})/);
  return m ? m[1] : null;
}

export async function listAsanaProjects() {
  const ws = await asanaGet("/workspaces", { limit: "20", opt_fields: "gid,name" });
  const out: Array<{ gid: string; name: string; workspace: string }> = [];
  for (const w of ws.data ?? []) {
    const projects = await asanaGet("/projects", {
      workspace: w.gid,
      limit: "100",
      archived: "false",
      opt_fields: "gid,name",
    });
    for (const p of projects.data ?? []) {
      out.push({ gid: p.gid, name: p.name, workspace: w.name });
    }
  }
  return out;
}

function norm(s: string | null | undefined) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

import { inferColumnKind, effectiveColumnKind } from "@/lib/board-status";

/** Picks the board column that best matches an Asana section name. */
export function matchColumn(
  sectionName: string | null | undefined,
  columns: Array<{ id: string; name: string; kind: string | null }>,
): { id: string; name?: string; kind: string | null } {
  const first = columns[0];
  const n = norm(sectionName);
  if (!n) return first;

  const exact = columns.find((c) => norm(c.name) === n);
  if (exact) return exact;

  const partial = columns.find((c) => {
    const cn = norm(c.name);
    return cn.length > 2 && (n.includes(cn) || cn.includes(n));
  });
  if (partial) return partial;

  const inferred = inferColumnKind(sectionName);
  if (inferred) {
    const col = columns.find((c) => effectiveColumnKind(c.kind, c.name) === inferred);
    if (col) return col;
  }
  return first;
}

/** Splits "Jane Doe - VP Eng, Acme" style Asana task names into parts. */
export function parseTaskName(name: string): { name: string; title: string | null; company: string | null } {
  const cleaned = name.replace(/\s+/g, " ").trim();
  const parts = cleaned.split(/\s+[-–—|]\s+|\s*\(\s*/);
  const person = (parts[0] ?? cleaned).replace(/\)$/, "").trim();
  const rest = cleaned.slice(person.length).replace(/^[\s\-–—|(]+/, "").replace(/\)$/, "").trim();
  if (!rest) return { name: person, title: null, company: null };
  const bits = rest.split(/\s*[,@]\s*|\s+at\s+/i).filter(Boolean);
  if (bits.length >= 2) return { name: person, title: bits[0].trim(), company: bits.slice(1).join(", ").trim() };
  return { name: person, title: null, company: bits[0]?.trim() ?? null };
}

export async function importAsanaProjectToBoard(
  supabase: AnyClient,
  opts: { board_id: string; project_gid: string; project_url?: string | null },
) {
  const { findOrMergeSpeaker } = await import("@/lib/speaker-dedupe.server");
  const { statusForKind } = await import("@/lib/board-status");

  const { data: board, error: bErr } = await supabase
    .from("speaker_boards")
    .select("id, event_id")
    .eq("id", opts.board_id)
    .maybeSingle();
  if (bErr) throw new Error(bErr.message);
  if (!board) throw new Error("Board not found");
  if (!board.event_id)
    throw new Error("This board isn't linked to an event, so speakers can't be imported into it.");

  const { data: columns, error: cErr } = await supabase
    .from("speaker_board_columns")
    .select("id, name, kind, position")
    .eq("board_id", board.id)
    .order("position", { ascending: true });
  if (cErr) throw new Error(cErr.message);
  if (!columns?.length) throw new Error("This board has no columns yet.");

  // Asana is the source of truth for structure: any section without a
  // reasonable counterpart on the board becomes a new column.
  let boardColumns = columns as Array<{ id: string; name: string; kind: string | null; position: number }>;
  const sections = await asanaGet(`/projects/${opts.project_gid}/sections`, {
    limit: "100",
    opt_fields: "gid,name",
  });
  let nextPos = Math.max(-1, ...boardColumns.map((c) => c.position)) + 1;
  let createdColumns = 0;
  for (const sec of sections.data ?? []) {
    const n = norm(sec.name);
    if (!n) continue;
    const hit = matchColumn(sec.name, boardColumns);
    const exact = norm(hit.name ?? "") === n;
    const inferred = inferColumnKind(sec.name);
    const synonym = Boolean(inferred && effectiveColumnKind(hit.kind, hit.name) === inferred);
    if (exact || synonym) continue;
    const { data: newCol } = await supabase
      .from("speaker_board_columns")
      .insert({
        board_id: board.id,
        name: String(sec.name).trim(),
        position: nextPos++,
        kind: inferColumnKind(sec.name),
      })
      .select("id, name, kind, position")
      .single();
    if (newCol) {
      boardColumns = [...boardColumns, newCol];
      createdColumns++;
    }
  }

  const body = await asanaGet("/tasks", {
    project: opts.project_gid,
    limit: "100",
    opt_fields: "gid,name,notes,completed,memberships.section.name",
  });
  const tasks = body.data ?? [];

  const { data: existingRows } = await supabase
    .from("speakers")
    .select("id, name, board_column_id")
    .eq("event_id", board.event_id);
  const byName = new Map<string, any>();
  for (const r of existingRows ?? []) byName.set(norm(r.name), r);

  let created = 0;
  let matched = 0;
  let unmatchedSections = 0;

  for (const t of tasks) {
    const rawName = (t.name ?? "").trim();
    if (!rawName) continue;
    const section = t.memberships?.[0]?.section?.name ?? null;
    const col = matchColumn(section, boardColumns as any);
    if (col.id === boardColumns[0].id && norm(section) && norm(boardColumns[0].name) !== norm(section)) {
      unmatchedSections++;
    }
    const parsed = parseTaskName(rawName);
    const existing = byName.get(norm(parsed.name));

    if (existing) {
      const patch: Record<string, unknown> = { board_column_id: col.id };
      const status = statusForKind(effectiveColumnKind(col.kind, col.name));
      if (status) patch.status = status;
      await supabase.from("speakers").update(patch).eq("id", existing.id);
      matched++;
      continue;
    }

    const status = statusForKind(effectiveColumnKind(col.kind, col.name)) ?? "new";
    const { row } = await findOrMergeSpeaker(supabase, {
      event_id: board.event_id,
      name: parsed.name,
      title: parsed.title,
      company: parsed.company,
      status,
      banner_status: "not_started",
      linkedin_post_confirmed: false,
      notes: t.notes ? String(t.notes).slice(0, 2000) : null,
      source: "asana",
      board_column_id: col.id,
    });
    if (row?.board_column_id !== col.id) {
      await supabase.from("speakers").update({ board_column_id: col.id }).eq("id", row.id);
    }
    byName.set(norm(parsed.name), row);
    created++;
  }

  await supabase
    .from("speaker_boards")
    .update({
      asana_project_gid: opts.project_gid,
      ...(opts.project_url ? { asana_project_url: opts.project_url } : {}),
      asana_last_synced_at: new Date().toISOString(),
    })
    .eq("id", board.id);

  return {
    created,
    matched,
    total: tasks.length,
    unmatched_sections: unmatchedSections,
    created_columns: createdColumns,
  };
}
