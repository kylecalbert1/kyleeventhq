/**
 * Builds the human-readable timeline shown on a speaker's detail card.
 *
 * The raw `speaker_activity_log` is a technical audit trail (snake_case event
 * types, one row per field flip). This turns it into something a person can
 * skim: plain-language labels, real messages (with a subject hint) mixed in,
 * consecutive near-duplicates collapsed into a single "N messages" entry, and
 * internal bookkeeping dropped entirely.
 */

export type TimelineKind =
  | "added"
  | "status"
  | "banner"
  | "sent"
  | "received"
  | "message";

export type TimelineEntry = {
  id: string;
  kind: TimelineKind;
  title: string;
  note?: string;
  at: string;
  /** >1 when consecutive similar events were collapsed. */
  count: number;
  /** Oldest timestamp in a collapsed group. */
  fromAt?: string;
};

export type ActivityRow = {
  id: string;
  event_type: string;
  note: string | null;
  created_at: string;
};

export type SendRow = {
  id: string;
  subject: string | null;
  template_type: string | null;
  sent_at: string;
};

const STATUS_WORDS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  in_conversation: "In conversation",
  responded: "Responded",
  confirmed: "Confirmed",
  declined: "Declined",
};

const BANNER_WORDS: Record<string, string> = {
  not_started: "not started",
  created: "created",
  sent: "sent to speaker",
  confirmed_live: "confirmed live",
};

function pretty(map: Record<string, string>, raw: string): string {
  const k = raw.trim().toLowerCase();
  return map[k] ?? raw.trim().replace(/_/g, " ");
}

/** "contacted → confirmed" / "none → confirmed" */
function splitTransition(note: string | null): [string, string] | null {
  if (!note) return null;
  const parts = note.split(/→|->/).map((p) => p.trim());
  if (parts.length !== 2 || !parts[1]) return null;
  return [parts[0], parts[1]];
}

function fromActivity(a: ActivityRow): TimelineEntry | null {
  switch (a.event_type) {
    case "status_changed": {
      const t = splitTransition(a.note);
      if (!t) return null;
      const [from, to] = t;
      const toLabel = pretty(STATUS_WORDS, to);
      return {
        id: a.id,
        kind: "status",
        title: `Moved to ${toLabel}`,
        note: from && from !== "none" ? `from ${pretty(STATUS_WORDS, from)}` : undefined,
        at: a.created_at,
        count: 1,
      };
    }
    case "banner_status_changed": {
      const t = splitTransition(a.note);
      if (!t) return null;
      return {
        id: a.id,
        kind: "banner",
        title: `Banner ${pretty(BANNER_WORDS, t[1])}`,
        at: a.created_at,
        count: 1,
      };
    }
    case "message_direction_changed": {
      const inbound = /inbound/i.test(a.note ?? "");
      return {
        id: a.id,
        kind: inbound ? "received" : "message",
        title: inbound ? "Reply received" : "Message activity",
        at: a.created_at,
        count: 1,
      };
    }
    default:
      // Internal bookkeeping (draft generation, sync noise, …) — not useful here.
      return null;
  }
}

function collapse(entries: TimelineEntry[]): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const e of entries) {
    const prev = out[out.length - 1];
    const sameGroup =
      prev &&
      prev.kind === e.kind &&
      (e.kind === "message" || e.kind === "received" || e.kind === "sent") &&
      prev.title.replace(/^\d+ /, "") !== "" &&
      (e.kind !== "sent" || prev.note === e.note);
    if (sameGroup) {
      prev.count += 1;
      prev.fromAt = e.at;
      prev.title =
        e.kind === "received"
          ? `${prev.count} replies received`
          : e.kind === "sent"
            ? `${prev.count} emails sent`
            : `${prev.count} message updates`;
      continue;
    }
    out.push({ ...e });
  }
  return out;
}

export function buildSpeakerTimeline(
  speaker: { created_at?: string | null; last_message_at?: string | null },
  activity: ActivityRow[],
  sends: SendRow[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const a of activity) {
    const e = fromActivity(a);
    if (e) entries.push(e);
  }

  for (const s of sends) {
    entries.push({
      id: `send-${s.id}`,
      kind: "sent",
      title: "Email sent",
      note: s.subject?.trim() || undefined,
      at: s.sent_at,
      count: 1,
    });
  }

  // Logged sends are the richer record of an outbound touch — when one lands
  // within a couple of minutes of a generic "message activity" row, drop the row.
  const sendTimes = entries.filter((e) => e.kind === "sent").map((e) => +new Date(e.at));
  const filtered = entries.filter(
    (e) =>
      e.kind !== "message" ||
      !sendTimes.some((t) => Math.abs(t - +new Date(e.at)) < 5 * 60_000),
  );

  filtered.sort((a, b) => +new Date(b.at) - +new Date(a.at));

  const collapsed = collapse(filtered);

  if (speaker.created_at) {
    collapsed.push({
      id: "created",
      kind: "added",
      title: "Added to pipeline",
      at: speaker.created_at,
      count: 1,
    });
  }
  return collapsed;
}
