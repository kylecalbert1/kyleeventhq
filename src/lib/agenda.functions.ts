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

// URL import - fetch a public Acara-style agenda page server-side and parse rows.
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

// Sentinel chars used to mark hyperlinked speaker names before we collapse
// everything else to plain text, so we can tell "this text was a linked
// person" apart from a plain session title once tags are gone.
const SPK_OPEN = "\u0001";
const SPK_CLOSE = "\u0002";

function markSpeakerAnchors(html: string): string {
  return html.replace(
    /<a\b[^>]*href="[^"]*\/speaker\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, inner) => `${SPK_OPEN}${String(inner).replace(/<[^>]+>/g, "")}${SPK_CLOSE}`,
  );
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

const NOISE_LINE_RE = /^(see the details|register now|secure your seat|get invited|sign in)$/i;
const STAGE_LABEL_RE = /^(main stage|exhibition\s*(&|and)\s*networking)$/i;
const DATE_HEADER_RE =
  /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(st|nd|rd|th)?$/i;

function parseAgendaHtml(html: string): ImportedAgendaRow[] {
  const marked = markSpeakerAnchors(html);
  const text = stripTags(marked);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const timeRe = /^(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))(?:\s*[-–to]+\s*(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm)))?\b/i;
  const speakerPrefixRe = /^(speaker[s]?|presenter[s]?|panelist[s]?|moderator|with)[:\s]/i;
  const trackRe = /^(track|stream|room|stage)[:\s-]+(.+)$/i;

  type Block = { start: string | null; end: string | null; buffer: string[]; track: string | null };
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let currentTrack: string | null = null;

  for (const line of lines) {
    const bareForDateCheck = line.split(SPK_OPEN).join("").split(SPK_CLOSE).join("");
    if (DATE_HEADER_RE.test(bareForDateCheck)) {
      // New day starting on the page - close the current block so trailing
      // text doesn't leak into it. Row order is preserved, and downstream
      // (AgendaBuilder's splitIntoDays / the day-decreasing-time heuristic)
      // already knows how to regroup rows into Day 1 / Day 2 from that order.
      cur = null;
      continue;
    }

    const tm = trackRe.exec(line);
    if (tm) {
      currentTrack = tm[2].trim();
      continue;
    }

    const m = timeRe.exec(line);
    if (m) {
      const start = parseTimeToken(m[1]);
      const end = m[2] ? parseTimeToken(m[2]) : null;
      const remainder = line.slice(m[0].length).trim().replace(/^[-–:]\s*/, "");
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
      if (NOISE_LINE_RE.test(l)) continue;

      if (l.includes(SPK_OPEN)) {
        // Hyperlinked speaker name, with ", Title, Company" trailing plain
        // text on the same line. Keep the whole thing - it gets split into
        // name vs. title/company later, at match time.
        const cleaned = l.split(SPK_OPEN).join("").split(SPK_CLOSE).join("");
        speakerLines.push(cleaned.trim());
        continue;
      }

      const tm2 = trackRe.exec(l);
      if (tm2) { inlineTrack = tm2[2].trim(); continue; }

      if (speakerPrefixRe.test(l)) { speakerLines.push(l.replace(speakerPrefixRe, "").trim()); continue; }

      if (STAGE_LABEL_RE.test(l)) continue; // stage/location noise (e.g. "Main stage"), not a real track

      titleLines.push(l);
    }

    const title = titleLines.join(" ").replace(/\s+/g, " ").trim() || null;
    const rawSpeakers = speakerLines.length > 0 ? speakerLines.join("\n") : null;
    let dur = 30;
    if (b.end) {
      const [sh, sm] = b.start.split(":").map(Number);
      const [eh, em] = b.end.split(":").map(Number);
      const d = eh * 60 + em - (sh * 60 + sm);
      if (d > 0) dur = d;
    }
    rows.push({
      start_time: b.start,
      duration_min: dur,
      session_type: classifyType(title ?? ""),
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

// Batch-generate one-sentence session descriptions via Lovable AI Gateway.
// Skips break-like sessions (returns null for those slots).
const BREAK_TYPES = new Set([
  "coffee_break",
  "break",
  "lunch",
  "happy_hour",
]);

export const generateAgendaDescriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        rows: z.array(
          z.object({
            title: z.string().nullable().optional(),
            session_type: z.string(),
            track: z.string().nullable().optional(),
            speakers: z.string().nullable().optional(),
          }),
        ),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // Build indices we actually want a description for
    const targets: Array<{ idx: number; title: string; session_type: string; track?: string | null; speakers?: string | null }> = [];
    data.rows.forEach((r, idx) => {
      if (BREAK_TYPES.has(r.session_type)) return;
      if (!r.title || !r.title.trim()) return;
      targets.push({ idx, title: r.title, session_type: r.session_type, track: r.track, speakers: r.speakers });
    });

    const out: Array<string | null> = data.rows.map(() => null);
    if (targets.length === 0) return { descriptions: out };

    const listing = targets
      .map((t, i) => {
        const parts = [
          `#${i + 1}`,
          `type=${SESSION_LABELS[t.session_type] ?? t.session_type}`,
          `title="${t.title.replace(/"/g, "'")}"`,
        ];
        if (t.track) parts.push(`track="${t.track}"`);
        if (t.speakers) parts.push(`speakers="${t.speakers}"`);
        return parts.join(" | ");
      })
      .join("\n");

    const prompt = `You are helping summarise a conference agenda. For each session below, write ONE short, plain-English sentence (max ~22 words) describing what the session is likely about, based only on its title, session type, track, and speaker/company hints. Do not invent facts, do not restate the title verbatim, and do not add hype words. Return STRICT JSON: {"descriptions":[{"n":1,"text":"..."}, ...]} with one entry per input in the same order.\n\nSessions:\n${listing}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You write concise, factual session blurbs for event agendas." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) throw new Error("AI rate limit - try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted - top up in Settings.");
    if (!res.ok) throw new Error(`AI error: ${res.status} ${res.statusText}`);

    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content ?? "{}";
    let parsed: { descriptions?: Array<{ n?: number; text?: string }> } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }
    for (const d of parsed.descriptions ?? []) {
      const n = Number(d.n);
      if (!Number.isFinite(n) || n < 1 || n > targets.length) continue;
      const t = (d.text ?? "").toString().trim();
      if (!t) continue;
      out[targets[n - 1].idx] = t;
    }
    return { descriptions: out };
  });
