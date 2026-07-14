import { Checkbox } from "@/components/ui/checkbox";
import { StatusPill } from "@/components/StatusPill";
import { Mail, Eye, Linkedin, MapPin, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { softCard, eventChipCls } from "@/components/speakers/SpeakerListCard";

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
}: {
  a: TitoAttendee;
  selected?: boolean;
  onToggle?: (v: boolean) => void;
  onOpenDetail?: () => void;
  onEmail?: () => void;
  onAddNote?: () => void;
  showEvent?: boolean;
}) {
  const titleAtCompany = [a.job_title, a.company_name].filter(Boolean).join(" at ");

  return (
    <div
      className={cn(softCard, "p-5 cursor-pointer", selected && "ring-2 ring-primary/40")}
      onClick={(e) => {
        // Ignore clicks that originate from interactive children.
        const el = e.target as HTMLElement;
        if (el.closest("button, a, input, [role=checkbox]")) return;
        onOpenDetail?.();
      }}
    >
      <div className="flex gap-4">
        <div
          className="flex flex-col items-center gap-2 pt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {onToggle && (
            <Checkbox
              checked={!!selected}
              onCheckedChange={(v) => onToggle(!!v)}
            />
          )}
          <div className="h-11 w-11 rounded-full flex items-center justify-center text-[13px] font-bold text-white shadow-sm bg-gradient-to-br from-violet-500 to-violet-600">
            {initialsOf(a.name)}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetail?.();
                }}
                className="text-left text-lg font-semibold tracking-tight text-slate-900 hover:text-indigo-700 transition-colors truncate"
              >
                {a.name ?? "—"}
              </button>
              {a.release_title && (
                <StatusPill className="text-[11px] bg-indigo-50 text-indigo-700 ring-indigo-200">
                  {a.release_title}
                </StatusPill>
              )}
              {showEvent && a.event_title && (
                <StatusPill className={cn(eventChipCls, "text-[11px]")}>
                  {a.event_title}
                </StatusPill>
              )}
              <StatusPill className="text-[11px] bg-violet-100 text-violet-700 border-violet-200">
                Sourced (Tito)
              </StatusPill>
            </div>
          </div>

          {titleAtCompany && (
            <div className="mt-1 text-sm text-slate-500 truncate">{titleAtCompany}</div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {a.email && (
              <span className="text-sm text-slate-600 truncate">{a.email}</span>
            )}
            {a.linkedin_url && (
              <a
                href={a.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-sky-50 hover:bg-sky-100 text-sky-700 ring-1 ring-sky-200 text-[11px] font-medium transition-colors"
              >
                <Linkedin className="h-3 w-3" />
                LinkedIn
              </a>
            )}
            {a.location && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <MapPin className="h-3 w-3" />
                {a.location}
              </span>
            )}
            {showEvent && a.event_title && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <CalendarDays className="h-3 w-3" />
                {a.event_title}
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEmail?.();
              }}
              disabled={!a.email}
              className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-900 font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Mail className="h-3.5 w-3.5" />
              Send email
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail?.();
              }}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-indigo-700 font-medium transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              View details
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddNote?.();
              }}
              className="text-slate-500 hover:text-indigo-700 font-medium transition-colors"
            >
              + Add note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
