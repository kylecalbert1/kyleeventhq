import {
  Link2,
  Linkedin,
  Mail,
  Eye,
  Reply,
  Clock,
  MessageSquare,
  CalendarCheck,
  Search as SearchIcon,
  Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusPill } from "@/components/StatusPill";
import { initialsOf } from "@/lib/gmail";
import {
  labels,
  daysBetween,
  type OutreachChannel,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { openGmailThread, gmailThreadUrl } from "@/lib/gmail";
import { gmailComposeUrl } from "@/lib/gmail-compose";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SpeakerStatus = "new" | "contacted" | "in_conversation" | "responded" | "confirmed" | "declined";

const STATUS_OPTIONS: Array<{ value: SpeakerStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "in_conversation", label: "In conversation" },
  { value: "responded", label: "Responded" },
  { value: "confirmed", label: "Confirmed" },
  { value: "declined", label: "Declined" },
];


/* ---------------- shared helpers reused across app ---------------- */

export const softCard =
  "bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.05)] hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_10px_28px_rgba(15,23,42,0.08)] transition-all duration-200";

export const eventChipCls = "bg-indigo-50 text-indigo-700 ring-indigo-200";

export type ColKey =
  | "new"
  | "contacted"
  | "responded"
  | "confirmed"
  | "banner_sent";

/**
 * Asset-completion flag. Deliberately NOT a pipeline stage — it's shown as a
 * small secondary indicator in the detail view only.
 */
export function bioHeadshotDone(s: any): boolean {
  if (typeof s?.bio_and_headshot_received === "boolean") return s.bio_and_headshot_received;
  return !!(s?.bio_received && s?.headshot_received);
}

export function columnFor(s: any): ColKey {
  if (s.banner_status === "sent" || s.banner_status === "confirmed_live")
    return "banner_sent";
  if (s.status === "confirmed") return "confirmed";
  if (s.status === "responded") return "responded";
  if (s.status === "new") return "new";
  return "contacted";
}

/** Bold, solid status pills — the single primary visual anchor on a card. */
export const stagePill: Record<ColKey, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-slate-600 text-white ring-slate-600" },
  contacted: { label: "Contacted", cls: "bg-sky-600 text-white ring-sky-600" },
  responded: { label: "Responded", cls: "bg-violet-600 text-white ring-violet-600" },
  confirmed: { label: "Confirmed", cls: "bg-emerald-600 text-white ring-emerald-600" },
  banner_sent: { label: "Banner Sent", cls: "bg-amber-500 text-white ring-amber-500" },
};

