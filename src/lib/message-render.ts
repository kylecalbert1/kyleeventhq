/**
 * Message Templates rendering helpers (Tito copy-paste flow).
 *
 * IMPORTANT: this renderer ONLY ever touches [[double_square_bracket]]
 * placeholders. Tito's own {{curly_brace}} merge tags (including triple
 * braces and block helpers like {{#any_incomplete_tickets}}) MUST pass
 * through completely untouched.
 *
 * Never use renderTemplate() from "@/lib/gmail" on these bodies - it
 * substitutes {{ ... }} and would destroy Tito's merge tags.
 */

export type Stream = "speakers" | "attendees" | "incomplete_tickets" | "everyone";

export const STREAMS: Stream[] = ["speakers", "attendees", "incomplete_tickets", "everyone"];

export const streamMeta: Record<
  Stream,
  { label: string; chip: string; dot: string }
> = {
  speakers: {
    label: "Speakers",
    chip: "bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-200",
    dot: "bg-violet-500",
  },
  attendees: {
    label: "Attendees",
    chip: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200",
    dot: "bg-sky-500",
  },
  incomplete_tickets: {
    label: "Incomplete tickets",
    chip: "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200",
    dot: "bg-amber-500",
  },
  everyone: {
    label: "Everyone",
    chip: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
    dot: "bg-emerald-500",
  },
};

