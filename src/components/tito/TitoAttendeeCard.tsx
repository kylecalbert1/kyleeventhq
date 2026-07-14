import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Mail, MapPin, Building2, Briefcase, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

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
  showEvent = true,
}: {
  a: TitoAttendee;
  selected?: boolean;
  onToggle?: (v: boolean) => void;
  showEvent?: boolean;
}) {
  return (
    <Card
      className={cn(
        "relative bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.05)] hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_10px_28px_rgba(15,23,42,0.08)] transition-all duration-200 p-5",
        selected && "ring-2 ring-primary/40",
      )}
    >
      <div className="flex gap-4">
        <div className="flex flex-col items-center gap-2 pt-0.5">
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
            <div className="min-w-0">
              <div className="text-lg font-semibold tracking-tight text-slate-900 truncate">
                {a.name ?? "—"}
              </div>
              {(a.job_title || a.company_name) && (
                <div className="mt-0.5 text-sm text-slate-500 truncate flex items-center gap-1.5">
                  {a.job_title && (
                    <>
                      <Briefcase className="h-3.5 w-3.5 shrink-0" />
                      <span>{a.job_title}</span>
                    </>
                  )}
                  {a.job_title && a.company_name && <span className="text-slate-300">·</span>}
                  {a.company_name && (
                    <>
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{a.company_name}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            {a.release_title && (
              <Badge
                variant="outline"
                className="shrink-0 bg-indigo-50 text-indigo-700 border-indigo-200 font-medium"
              >
                {a.release_title}
              </Badge>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
            {a.email && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                {a.email}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              {a.location ?? "—"}
            </span>
            {showEvent && a.event_title && (
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                {a.event_title}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