export const avatarGradient: Record<ColKey, string> = {
  new: "from-slate-400 to-slate-500",
  contacted: "from-sky-500 to-sky-600",
  responded: "from-violet-500 to-violet-600",
  confirmed: "from-emerald-500 to-emerald-600",
  banner_sent: "from-amber-500 to-amber-600",
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
  onStatusChange,
  showEventChip = true,
  history,
  agendaOptions,
  assignedAgendaItemId,
  onAssignAgendaItem,
}: {
  s: any;
  ev: any;
  selected?: boolean;
  onToggleSelect?: (v: boolean) => void;
  onOpenDetail: () => void;
  onEmail: () => void;
  onCopyLink: () => void;
  onEdit: () => void;
  onStatusChange?: (next: SpeakerStatus) => void;
  showEventChip?: boolean;
  history?: { count: number; last_sent_at: string | null } | null;
  agendaOptions?: Array<{ id: string; title: string }>;
  assignedAgendaItemId?: string | null;
  onAssignAgendaItem?: (id: string | null) => void;
}) {
  const colKey = columnFor(s);
  const stage = stagePill[colKey];
  const alert = outreachAlert(s);
  const addedShort = fmtShort(s.created_at);
  const lastShort = fmtShort(s.last_message_at);
  const historyShort = fmtShort(history?.last_sent_at ?? null);
  const dir = s.last_message_direction as string | null;
  const titleAtCompany = [s.title, s.company].filter(Boolean).join(" at ");
  const assignedSessionTitle = assignedAgendaItemId
    ? (agendaOptions ?? []).find((a) => a.id === assignedAgendaItemId)?.title ?? null
    : null;

  // Bio/headshot deliberately excluded — it's an asset flag, not headline info.
  const missingFields: string[] = [];
  if (!s.email) missingFields.push("email");
  if (!s.session_title) missingFields.push("session title");
  if (!s.linkedin_url) missingFields.push("LinkedIn");


  const linkedinSearchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
    [s.name, s.company].filter(Boolean).join(" "),
  )}`;


  const secondary: string[] = [];
  if ((s as { source?: string | null }).source === "tito_candidate") secondary.push("Sourced via Tito");
  if (s.outreach_channel)
    secondary.push(`via ${labels.outreachChannel[s.outreach_channel as OutreachChannel]}`);
  if (s.call_scheduled)
    secondary.push(
      s.call_scheduled_at ? `Call ${fmtShort(s.call_scheduled_at)}` : "Call scheduled",
    );
  if (assignedSessionTitle) secondary.push(assignedSessionTitle);
  if (history && history.count > 0)
    secondary.push(`Messaged ${history.count}x${historyShort ? ` · ${historyShort}` : ""}`);

  return (
    <div className={cn(softCard, "p-6")}>
      <div className="flex gap-5">
        <div className="flex flex-col items-center gap-3 pt-1">
          {onToggleSelect && (
            <Checkbox
              checked={!!selected}
              onCheckedChange={(v) => onToggleSelect(!!v)}
            />
          )}
          <div
            className={cn(
              "h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm bg-gradient-to-br",
              avatarGradient[colKey],
            )}
          >
            {initialsOf(s.name)}
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          {/* Name + one bold status pill: the primary anchor */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
                <button
                  type="button"
                  onClick={onOpenDetail}
                  className="text-left text-lg font-semibold leading-snug tracking-tight text-slate-900 hover:text-indigo-700 transition-colors truncate"
                >
                  {s.name}
                </button>
                {onStatusChange ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" title="Change status">
                        <StatusPill
                          className={cn(
                            stage.cls,
                            "text-[11px] px-3 py-1 font-semibold uppercase tracking-wide cursor-pointer hover:opacity-90",
                          )}
                        >
                          {stage.label}
                        </StatusPill>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {STATUS_OPTIONS.map((opt) => (
                        <DropdownMenuItem
                          key={opt.value}
                          onSelect={() => onStatusChange(opt.value)}
                        >
                          {opt.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <StatusPill
                    className={cn(
                      stage.cls,
                      "text-[11px] px-3 py-1 font-semibold uppercase tracking-wide",
                    )}
                  >
                    {stage.label}
                  </StatusPill>
                )}
                {showEventChip && ev?.code && (
                  <StatusPill className={cn(eventChipCls, "text-[11px]")}>{ev.code}</StatusPill>
                )}
                {alert && (alert.type === "reply" || alert.type === "follow_up") && (
                  <StatusPill className={cn(alert.cls, "text-[11px] font-semibold")}>
                    {alert.icon && <alert.icon className="h-3 w-3" />}
                    {alert.label}
                  </StatusPill>
                )}
              </div>
              {titleAtCompany && (
                <div className="mt-1.5 text-sm leading-relaxed text-slate-500 truncate">
                  {titleAtCompany}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCopyLink}
              className="shrink-0 rounded-full text-slate-500 hover:text-sky-700 h-8 px-3 text-xs font-medium"
            >
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Copy link
            </Button>
          </div>

          {/* Contact links */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {s.email && (
              <a
                href={gmailComposeUrl(s.email)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-sm leading-relaxed text-slate-600 hover:text-indigo-700 hover:underline truncate"
              >
                {s.email}
              </a>
            )}
            {s.linkedin_url ? (
              <a
                href={s.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-sky-700 hover:underline"
              >
                <Linkedin className="h-3.5 w-3.5" />
                LinkedIn
              </a>
            ) : (
              <a
                href={linkedinSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:underline"
                title="Search LinkedIn"
              >
                <SearchIcon className="h-3.5 w-3.5" />
                Search LinkedIn
              </a>
            )}
            {s.gmail_thread_id && (
              <a
                href={gmailThreadUrl(s.gmail_thread_id)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openGmailThread(s.gmail_thread_id);
                }}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-rose-700 hover:underline"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Open thread
              </a>
            )}
          </div>

          {/* One consolidated secondary line instead of a stack of chips */}
          {secondary.length > 0 && (
            <div className="flex items-center gap-1.5 text-[12px] leading-relaxed text-slate-500">
              {s.call_scheduled && <CalendarCheck className="h-3.5 w-3.5 text-emerald-600" />}
              <span className="truncate">{secondary.join(" · ")}</span>
            </div>
          )}

          {missingFields.length > 0 && (
            <div className="text-[12px] text-slate-400">Missing: {missingFields.join(", ")}</div>
          )}

          {(addedShort || lastShort) && (
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{addedShort ? <>Added {addedShort}</> : null}</span>
              {lastShort && (
                <span>
                  Last outreach: {lastShort}
                  {dir ? ` (${dir})` : ""}
                </span>
              )}
            </div>
          )}

          {/* Actions — one solid primary, the rest quiet */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={onEmail} disabled={!s.email} className="h-9 px-4">
              <Mail className="h-4 w-4 mr-1.5" />
              Send email
            </Button>
            <Button size="sm" variant="outline" onClick={onOpenDetail} className="h-9 px-3">
              <Eye className="h-4 w-4 mr-1.5" />
              Details
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit} className="h-9 px-3 text-slate-600">
              Edit
            </Button>
            {onAssignAgendaItem && agendaOptions && agendaOptions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-9 px-3 text-slate-600">
                    <Mic className="h-4 w-4 mr-1.5" />
                    {assignedSessionTitle ? "Change session" : "Assign session"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                  <DropdownMenuItem onSelect={() => onAssignAgendaItem(null)}>
                    — Unassigned —
                  </DropdownMenuItem>
                  {agendaOptions.map((opt) => (
                    <DropdownMenuItem key={opt.id} onSelect={() => onAssignAgendaItem(opt.id)}>
                      {opt.title}
                      {opt.id === assignedAgendaItemId ? " ✓" : ""}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

