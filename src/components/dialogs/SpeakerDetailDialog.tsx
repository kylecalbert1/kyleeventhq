import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Mail,
  Linkedin,
  Link2,
  ExternalLink,
  Pencil,
  Mic,
  Clock,
  MessageSquare,
  Send,
  UserPlus,
  Activity,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import { labels, pillClass, type OutreachChannel } from "@/lib/status";
import { listSpeakerActivity } from "@/lib/speakers.functions";
import { initialsOf } from "@/lib/gmail";
import { linkedinSearchUrl } from "@/lib/linkedin-search";

function bhDone(s: any): boolean {
  if (typeof s?.bio_and_headshot_received === "boolean") return s.bio_and_headshot_received;
  return !!(s?.bio_received && s?.headshot_received);
}

function stageOf(s: any): { label: string; cls: string } {
  if (bhDone(s))
    return { label: "Bio/Headshot In", cls: "bg-teal-600 text-white ring-teal-600" };
  if (s.banner_status === "sent" || s.banner_status === "confirmed_live")
    return { label: "Banner Sent", cls: "bg-amber-500 text-white ring-amber-500" };
  if (s.status === "confirmed")
    return { label: "Confirmed", cls: "bg-emerald-600 text-white ring-emerald-600" };
  if (s.status === "responded")
    return { label: "Responded", cls: "border border-violet-400 text-violet-700 bg-violet-50/60" };
  if (s.status === "declined")
    return { label: "Declined", cls: "border border-rose-400 text-rose-700 bg-rose-50/60" };
  return { label: "Contacted", cls: "border border-sky-400 text-sky-700 bg-sky-50/60" };
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function eventTypeMeta(t: string) {
  switch (t) {
    case "status_changed":
      return { label: "Status changed", icon: Activity, cls: "text-violet-600 bg-violet-50" };
    case "banner_status_changed":
      return { label: "Banner status changed", icon: Activity, cls: "text-amber-600 bg-amber-50" };
    case "message_direction_changed":
      return { label: "New message", icon: MessageSquare, cls: "text-sky-600 bg-sky-50" };
    default:
      return { label: t, icon: Activity, cls: "text-slate-600 bg-slate-100" };
  }
}

export function SpeakerDetailDialog({
  open,
  onOpenChange,
  speaker,
  event,
  onEdit,
  onEmail,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  speaker: any | null;
  event?: { id: string; code: string; name: string; business_line?: string | null } | null;
  onEdit: () => void;
  onEmail: () => void;
}) {
  const activity = useQuery({
    queryKey: ["speakerActivity", speaker?.id ?? "none"],
    queryFn: () => listSpeakerActivity({ data: { speaker_id: speaker!.id } }),
    enabled: !!speaker && open,
  });

  const stage = useMemo(() => (speaker ? stageOf(speaker) : null), [speaker]);
  const liSearch = useMemo(
    () => linkedinSearchUrl(speaker?.name, speaker?.company),
    [speaker?.name, speaker?.company]
  );
  if (!speaker) return null;
  const initials = initialsOf(speaker.name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>{speaker.name}</DialogTitle>
        </DialogHeader>

        {/* Hero */}
        <div className="relative -mt-2 mb-4 rounded-lg bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 shrink-0 rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 ring-2 ring-background flex items-center justify-center text-xl font-bold text-primary shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xl font-semibold leading-tight truncate">{speaker.name}</div>
              {(speaker.title || speaker.company) && (
                <div className="text-sm text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5">
                  {speaker.title && <span>{speaker.title}</span>}
                  {speaker.title && speaker.company && <span className="opacity-40">·</span>}
                  {speaker.company && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 opacity-70" />
                      {speaker.company}
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {stage && <StatusPill className={stage.cls}>{stage.label}</StatusPill>}
                {event && (
                  <StatusPill className="border border-slate-300 text-slate-700 bg-white">
                    {event.code}
                  </StatusPill>
                )}
                {event?.business_line && (
                  <StatusPill className="border border-slate-300 text-slate-700 bg-white">
                    {event.business_line}
                  </StatusPill>
                )}
                {speaker.outreach_channel && (
                  <StatusPill
                    className={pillClass.outreachChannel[speaker.outreach_channel as OutreachChannel]}
                  >
                    {labels.outreachChannel[speaker.outreach_channel as OutreachChannel]}
                  </StatusPill>
                )}
                {speaker.session_format && (
                  <StatusPill className="border border-indigo-300 text-indigo-700 bg-indigo-50/60">
                    <Mic className="h-3 w-3" />
                    {labels.sessionFormat[speaker.session_format as never]}
                  </StatusPill>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <Button size="sm" variant="outline" onClick={onEmail} disabled={!speaker.email}>
                <Mail className="h-4 w-4 mr-1.5" /> Email
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!liSearch}
                onClick={() => {
                  if (liSearch) window.open(liSearch, "_blank", "noopener,noreferrer");
                }}
              >
                <Linkedin className="h-4 w-4 mr-1.5" /> Find on LinkedIn
              </Button>
              <Button size="sm" onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-1.5" /> Edit
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Contact & assets */}
          <section className="space-y-3">
            <SectionTitle>Contact</SectionTitle>
            <div className="space-y-1.5 text-sm">
              {speaker.email ? (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{speaker.email}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="h-4 w-4" /> No email on file
                </div>
              )}
              {speaker.linkedin_url && (
                <a
                  href={speaker.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-primary group"
                >
                  <Linkedin className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  <span className="truncate flex-1">LinkedIn profile</span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              )}
              {speaker.dropbox_link && (
                <a
                  href={speaker.dropbox_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-primary group"
                >
                  <Link2 className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  <span className="truncate flex-1">Dropbox / assets</span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              )}
            </div>

            {speaker.session_title && (
              <>
                <SectionTitle>Session</SectionTitle>
                <div className="text-sm">{speaker.session_title}</div>
              </>
            )}

            {speaker.notes && (
              <>
                <SectionTitle>Notes</SectionTitle>
                <p className="text-sm whitespace-pre-line text-foreground/90 leading-relaxed">
                  {speaker.notes}
                </p>
              </>
            )}
          </section>

          {/* Activity */}
          <section className="space-y-3">
            <SectionTitle>Recent activity</SectionTitle>
            <p className="text-[11px] text-muted-foreground -mt-1">
              A plain-language history: status moves, emails sent and replies received. Similar
              events in a row are grouped.
            </p>
            {timeline.length === 0 && !activity.isLoading ? (
              <div className="text-xs text-muted-foreground">Nothing logged yet.</div>
            ) : (
              <ol className="relative border-l border-border pl-4 space-y-3">
                {timeline.map((t) => {
                  const meta = timelineMeta(t.kind);
                  return (
                    <TimelineItem
                      key={t.id}
                      icon={meta.icon}
                      iconCls={meta.cls}
                      title={t.title}
                      note={t.note}
                      time={
                        t.count > 1 && t.fromAt
                          ? `${fmtDateTime(t.fromAt)} → ${fmtDateTime(t.at)}`
                          : fmtDateTime(t.at)
                      }
                    />
                  );
                })}
              </ol>
            )}
            {activity.isLoading && (
              <div className="text-xs text-muted-foreground pl-4">Loading activity…</div>
            )}
          </section>

        </div>

        <div className="mt-6 pt-4 border-t flex justify-between text-[11px] text-muted-foreground">
          <span>Created {fmtDate(speaker.created_at)}</span>
          <span>Updated {fmtDate(speaker.updated_at)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </div>
  );
}

function TimelineItem({
  icon: Icon,
  iconCls,
  title,
  time,
  note,
}: {
  icon: any;
  iconCls: string;
  title: string;
  time: string;
  note?: string;
}) {
  return (
    <li className="relative">
      <span
        className={`absolute -left-[26px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-background ${iconCls}`}
      >
        <Icon className="h-3 w-3" />
      </span>
      <div className="text-sm font-medium leading-tight">{title}</div>
      {note && <div className="text-xs text-muted-foreground mt-0.5">{note}</div>}
      <div className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {time}
      </div>
    </li>
  );
}
