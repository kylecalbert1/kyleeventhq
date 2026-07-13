import {
  Link2,
  Linkedin,
  Mail,
  Eye,
  Reply,
  Clock,
  AlertTriangle,
  MessageSquare,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusPill } from "@/components/StatusPill";
import { initialsOf } from "@/lib/gmail";
import {
  labels,
  pillClass,
  daysBetween,
  type OutreachChannel,
} from "@/lib/status";
import { cn } from "@/lib/utils";

/* ---------------- shared helpers reused across app ---------------- */

export const softCard =
  "bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.05)] hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_10px_28px_rgba(15,23,42,0.08)] transition-all duration-200";

export const eventChipCls = "bg-indigo-50 text-indigo-700 ring-indigo-200";
export const missingChipCls =
  "border border-orange-300 text-orange-800 bg-orange-50 ring-0";

export type ColKey =
  | "contacted"
  | "responded"
  | "confirmed"
  | "banner_sent"
  | "bio_headshot_in";

export function bioHeadshotDone(s: any): boolean {
  if (typeof s?.bio_and_headshot_received === "boolean") return s.bio_and_headshot_received;
  return !!(s?.bio_received && s?.headshot_received);
}

export function columnFor(s: any): ColKey {
  if (bioHeadshotDone(s)) return "bio_headshot_in";
  if (s.banner_status === "sent" || s.banner_status === "confirmed_live")
    return "banner_sent";
  if (s.status === "confirmed") return "confirmed";
  if (s.status === "responded") return "responded";
  return "contacted";
}

