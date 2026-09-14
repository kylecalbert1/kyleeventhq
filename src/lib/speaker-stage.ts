import { daysBetween } from "@/lib/status";

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
  const lastAt = speaker.last_message_at ?? null;
  const loggedDirection = speaker.last_message_direction ?? nullfer;
  return null;
}


export const speakerStageChipTones = {
  emerald: "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
  sky: "bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100",
  violet: "bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100",
  amber: "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100",
} as const;

export const speakerStageChipActiveTones = {
  emerald: "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-600",
  sky: "bg-sky-600 text-white border-sky-600 hover:bg-sky-600",
  violet: "bg-violet-600 text-white border-violet-600 hover:bg-violet-600",
  amber: "bg-amber-600 text-white border-amber-600 hover:bg-amber-600",
} as const;

export type SpeakerStageTone = keyof typeof speakerStageChipTones;

export function isProspectiveSpeaker(speaker: SpeakerStageRecord): boolean {
  return (speaker.status === "new" || speaker.status === "contacted") && !speaker.call_scheduled;
}

export function isSpeakerInConversation(speaker: SpeakerStageRecord): boolean {
  return (
    speaker.status === "in_conversation" ||
    (Boolean(speaker.call_scheduled) &&
      speaker.status !== "confirmed" &&
      speaker.status !== "declined")
  );
}

export function isRespondedSpeaker(speaker: SpeakerStageRecord): boolean {
  return speaker.status === "responded";
}

export function getCoreSpeakerStageCounts(speakers: SpeakerStageRecord[]) {
  return {
    confirmed: speakers.filter((speaker) => speaker.status === "confirmed").length,
    prospective: speakers.filter(isProspectiveSpeaker).length,
    inConversation: speakers.filter(isSpeakerInConversation).length,
    responded: speakers.filter(isRespondedSpeaker).length,
  };
}