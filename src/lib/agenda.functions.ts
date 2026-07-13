import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TEMPLATE_KEYS = ["csc_in_person", "aiai", "virtual"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const SESSION_TYPES = [
  "chairperson_remarks",
  "keynote",
  "panel",
  "sponsored_keynote",
  "roundtable",
  "workshop",
  "fireside_chat",
  "coffee_break",
  "break",
  "lunch",
  "happy_hour",
  "other",
] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const SESSION_LABELS: Record<string, string> = {
  chairperson_remarks: "Chairperson remarks",
  keynote: "Keynote",
  panel: "Panel",
  sponsored_keynote: "Sponsored keynote",
  roundtable: "Roundtable",
  workshop: "Workshop",
  fireside_chat: "Fireside chat",
  coffee_break: "Coffee break",
  break: "Break",
  lunch: "Lunch",
  happy_hour: "Happy hour",
  other: "Other",
};

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  csc_in_person: "CSC in-person",
  aiai: "AIAI",
  virtual: "Virtual",
};

export function isSponsorType(t: string) {
  return t === "sponsored_keynote";
}

const AgendaItemInput = z.object({
  event_id: z.string().uuid(),
  position: z.number().int(),
  start_time: z.string().nullable().optional(),
  duration_min: z.number().int().min(1),
  session_type: z.string().min(1),
  title: z.string().nullable().optional(),
  speaker_ids: z.array(z.string().uuid()).optional(),
  speaker_extra: z.string().nullable().optional(),
  av_requirements: z.string().nullable().optional(),
  track: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const listAgendaItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agenda_items")
      .select("*")
      .eq("event_id", data.event_id)
      .order("position");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createAgendaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AgendaItemInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("agenda_items")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateAgendaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), patch: AgendaItemInput.partial() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("agenda_items")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteAgendaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agenda_items")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkReplaceAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_id: z.string().uuid(),
        items: z.array(AgendaItemInput.omit({ event_id: true })),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const del = await context.supabase
      .from("agenda_items")
      .delete()
      .eq("event_id", data.event_id);
    if (del.error) throw new Error(del.error.message);
    if (data.items.length === 0) return { count: 0 };
    const rows = data.items.map((it) => ({ ...it, event_id: data.event_id }));
    const ins = await context.supabase.from("agenda_items").insert(rows);
    if (ins.error) throw new Error(ins.error.message);
    return { count: rows.length };
  });

// Templates
export const listAgendaTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agenda_templates")
      .select("*")
      .order("template_key")
      .order("position");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertAgendaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        template_key: z.string(),
        session_type: z.string(),
        minutes: z.number().int().min(1),
        position: z.number().int().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("agenda_templates")
      .upsert(data, { onConflict: "template_key,session_type" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// URL import — fetch a public Acara-style agenda page server-side and parse rows.
export type ImportedAgendaRow = {
  start_time: string | null;
  duration_min: number;
  session_type: string;
  title: string | null;
  track: string | null;
  raw_speakers: string | null;
};

const TYPE_ALIASES: Array<[RegExp, string]> = [
  [/chair(person)?|opening remark|closing remark|welcome|housekeeping/i, "chairperson_remarks"],
  [/sponsor(ed)?\s*keynote|sponsor\s*session|sponsor\s*talk/i, "sponsored_keynote"],
  [/fireside/i, "fireside_chat"],
  [/panel/i, "panel"],
  [/roundtable/i, "roundtable"],
  [/workshop/i, "workshop"],
  [/coffee/i, "coffee_break"],
  [/lunch/i, "lunch"],
  [/happy hour|networking|reception|drinks/i, "happy_hour"],
  [/break/i, "break"],
  [/keynote|fireside|talk|presentation|session/i, "keynote"],
];

function classifyType(label: string): string {
  if (!label) return "other";
  for (const [re, val] of TYPE_ALIASES) if (re.test(label)) return val;
  return "other";
}

function parseTimeToken(raw: string): string | null {
  const s = raw.trim();
  const m = s.match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/i) ?? s.match(/(\d{1,2})\s*(am|pm)/i);
  if (!m) return null;
  let h = Number(m[1]);
  const mm = m[2] && /^\d{2}$/.test(m[2]) ? Number(m[2]) : 0;
  const ampm = (m[m.length - 1] || "").toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h > 23 || mm > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parseAgendaHtml(html: string): ImportedAgendaRow[] {
  const text = stripTags(html);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const timeRe = /^(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))(?:\s*[-–—to]+\s*(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm)))?\b/i;
  const speakerRe = /^(speaker[s]?|presenter[s]?|panelist[s]?|moderator|with)[:\s]/i;
  const trackRe = /^(track|stream|room|stage)[:\s-]+(.+)$/i;

  type Block = { start: string | null; end: string | null; buffer: string[]; track: string | null };
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let currentTrack: string | null = null;

  for (const line of lines) {
    const tm = trackRe.exec(line);
    if (tm) {
      currentTrack = tm[2].trim();
      continue;
    }
    const m = timeRe.exec(line);
    if (m) {
      const start = parseTimeToken(m[1]);
      const end = m[2] ? parseTimeToken(m[2]) : null;
      const remainder = line.slice(m[0].length).trim().replace(/^[-–—:]\s*/, "");
      cur = { start, end, buffer: remainder ? [remainder] : [], track: currentTrack };
      blocks.push(cur);
    } else if (cur) {
      cur.buffer.push(line);
    }
  }

  const rows: ImportedAgendaRow[] = [];
  for (const b of blocks) {
    if (!b.start) continue;
    const speakerLines: string[] = [];
    const titleLines: string[] = [];
    let inlineTrack: string | null = null;
    for (const l of b.buffer) {
      const tm = trackRe.exec(l);
      if (tm) { inlineTrack = tm[2].trim(); continue; }
      if (speakerRe.test(l)) speakerLines.push(l.replace(speakerRe, "").trim());
      else titleLines.push(l);
    }
    const title = titleLines.join(" ").replace(/\s+/g, " ").trim() || null;
    const rawSpeakers = speakerLines.join(", ").replace(/\s+/g, " ").trim() || null;
    let dur = 30;
    if (b.end) {
      const [sh, sm] = b.start.split(":").map(Number);
      const [eh, em] = b.end.split(":").map(Number);
      const d = eh * 60 + em - (sh * 60 + sm);
      if (d > 0) dur = d;
    }
    const classifySource = (title ?? "") + " " + (b.buffer.join(" "));
    rows.push({
      start_time: b.start,
      duration_min: dur,
      session_type: classifyType(classifySource),
      title,
      track: b.track ?? inlineTrack,
      raw_speakers: rawSpeakers,
    });
  }

  // Fill durations from next start when end was missing
  for (let i = 0; i < rows.length - 1; i++) {
    if (rows[i].duration_min === 30 && rows[i].start_time && rows[i + 1].start_time) {
      const [sh, sm] = rows[i].start_time!.split(":").map(Number);
      const [nh, nm] = rows[i + 1].start_time!.split(":").map(Number);
      const d = nh * 60 + nm - (sh * 60 + sm);
      if (d > 0 && d <= 240) rows[i].duration_min = d;
    }
  }
  return rows;
}

export const importAgendaFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ url: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    const res = await fetch(data.url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; EventHQBot/1.0; +https://kyleeventhq.lovable.app)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    const html = await res.text();
    const rows = parseAgendaHtml(html);
    if (rows.length === 0) {
      throw new Error("Couldn't find any agenda rows on that page.");
    }
    return { rows };
  });
