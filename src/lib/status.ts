// Status maps: enum -> human label + semantic color token key.
// Colors are Tailwind classes referencing tokens in src/styles.css.

export const WEBSITE_STAGES = ["draft", "proof_1", "proof_2", "signed_off", "live"] as const;
export type WebsiteStage = (typeof WEBSITE_STAGES)[number];

export const SPEAKER_STATUSES = ["contacted", "responded", "confirmed", "declined"] as const;
export type SpeakerStatus = (typeof SPEAKER_STATUSES)[number];

export const BANNER_STATUSES = ["not_started", "created", "sent", "confirmed_live"] as const;
export type BannerStatusVal = (typeof BANNER_STATUSES)[number];

export const SESSION_FORMATS = ["keynote", "panel", "workshop", "fireside"] as const;
export type SessionFormatVal = (typeof SESSION_FORMATS)[number];

export const WEBSITE_TASK_TYPES = [
  "proof_1",
  "proof_2",
  "final_signoff",
  "launch",
  "audit",
  "refresh",
] as const;
export type WebsiteTaskType = (typeof WEBSITE_TASK_TYPES)[number];

export const MILESTONE_TYPES = ["kickoff", "washup"] as const;
export type MilestoneType = (typeof MILESTONE_TYPES)[number];

export const MILESTONE_STATUSES = ["scheduled", "done"] as const;
export type MilestoneStatusVal = (typeof MILESTONE_STATUSES)[number];

export const BUSINESS_LINES = ["AIAI", "CSC"] as const;
export type BusinessLine = (typeof BUSINESS_LINES)[number];

export const EVENT_FORMATS = ["in_person", "virtual"] as const;
export type EventFormat = (typeof EVENT_FORMATS)[number];

export const OUTREACH_CHANNELS = [
  "linkedin_connect",
  "group_message",
  "old_attendee_list",
  "warm_intro",
  "cold_email",
] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

export const SELF_STATUSES = ["on_track", "needs_attention", "off_track"] as const;
export type SelfStatus = (typeof SELF_STATUSES)[number];

export const labels = {
  website: {
    draft: "Draft",
    proof_1: "1st Proof",
    proof_2: "2nd Proof",
    signed_off: "Signed Off",
    live: "Live",
  } satisfies Record<WebsiteStage, string>,
  speaker: {
    contacted: "Contacted",
    responded: "Responded",
    confirmed: "Confirmed",
    declined: "Declined",
  } satisfies Record<SpeakerStatus, string>,
  banner: {
    not_started: "Not Started",
    created: "Created",
    sent: "Sent",
    confirmed_live: "Confirmed Live",
  } satisfies Record<BannerStatusVal, string>,
  sessionFormat: {
    keynote: "Keynote",
    panel: "Panel",
    workshop: "Workshop",
    fireside: "Fireside",
  } satisfies Record<SessionFormatVal, string>,
  websiteTaskType: {
    proof_1: "1st Proof",
    proof_2: "2nd Proof",
    final_signoff: "Final Sign-off",
    launch: "Launch",
    audit: "Audit",
    refresh: "Refresh",
  } satisfies Record<WebsiteTaskType, string>,
  milestoneType: { kickoff: "Kickoff", washup: "Washup" } satisfies Record<MilestoneType, string>,
  milestoneStatus: { scheduled: "Scheduled", done: "Done" } satisfies Record<MilestoneStatusVal, string>,
  format: { in_person: "In-person", virtual: "Virtual" } satisfies Record<EventFormat, string>,
  outreachChannel: {
    linkedin_connect: "LinkedIn connect",
    group_message: "Group message",
    old_attendee_list: "Old attendee list",
    warm_intro: "Warm intro",
    cold_email: "Cold email",
  } satisfies Record<OutreachChannel, string>,
  selfStatus: {
    on_track: "On track",
    needs_attention: "Needs attention",
    off_track: "Off track",
  } satisfies Record<SelfStatus, string>,
} as const;

// Map each status to a pill color variant (defined as utility classes below).
export const pillClass = {
  website: {
    draft: "bg-slate-100 text-slate-700 ring-slate-200",
    proof_1: "bg-amber-100 text-amber-800 ring-amber-200",
    proof_2: "bg-orange-100 text-orange-800 ring-orange-200",
    signed_off: "bg-indigo-100 text-indigo-800 ring-indigo-200",
    live: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  } satisfies Record<WebsiteStage, string>,
  speaker: {
    contacted: "bg-slate-100 text-slate-700 ring-slate-200",
    responded: "bg-sky-100 text-sky-800 ring-sky-200",
    confirmed: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    declined: "bg-rose-100 text-rose-700 ring-rose-200",
  } satisfies Record<SpeakerStatus, string>,
  banner: {
    not_started: "bg-slate-100 text-slate-700 ring-slate-200",
    created: "bg-amber-100 text-amber-800 ring-amber-200",
    sent: "bg-sky-100 text-sky-800 ring-sky-200",
    confirmed_live: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  } satisfies Record<BannerStatusVal, string>,
  milestoneStatus: {
    scheduled: "bg-amber-100 text-amber-800 ring-amber-200",
    done: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  } satisfies Record<MilestoneStatusVal, string>,
  businessLine: {
    AIAI: "bg-violet-100 text-violet-800 ring-violet-200",
    CSC: "bg-teal-100 text-teal-800 ring-teal-200",
  } satisfies Record<BusinessLine, string>,
  outreachChannel: {
    linkedin_connect: "bg-sky-100 text-sky-800 ring-sky-200",
    group_message: "bg-violet-100 text-violet-800 ring-violet-200",
    old_attendee_list: "bg-amber-100 text-amber-800 ring-amber-200",
    warm_intro: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    cold_email: "bg-slate-100 text-slate-700 ring-slate-200",
  } satisfies Record<OutreachChannel, string>,
  selfStatus: {
    on_track: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    needs_attention: "bg-amber-100 text-amber-800 ring-amber-200",
    off_track: "bg-rose-100 text-rose-700 ring-rose-200",
  } satisfies Record<SelfStatus, string>,
} as const;

export type ReadinessTone = "done" | "green" | "amber" | "red" | "none";

export function readinessTone(due: string | null | undefined, done: boolean): ReadinessTone {
  if (done) return "done";
  if (!due) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  const days = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return "red";
  if (days <= 3) return "red";
  if (days <= 7) return "amber";
  return "green";
}

export const readinessClass: Record<ReadinessTone, string> = {
  done: "bg-emerald-600 text-white ring-emerald-600",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200 border border-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200 border border-amber-300",
  red: "bg-rose-50 text-rose-700 ring-rose-200 border border-rose-300",
  none: "bg-slate-50 text-slate-500 ring-slate-200 border border-dashed border-slate-300",
};

export function daysBetween(from: Date, to: Date | null | undefined): number | null {
  if (!to) return null;
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
