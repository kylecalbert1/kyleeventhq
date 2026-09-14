/**
 * Speaker health: how warm is this relationship right now, and is anything
 * structurally wrong with the record?
 *
 * Everything here is a pure function of data we already store, so it can run
 * client-side over the speakers list without extra round trips.
 *
 * TUNING: the thresholds below are the only numbers that matter — change them
 * here and every tile, pill and flag across the app follows.
 */
export const HEALTH_THRESHOLDS = {
  /** Up to this many days since last contact is considered healthy. */
  okDays: 14,
  /** Beyond okDays and up to this is "needs attention". */
  attentionDays: 30,
  /** How close to the event an unconverted lead becomes a flag. */
  stuckLeadDaysToEvent: 45,
} as const;

export type HealthState = "ok" | "attention" | "stale" | "no_message" | "closed";

export type HealthOverride = "follow_up" | "at_risk" | "ok";

export const HEALTH_OVERRIDE_LABELS: Record<HealthOverride, string> = {
  ok: "Marked fine",
  follow_up: "Marked: follow up",
  at_risk: "Marked: at risk",
};

export type SpeakerHealth = {
  state: HealthState;
  /** Days since the signal below. Null when nothing is logged. */
  days: number | null;
  /** Which timestamp drove the number. */
  basis: "reply" | "contact" | "record" | "none";
  label: string;
  /** Short plain-language line for the list row. */
  line: string;
  cls: string;
  overridden: boolean;
};

const STATE_CLS: Record<HealthState, string> = {
  ok: "bg-emerald-600 text-white ring-emerald-600",
  attention: "bg-amber-500 text-white ring-amber-500",
  stale: "bg-rose-100 text-rose-700 ring-rose-300",
  no_message: "bg-slate-100 text-slate-600 ring-slate-300",
  closed: "bg-slate-200 text-slate-600 ring-slate-300",
};

export const HEALTH_STATE_LABELS: Record<HealthState, string> = {
  ok: "On track",
  attention: "Needs attention",
  stale: "Stale",
  no_message: "No message logged",
  closed: "Closed",
};

export type HealthSpeaker = {
  id: string;
  name?: string | null;
  company?: string | null;
  title?: string | null;
  email?: string | null;
  status?: string | null;
  session_title?: string | null;
  session_format?: string | null;
  last_inbound_at?: string | null;
  last_message_at?: string | null;
  last_message_direction?: string | null;
  health_override?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

function stateFromDays(days: number): HealthState {
  if (days <= HEALTH_THRESHOLDS.okDays) return "ok";
  if (days <= HEALTH_THRESHOLDS.attentionDays) return "attention";
  return "stale";
}

export function computeSpeakerHealth(
  speaker: HealthSpeaker,
  now: number = Date.now(),
): SpeakerHealth {
  const override = (speaker.health_override ?? null) as HealthOverride | null;

  // Primary signal: when did THEY last reply. Falls back to any logged contact,
  // then to the record itself for people we've never messaged.
  const replyDays = daysSince(speaker.last_inbound_at, now);
  const contactDays = daysSince(speaker.last_message_at, now);

  let basis: SpeakerHealth["basis"] = "none";
  let days: number | null = null;
  if (replyDays !== null) {
    basis = "reply";
    days = replyDays;
  } else if (contactDays !== null) {
    basis = "contact";
    days = contactDays;
  } else {
    const recordDays = daysSince(speaker.updated_at ?? speaker.created_at, now);
    if (recordDays !== null) {
      basis = "record";
      days = recordDays;
    }
  }

  let state: HealthState =
    speaker.status === "declined"
      ? "closed"
      : basis === "none" || basis === "record"
        ? "no_message"
        : stateFromDays(days ?? 0);

  let overridden = false;
  if (override && speaker.status !== "declined") {
    overridden = true;
    state = override === "ok" ? "ok" : override === "follow_up" ? "attention" : "stale";
  }

  const line = (() => {
    if (speaker.status === "declined") return "Declined — no action needed.";
    if (basis === "reply") return `They last replied ${days} day${days === 1 ? "" : "s"} ago.`;
    if (basis === "contact")
      return `${days} day${days === 1 ? "" : "s"} since your last message — no reply logged.`;
    if (basis === "record")
      return `No messages logged — on the tracker for ${days} day${days === 1 ? "" : "s"}.`;
    return "No messages logged with this person yet.";
  })();

  const label = overridden
    ? HEALTH_OVERRIDE_LABELS[override as HealthOverride]
    : HEALTH_STATE_LABELS[state];

  return {
    state,
    days: basis === "none" ? null : days,
    basis,
    label,
    line,
    cls: STATE_CLS[state],
    overridden,
  };
}

/* ---------------- automatic structural flags ---------------- */

export type AutoFlagCode =
  | "confirmed_no_email"
  | "confirmed_no_session"
  | "stuck_lead_near_event"
  | "stale_confirmed";

export type AutoFlag = { code: AutoFlagCode; label: string; detail: string };

export const AUTO_FLAG_LABELS: Record<AutoFlagCode, string> = {
  confirmed_no_email: "No email on file",
  confirmed_no_session: "No session assigned",
  stuck_lead_near_event: "Lead not moving",
  stale_confirmed: "Confirmed but gone quiet",
};

export function daysUntil(dateStr: string | null | undefined, now: number = Date.now()): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / 86_400_000);
}

export function computeAutoFlags(
  speaker: HealthSpeaker,
  health: SpeakerHealth,
  opts: { daysToEvent: number | null; onAgenda: boolean },
): AutoFlag[] {
  const flags: AutoFlag[] = [];
  if (speaker.status === "declined") return flags;

  if (speaker.status === "confirmed" && !speaker.email) {
    flags.push({
      code: "confirmed_no_email",
      label: AUTO_FLAG_LABELS.confirmed_no_email,
      detail: "Confirmed speaker with no email address — you can't send them anything.",
    });
  }

  if (
    speaker.status === "confirmed" &&
    !opts.onAgenda &&
    (!speaker.session_title || !speaker.session_format)
  ) {
    flags.push({
      code: "confirmed_no_session",
      label: AUTO_FLAG_LABELS.confirmed_no_session,
      detail: "Confirmed but no session title/format and not on the agenda yet.",
    });
  }

  const near =
    opts.daysToEvent !== null &&
    opts.daysToEvent >= 0 &&
    opts.daysToEvent <= HEALTH_THRESHOLDS.stuckLeadDaysToEvent;
  if (
    near &&
    (speaker.status === "new" || speaker.status === "contacted" || speaker.status === "in_conversation")
  ) {
    flags.push({
      code: "stuck_lead_near_event",
      label: AUTO_FLAG_LABELS.stuck_lead_near_event,
      detail: `Still "${speaker.status === "in_conversation" ? "in conversation" : "a lead"}" with ${opts.daysToEvent} day${opts.daysToEvent === 1 ? "" : "s"} to go.`,
    });
  }

  if (speaker.status === "confirmed" && (health.state === "stale" || health.state === "no_message")) {
    flags.push({
      code: "stale_confirmed",
      label: AUTO_FLAG_LABELS.stale_confirmed,
      detail:
        health.days !== null
          ? `Confirmed, but nothing logged for ${health.days} days.`
          : "Confirmed, but no contact ever logged.",
    });
  }

  return flags;
}
