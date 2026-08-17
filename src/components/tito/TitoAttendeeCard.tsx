import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusPill } from "@/components/StatusPill";
import {
  Mail,
  Eye,
  Linkedin,
  MapPin,
  CheckCircle2,
  UserCheck,
  MessageSquare,
  Search as SearchIcon,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { linkedinSearchUrl } from "@/lib/linkedin-search";
import { softCard, eventChipCls } from "@/components/speakers/SpeakerListCard";
import {
  type ContactHistory,
  type TrackedInfo,
  formatSentShort,
} from "@/hooks/use-contact-history";

export type TitoAttendee = {
  id: string;
  name: string | null;
  email: string | null;
  company_name: string | null;
  job_title: string | null;
  location: string | null;
  release_title: string | null;
  event_title: string | null;
  event_slug: string | null;
  linkedin_url?: string | null;
  tagged_events?: Array<{ event_id: string; event_name: string; status: string | null; speaker_id: string }>;
};

function initialsOf(name: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function TitoAttendeeCard({
  a,
  selected,
  onToggle,
  onOpenDetail,
  onEmail,
  onAddNote,
  showEvent = true,
  history,
  trackedIn,
}: {
  a: TitoAttendee;
  selected?: boolean;
  onToggle?: (v: boolean) => void;
  onOpenDetail?: () => void;
  onEmail?: () => void;
  onAddNote?: () => void;
  showEvent?: boolean;
  history?: ContactHistory | null;
  trackedIn?: TrackedInfo | null;
}) {
  const titleAtCompany = [a.job_title, a.company_name].filter(Boolean).join(" at ");
  const lastSent = formatSentShort(history?.last_sent_at);
  const liSearch = linkedinSearchUrl(a.name, a.company_name);
  const missingInfo = !a.email || !a.company_name || !a.job_title;

  const secondary: string[] = [];
  if (a.location) secondary.push(a.location);
  if (history && history.count > 0)
    secondary.push(`Messaged ${history.count}x${lastSent ? ` · last sent ${lastSent}` : ""}`);

  return (
    <div
      className={cn(softCard, "p-6 cursor-pointer", selected && "ring-2 ring-primary/40")}
      onClick={(e) => {
        const el = e.target as HTMLElement;
        if (el.closest("button, a, input, [role=checkbox]")) return;
        onOpenDetail?.();
      }}
    >
      <div className="flex gap-5">
        <div className="flex flex-col items-center gap-3 pt-1" onClick={(e) => e.stopPropagation()}>
          {onToggle && <Checkbox checked={!!selected} onCheckedChange={(v) => onToggle(!!v)} />}
          <div className="h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm bg-gradient-to-br from-slate-400 to-slate-500">
            {initialsOf(a.name)}
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetail?.();
                }}
                className="text-left text-lg font-semibold leading-snug tracking-tight text-slate-900 hover:text-indigo-700 transition-colors truncate"
              >
                {a.name ?? "-"}
              </button>
              {a.release_title && (
                <StatusPill className="text-[11px] bg-slate-100 text-slate-700 ring-slate-200">
                  {a.release_title}
                </StatusPill>
              )}
              {showEvent && a.event_title && (
                <StatusPill className={cn(eventChipCls, "text-[11px]")}>{a.event_title}</StatusPill>
              )}
              {(a.tagged_events ?? []).map((te) => (
                <StatusPill
                  key={te.speaker_id}
                  className="text-[11px] bg-emerald-600 text-white ring-emerald-600 font-semibold"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Tagged for {te.event_name}
                </StatusPill>
              ))}
              {trackedIn && (
                <StatusPill className="text-[11px] bg-emerald-50 text-emerald-800 ring-emerald-200">
                  <UserCheck className="h-3 w-3" />
                  Already tracked
                  {trackedIn.event_name ? `: ${trackedIn.status ?? "in DB"} at ${trackedIn.event_name}` : ""}
                </StatusPill>
              )}
              {missingInfo && (
                <StatusPill className="text-[11px] bg-amber-100 text-amber-800 ring-amber-200 font-semibold">
                  Info missing
                </StatusPill>
              )}
            </div>
            {titleAtCompany && (
              <div className="mt-1.5 text-sm leading-relaxed text-slate-500 truncate">
                {titleAtCompany}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {a.email && <span className="text-sm text-slate-600 truncate">{a.email}</span>}
            {a.linkedin_url ? (
              <a
                href={a.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-inset ring-sky-700/20 hover:bg-sky-700"
              >
                <Linkedin className="h-3.5 w-3.5" />
                LinkedIn
              </a>
            ) : (
              liSearch && (
                <a
                  href={liSearch}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Search LinkedIn for this person"
                  className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-300 hover:bg-sky-100"
                >
                  <SearchIcon className="h-3.5 w-3.5" />
                  Search LinkedIn
                </a>
              )
            )}
          </div>

          {secondary.length > 0 && (
            <div className="flex items-center gap-1.5 text-[12px] leading-relaxed text-slate-500">
              {a.location ? (
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span className="truncate">{secondary.join(" · ")}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              className="h-9 px-4"
              disabled={!a.email}
              onClick={(e) => {
                e.stopPropagation();
                onEmail?.();
              }}
            >
              <Mail className="h-4 w-4 mr-1.5" />
              Send email
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-3"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail?.();
              }}
            >
              <Eye className="h-4 w-4 mr-1.5" />
              Details
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 px-3 text-slate-600"
              onClick={(e) => {
                e.stopPropagation();
                onAddNote?.();
              }}
            >
              <StickyNote className="h-4 w-4 mr-1.5" />
              Add note
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