/* ------------------------------------------------------------------ */
/* Dates and weeks-out                                                 */
/* ------------------------------------------------------------------ */

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function parseISODate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysUntil(eventDateIso: string | null | undefined, from = new Date()): number | null {
  const d = parseISODate(eventDateIso);
  if (!d) return null;
  return Math.round((startOfDay(d).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

/** "12 weeks out" | "1 week out" | "This week" | "Event day" | "2 weeks ago" */
export function weeksOutLabel(eventDateIso: string | null | undefined, from = new Date()): string | null {
  const d = daysUntil(eventDateIso, from);
  if (d === null) return null;
  if (d === 0) return "Event day";
  if (d > 0) {
    const w = Math.floor(d / 7);
    if (w === 0) return "This week";
    if (w === 1) return "1 week out";
    return `${w} weeks out`;
  }
  const w = Math.floor(-d / 7);
  if (w === 0) return "Just finished";
  if (w === 1) return "1 week ago";
  return `${w} weeks ago`;
}

/** Tone for the weeks-out chip. */
export function weeksOutTone(eventDateIso: string | null | undefined, from = new Date()) {
  const d = daysUntil(eventDateIso, from);
  if (d === null) return "neutral" as const;
  if (d < 0) return "neutral" as const;
  if (d === 0) return "red" as const;
  if (d <= 14) return "red" as const;
  if (d <= 42) return "amber" as const;
  return "green" as const;
}

/** Short label for a template's weeks_out slot. */
export function weeksSlotLabel(weeksOut: number | null): string {
  if (weeksOut === null) return "Ad hoc";
  if (weeksOut === 0) return "Event day";
  if (weeksOut > 0) return weeksOut === 1 ? "1 week out" : `${weeksOut} weeks out`;
  const a = Math.abs(weeksOut);
  return a === 1 ? "1 week after" : `${a} weeks after`;
}

/** The calendar date a template should go out for a given event. */
export function targetDateFor(eventDateIso: string | null | undefined, weeksOut: number | null): Date | null {
  const base = parseISODate(eventDateIso);
  if (!base || weeksOut === null) return null;
  const d = new Date(base);
  d.setDate(d.getDate() - weeksOut * 7);
  return d;
}

export type TimelineStatus = "sent" | "due" | "overdue" | "upcoming" | "no_date";

export function statusFor(target: Date | null, sentAt: string | null, from = new Date()): TimelineStatus {
  if (sentAt) return "sent";
  if (!target) return "no_date";
  const diff = Math.round((startOfDay(target).getTime() - startOfDay(from).getTime()) / 86_400_000);
  if (diff > 6) return "upcoming";
  if (diff >= -6) return "due";
  return "overdue";
}

export function formatDateLong(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(d);
}

export function formatDateShort(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
}

/* ------------------------------------------------------------------ */
/* [[placeholder]] resolution                                          */
/* ------------------------------------------------------------------ */

export type MessageEvent = {
  id: string;
  name: string;
  business_line: "AIAI" | "CSC";
  format: "in_person" | "virtual";
  event_date: string | null;
  venue: string | null;
  external_agenda_url: string | null;
  event_site_url?: string | null;
  venue_url?: string | null;
  venue_address?: string | null;
  registration_time?: string | null;
  sessions_start_time?: string | null;
  venue_notes?: string | null;
  join_instructions?: string | null;
};

export const PLACEHOLDER_HELP: { key: string; description: string }[] = [
  { key: "event_name", description: "Event name" },
  { key: "event_site_url", description: "Event website URL" },
  { key: "event_date_long", description: 'Event date, e.g. "June 25, 2026"' },
  { key: "event_day_name", description: 'Weekday of the event, e.g. "Thursday"' },
  { key: "agenda_url", description: "External agenda link" },
  { key: "venue_name", description: "Venue name" },
  { key: "venue_url", description: "Venue website URL" },
  { key: "venue_address", description: "Venue address" },
  { key: "registration_time", description: 'Registration opens, e.g. "8AM"' },
  { key: "sessions_start_time", description: 'Sessions start, e.g. "9"' },
  { key: "venue_notes", description: "One-off venue requirements" },
  { key: "join_instructions", description: "Virtual joining instructions" },
  { key: "signoff", description: "Your first name plus the team name (automatic)" },
];

/** Human label for the event edit form field behind each placeholder. */
export const PLACEHOLDER_FIELD_LABEL: Record<string, string> = {
  event_name: "Name",
  event_site_url: "Event site URL",
  event_date_long: "Event date",
  event_day_name: "Event date",
  agenda_url: "External agenda link",
  venue_name: "Venue",
  venue_url: "Venue URL",
  venue_address: "Venue address",
  registration_time: "Registration time",
  sessions_start_time: "Sessions start time",
  venue_notes: "Venue notes",
  join_instructions: "Join instructions",
};

export function teamNameFor(businessLine: "AIAI" | "CSC"): string {
  return businessLine === "AIAI" ? "The AI AI Team" : "Customer Success Collective Team";
}

export function buildSignoff(userFirstName: string, businessLine: "AIAI" | "CSC"): string {
  return `${userFirstName} & ${teamNameFor(businessLine)}`;
}

export function buildPlaceholderValues(
  event: MessageEvent,
  userFirstName: string,
): Record<string, string | null> {
  const d = parseISODate(event.event_date);
  return {
    event_name: event.name || null,
    event_site_url: event.event_site_url || null,
    event_date_long: d ? formatDateLong(d) : null,
    event_day_name: d ? new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(d) : null,
    agenda_url: event.external_agenda_url || null,
    venue_name: event.venue || null,
    venue_url: event.venue_url || null,
    venue_address: event.venue_address || null,
    registration_time: event.registration_time || null,
    sessions_start_time: event.sessions_start_time || null,
    venue_notes: event.venue_notes || null,
    join_instructions: event.join_instructions || null,
    signoff: buildSignoff(userFirstName, event.business_line),
  };
}

const PLACEHOLDER_RE = /\[\[\s*([a-z0-9_]+)\s*\]\]/gi;

/**
 * Replace only [[placeholders]]. {{...}} is never inspected or touched.
 * Returns the rendered text plus the list of placeholders that had no value.
 */
export function renderPlaceholders(
  text: string,
  values: Record<string, string | null>,
): { text: string; missing: string[]; unknown: string[] } {
  const missing = new Set<string>();
  const unknown = new Set<string>();
  const out = (text ?? "").replace(PLACEHOLDER_RE, (whole, rawKey: string) => {
    const key = rawKey.toLowerCase();
    if (!(key in values)) {
      unknown.add(key);
      return whole;
    }
    const v = values[key];
    if (v === null || v === undefined || String(v).trim() === "") {
      missing.add(key);
      return whole;
    }
    return String(v);
  });
  return { text: out, missing: [...missing], unknown: [...unknown] };
}

export function renderMessage(
  template: { subject: string; body_markdown: string },
  event: MessageEvent,
  userFirstName: string,
) {
  const values = buildPlaceholderValues(event, userFirstName);
  const subject = renderPlaceholders(template.subject ?? "", values);
  const body = renderPlaceholders(template.body_markdown ?? "", values);
  const missing = [...new Set([...subject.missing, ...body.missing])];
  const unknown = [...new Set([...subject.unknown, ...body.unknown])];
  return { subject: subject.text, body: body.text, missing, unknown };
}

/* ------------------------------------------------------------------ */
/* Tiny markdown preview renderer                                      */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary underline">${label}</a>`,
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return out;
}

/** Minimal markdown to HTML, enough for a faithful preview of these bodies. */
export function markdownToHtml(md: string): string {
  const lines = (md ?? "").split(/\r?\n/);
  const html: string[] = [];
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = () => {
    if (para.length) {
      html.push(`<p>${para.map(inline).join("<br />")}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      html.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`);
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushPara();
      flushList();
      const level = h[1].length + 2;
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      flushPara();
      list.push(li[1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return html.join("\n");
}
