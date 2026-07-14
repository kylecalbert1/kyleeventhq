import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/StatusPill";
import { Mail, Linkedin, MapPin, CalendarDays, Building2, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TitoAttendee } from "./TitoAttendeeCard";

function initialsOf(name: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function TitoAttendeeDetailDialog({
  attendee,
  open,
  onOpenChange,
  onTag,
  onDraft,
}: {
  attendee: TitoAttendee | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onTag?: () => void;
  onDraft?: () => void;
}) {
  const [note, setNote] = useState("");
  if (!attendee) return null;
  const a = attendee;
  const titleAtCompany = [a.job_title, a.company_name].filter(Boolean).join(" at ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full flex items-center justify-center text-[13px] font-bold text-white shadow-sm bg-gradient-to-br from-violet-500 to-violet-600">
              {initialsOf(a.name)}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold truncate">{a.name ?? "—"}</div>
              {titleAtCompany && (
                <div className="text-sm text-slate-500 font-normal truncate">
                  {titleAtCompany}
                </div>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {a.release_title && (
              <StatusPill className="text-[11px] bg-indigo-50 text-indigo-700 ring-indigo-200">
                {a.release_title}
              </StatusPill>
            )}
            {a.event_title && (
              <StatusPill className={cn("text-[11px] bg-indigo-50 text-indigo-700 ring-indigo-200")}>
                {a.event_title}
              </StatusPill>
            )}
            <StatusPill className="text-[11px] bg-violet-100 text-violet-700 border-violet-200">
              Sourced (Tito)
            </StatusPill>
          </div>

          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Contact
            </div>
            {a.email ? (
              <a
                href={`mailto:${a.email}`}
                className="flex items-center gap-2 text-indigo-700 hover:underline"
              >
                <Mail className="h-4 w-4" />
                {a.email}
              </a>
            ) : (
              <div className="text-slate-400 text-sm">No email on file</div>
            )}
            {a.linkedin_url && (
              <a
                href={a.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sky-700 hover:underline"
              >
                <Linkedin className="h-4 w-4" />
                {a.linkedin_url}
              </a>
            )}
            {a.company_name && (
              <div className="flex items-center gap-2 text-slate-600">
                <Building2 className="h-4 w-4 text-slate-400" />
                {a.company_name}
              </div>
            )}
            {a.job_title && (
              <div className="flex items-center gap-2 text-slate-600">
                <Briefcase className="h-4 w-4 text-slate-400" />
                {a.job_title}
              </div>
            )}
            {a.location && (
              <div className="flex items-center gap-2 text-slate-600">
                <MapPin className="h-4 w-4 text-slate-400" />
                {a.location}
              </div>
            )}
            {a.event_title && (
              <div className="flex items-center gap-2 text-slate-500">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                Attended: {a.event_title}
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Notes
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Jot a quick note about this candidate…"
            />
            <p className="text-[11px] text-slate-400">
              Notes persist after tagging this attendee as a speaker candidate.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t">
            {a.email && (
              <Button
                variant="outline"
                onClick={() => {
                  window.location.href = `mailto:${a.email}`;
                }}
              >
                <Mail className="h-4 w-4 mr-2" />
                Send email
              </Button>
            )}
            {onTag && (
              <Button variant="outline" onClick={onTag}>
                Tag as speaker candidate
              </Button>
            )}
            {onDraft && (
              <Button onClick={onDraft}>Draft outreach</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
