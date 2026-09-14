import { daysBetween, normalizeSpeakerStatus } from "@/lib/status";

export type SpeakerStageRecord = {
  id: string;
  status?: string | null;
  call_scheduled?: boolean | null;
};

/**
 * Condensed "do I need to follow up right now?" read for the speaker detail
 * panel. Uses the same tiering as the outreach alerts on speaker list cards
 * (inbound >2 days = reply needed, outbound >7 days = follow up) with an
 * extra "at risk" tier once it has gone stale for weeks.
 */
export type FollowUpSummary = {
  tone: "ok" | "amber" | "rose" | "slate";
  label: string;
  /** Pill classes matching the StatusPill style used across the app. */
  cls: string;
  at: string | null;
  direction: "outbound" | "inbound" | null;
  days: number | null;
  /** One plain-language sentence saying whether follow-up looks needed. */
  line: string;
};

const TONE_CLS: Record<FollowUpSummary["tone"], string> = {
  ok: "bg-emerald-600 text-white ring-emerald-600",
  amber: "bg-amber-500 text-white ring-amber-500",
  rose: "bg-rose-100 text-rose-700 ring-rose-300",
  slate: "bg-slate-100 text-slate-600 ring-slate-300",
};

function daysLine(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function followUpSummary(
  speaker: {
    name?: string | null;
    status?: string | null;
    last_message_at?: string | null;
    last_message_direction?: string | null;
  },
  lastSendAt?: string | null,
): FollowUpSummary {
  // A logged send is the authoritative outbound record — if it's newer than
  // the speaker's stored last_message_at, it IS the last contact.
  const sendAt = lastSendAt ?? null;
  const lastMsgAt = speaker.last_message_at ?? null;
  const sendNewer =
    !!sendAt && (!lastMsgAt || +new Date(sendAt) >= +new Date(lastMsgAt));
  const at = sendNewer ? sendAt : lastMsgAt;
  const direction: "outbound" | "inbound" | null = sendNewer
    ? "outbound"
    : ((speaker.last_message_direction as "outbound" | "inbound" | null) ?? (lastMsgAt ? "outbound" : null));

  if (!at || !direction) {
    return {
      tone: "slate",
      label: "No contact logged",
      cls: TONE_CLS.slate,
      at: null,
      direction: null,
      days: null,
      line: "No messages logged with this person yet.",
    };
  }

  const days = daysBetween(new Date(at), new Date());

  if (days === null) {
    return {
      tone: "slate",
      label: "No contact logged",
      cls: TONE_CLS.slate,
      at,
      direction,
      days: null,
      line: "No messages logged with this person yet.",
    };
  }

  if (direction === "inbound") {
    if (days > 14) {
      return {
        tone: "rose",
        label: "At risk",
        cls: TONE_CLS.rose,
        at,
        direction,
        days,
        line: `Replied ${daysLine(days)} — still no follow-up from you.`,
      };
    }
    if (days > 2) {
      return {
        tone: "rose",
        label: "Reply needed",
        cls: TONE_CLS.rose,
        at,
        direction,
        days,
        line: `Replied ${daysLine(days)} — you haven't followed up yet.`,
      };
    }
    return {
      tone: "ok",
      label: "On track",
      cls: TONE_CLS.ok,
      at,
      direction,
      days,
      line: `Replied ${daysLine(days)} — you're on top of it.`,
    };
  }

  // Outbound
  if (days > 21) {
    return {
      tone: "rose",
      label: "At risk",
      cls: TONE_CLS.rose,
      at,
      direction,
      days,
      line: `${days} days since your last message — no reply logged.`,
    };
  }
  if (days > 7) {
    return {
      tone: "amber",
      label: "Needs follow-up",
      cls: TONE_CLS.amber,
      at,
      direction,
      days,
      line: `${days} days since your last message — no reply logged.`,
    };
  }
  return {
    tone: "ok",
    label: "On track",
    cls: TONE_CLS.ok,
    at,
    direction,
    days,
    line:
      days <= 0
        ? "You messaged them today."
        : `${days} day${days === 1 ? "" : "s"} since your last message — still recent.`,
  };
}


export const speakerStageChipTones = {
  emerald: "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
  sky: "bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100",
  violet: "bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100",
  amber: "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100",
  rose: "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100",
} as const;

export const speakerStageChipActiveTones = {
  emerald: "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-600",
  sky: "bg-sky-600 text-white border-sky-600 hover:bg-sky-600",
  violet: "bg-violet-600 text-white border-violet-600 hover:bg-violet-600",
  amber: "bg-amber-600 text-white border-amber-600 hover:bg-amber-600",
  rose: "bg-rose-600 text-white border-rose-600 hover:bg-rose-600",
} as const;

export type SpeakerStageTone = keyof typeof speakerStageChipTones;

export function isProspectiveSpeaker(speaker: SpeakerStageRecord): boolean {
  return normalizeSpeakerStatus(speaker.status) === "prospective";
}

export function getCoreSpeakerStageCounts(speakers: SpeakerStageRecord[]) {
  return {
    confirmed: speakers.filter((s) => normalizeSpeakerStatus(s.status) === "confirmed").length,
    prospective: speakers.filter(isProspectiveSpeaker).length,
    declined: speakers.filter((s) => normalizeSpeakerStatus(s.status) === "declined").length,
  };
}