export const stagePill: Record<ColKey, { label: string; cls: string }> = {
  contacted: { label: "Contacted", cls: "bg-sky-100 text-sky-800 ring-sky-200" },
  responded: { label: "Responded", cls: "bg-violet-100 text-violet-800 ring-violet-200" },
  confirmed: { label: "Confirmed", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  banner_sent: { label: "Banner Sent", cls: "bg-amber-100 text-amber-900 ring-amber-200" },
  bio_headshot_in: {
    label: "Bio/Headshot In",
    cls: "bg-teal-100 text-teal-800 ring-teal-200",
  },
};

export const avatarGradient: Record<ColKey, string> = {
  contacted: "from-sky-500 to-sky-600",
  responded: "from-violet-500 to-violet-600",
  confirmed: "from-emerald-500 to-emerald-600",
  banner_sent: "from-amber-500 to-amber-600",
  bio_headshot_in: "from-teal-500 to-teal-600",
};

type OutreachAlertT =
  | { type: "reply"; label: "Reply needed"; cls: string; icon: typeof Reply }
  | { type: "follow_up"; label: "Follow up"; cls: string; icon: typeof Clock }
  | { type: "no_contact"; label: "No contact logged"; cls: string; icon: null }
  | null;

export function outreachAlert(s: any): OutreachAlertT {
  const status = s.status as string;
  if (status !== "contacted" && status !== "responded") return null;
  const lastAt: string | null = s.last_message_at ?? null;
  const direction: string | null = s.last_message_direction ?? null;
  if (!lastAt) {
    return {
      type: "no_contact",
      label: "No contact logged",
      cls: "bg-slate-100 text-slate-600 ring-slate-200",
      icon: null,
    };
  }
  const days = daysBetween(new Date(lastAt), new Date());
  if (days === null) return null;
  if (direction === "inbound" && days > 2) {
    return {
      type: "reply",
      label: "Reply needed",
      cls: "bg-rose-100 text-rose-700 ring-rose-200",
      icon: Reply,
    };
  }
  if (direction === "outbound" && days > 7) {
    return {
      type: "follow_up",
      label: "Follow up",
      cls: "bg-amber-100 text-amber-800 ring-amber-200",
      icon: Clock,
    };
  }
  return null;
}

export function fmtShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/* ---------------- the reusable card ---------------- */

export function SpeakerListCard({
  s,
  ev,
  selected,
  onToggleSelect,
  onOpenDetail,
  onEmail,
  onCopyLink,
  onEdit,
  showEventChip = true,
}: {
  s: any;
  ev: any;
  selected?: boolean;
  onToggleSelect?: (v: boolean) => void;
  onOpenDetail: () => void;
  onEmail: () => void;
  onCopyLink: () => void;
  onEdit: () => void;
  showEventChip?: boolean;
}) {
  const colKey = columnFor(s);
  const stage = stagePill[colKey];
  const alert = outreachAlert(s);
  const addedShort = fmtShort(s.created_at);
  const lastShort = fmtShort(s.last_message_at);
  const dir = s.last_message_direction as string | null;
  const titleAtCompany = [s.title, s.company].filter(Boolean).join(" at ");

  return (
    <div className={cn(softCard, "p-5")}>
      <div className="flex gap-4">
        <div className="flex flex-col items-center gap-2 pt-0.5">
          {onToggleSelect && (
            <Checkbox
              checked={!!selected}
              onCheckedChange={(v) => onToggleSelect(!!v)}
            />
          )}
          <div
            className={cn(
              "h-11 w-11 rounded-full flex items-center justify-center text-[13px] font-bold text-white shadow-sm bg-gradient-to-br",
              avatarGradient[colKey],
            )}
          >
            {initialsOf(s.name)}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
              <button
                type="button"
                onClick={onOpenDetail}
                className="text-left text-lg font-semibold tracking-tight text-slate-900 hover:text-indigo-700 transition-colors truncate"
              >
                {s.name}
              </button>
              <StatusPill className={cn(stage.cls, "text-[11px] px-2.5 py-1 font-semibold")}>
                {stage.label}
              </StatusPill>
              {showEventChip && ev?.code && (
                <StatusPill className={cn(eventChipCls, "text-[11px]")}>
                  {ev.code}
                </StatusPill>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onCopyLink}
              className="shrink-0 rounded-full border-sky-200 bg-sky-50/60 hover:bg-sky-100 text-sky-700 h-8 px-3 text-xs font-medium"
            >
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Copy Link
            </Button>
          </div>

          {titleAtCompany && (
            <div className="mt-1 text-sm text-slate-500 truncate">{titleAtCompany}</div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {s.email && <span className="text-sm text-slate-600 truncate">{s.email}</span>}
            {s.linkedin_url && (
              <a
                href={s.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-sky-50 hover:bg-sky-100 text-sky-700 ring-1 ring-sky-200 text-[11px] font-medium transition-colors"
              >
                <Linkedin className="h-3 w-3" />
                LinkedIn
              </a>
            )}
            {s.outreach_channel && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border border-dashed",
                  pillClass.outreachChannel[s.outreach_channel as OutreachChannel],
                )}
                title="Outreach channel"
              >
                <Inbox className="h-3 w-3" />
                via {labels.outreachChannel[s.outreach_channel as OutreachChannel]}
              </span>
            )}
            {s.gmail_thread_id && (
              <a
                href={`https://mail.google.com/mail/u/0/#all/${s.gmail_thread_id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 ring-1 ring-rose-200 text-[11px] font-medium transition-colors"
              >
                <MessageSquare className="h-3 w-3" />
                Open thread
              </a>
            )}
          </div>

          {!bioHeadshotDone(s) && (
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill className={cn(missingChipCls, "text-[11px]")}>
                <AlertTriangle className="h-3 w-3" /> Bio &amp; headshot missing
              </StatusPill>
            </div>
          )}

          {(addedShort || lastShort) && (
            <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
              <span>{addedShort ? <>Added {addedShort}</> : null}</span>
              {lastShort && (
                <span>
                  Last outreach: {lastShort}
                  {dir ? ` (${dir})` : ""}
                </span>
              )}
            </div>
          )}

          {alert && (alert.type === "reply" || alert.type === "follow_up") && (
            <div className="mt-2">
              <StatusPill className={cn(alert.cls, "text-[11px] font-semibold")}>
                {alert.icon && <alert.icon className="h-3 w-3" />}
                {alert.label}
              </StatusPill>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <button
              type="button"
              onClick={onEmail}
              disabled={!s.email}
              className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-900 font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Mail className="h-3.5 w-3.5" />
              Send email
            </button>
            <button
              type="button"
              onClick={onOpenDetail}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-indigo-700 font-medium transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              View details
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="text-slate-500 hover:text-indigo-700 font-medium transition-colors"
            >
              + Add note
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="text-slate-500 hover:text-indigo-700 font-medium transition-colors"
            >
              ✏️ Edit details
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
