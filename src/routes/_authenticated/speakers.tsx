import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Plus,
  Send,
  Mail,
  Link2,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/StatusPill";
import { SpeakerFormDialog } from "@/components/dialogs/SpeakerFormDialog";
import { speakersQuery, eventsQuery } from "@/lib/queries";
import { bulkMarkBannerSent } from "@/lib/speakers.functions";
import { labels, pillClass, OUTREACH_CHANNELS, type OutreachChannel } from "@/lib/status";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/speakers")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(speakersQuery()),
      context.queryClient.ensureQueryData(eventsQuery),
    ]),
  component: SpeakerBoard,
});

const COLUMNS = [
  {
    key: "contacted",
    title: "Contacted",
    accent: "border-t-sky-400",
    dot: "bg-sky-400",
  },
  {
    key: "responded",
    title: "Responded",
    accent: "border-t-violet-400",
    dot: "bg-violet-400",
  },
  {
    key: "confirmed",
    title: "Confirmed",
    accent: "border-t-emerald-500",
    dot: "bg-emerald-500",
  },
  {
    key: "banner_sent",
    title: "Banner Sent",
    accent: "border-t-amber-500",
    dot: "bg-amber-500",
  },
  {
    key: "bio_headshot_in",
    title: "Bio/Headshot In",
    accent: "border-t-teal-500",
    dot: "bg-teal-500",
  },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

function columnFor(s: any): ColKey {
  if (s.bio_received && s.headshot_received) return "bio_headshot_in";
  if (s.banner_status === "sent" || s.banner_status === "confirmed_live")
    return "banner_sent";
  if (s.status === "confirmed") return "confirmed";
  if (s.status === "responded") return "responded";
  return "contacted";
}

// Distinct visual per stage — outlined for early stages, solid for later.
const stagePill: Record<ColKey, { label: string; cls: string }> = {
  contacted: {
    label: "Contacted",
    cls: "border border-sky-400 text-sky-700 bg-sky-50/60",
  },
  responded: {
    label: "Responded",
    cls: "border border-violet-400 text-violet-700 bg-violet-50/60",
  },
  confirmed: {
    label: "Confirmed",
    cls: "bg-emerald-600 text-white ring-emerald-600",
  },
  banner_sent: {
    label: "Banner Sent",
    cls: "bg-amber-500 text-white ring-amber-500",
  },
  bio_headshot_in: {
    label: "Bio/Headshot In",
    cls: "bg-teal-600 text-white ring-teal-600",
  },
};

const eventChipCls = "border border-slate-300 text-slate-700 bg-white";
const okChipCls =
  "border border-emerald-300 text-emerald-700 bg-emerald-50/70";
const missingChipCls =
  "border border-orange-400 text-orange-700 bg-orange-50/70";

function SpeakerBoard() {
  const qc = useQueryClient();
  const events = useQuery(eventsQuery);
  const speakers = useQuery(speakersQuery());
  const bulk = useServerFn(bulkMarkBannerSent);

  const [eventFilter, setEventFilter] = useState<string>("all");
  const [lineFilter, setLineFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<null | { open: boolean; speaker?: any }>(
    null,
  );
  const [emailing, setEmailing] = useState<null | any>(null);

  const eventById = useMemo(
    () => Object.fromEntries((events.data ?? []).map((e) => [e.id, e])),
    [events.data],
  );

  const filtered = (speakers.data ?? []).filter((s: any) => {
    if (eventFilter !== "all" && s.event_id !== eventFilter) return false;
    if (lineFilter !== "all") {
      const ev = eventById[s.event_id];
      if (ev?.business_line !== lineFilter) return false;
    }
    return true;
  });

  const grouped: Record<ColKey, any[]> = {
    contacted: [],
    responded: [],
    confirmed: [],
    banner_sent: [],
    bio_headshot_in: [],
  };
  filtered.forEach((s: any) => grouped[columnFor(s)].push(s));

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  const bulkMutation = useMutation({
    mutationFn: () => bulk({ data: { ids: selectedIds } }),
    onSuccess: (r: any) => {
      toast.success(`Marked ${r.count} banners as sent`);
      setSelected({});
      qc.invalidateQueries({ queryKey: ["speakers"] });
      qc.invalidateQueries({ queryKey: ["eventSummaries"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  async function copyLink(s: any) {
    const url = s.dropbox_link || s.linkedin_url;
    if (!url) {
      toast.error("No link stored for this speaker");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Couldn't copy link");
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Speaker pipeline
          </h1>
          <p className="text-sm text-muted-foreground">
            Track every speaker from first outreach to confirmed &amp; ready.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {(events.data ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={lineFilter} onValueChange={setLineFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lines</SelectItem>
              <SelectItem value="AIAI">AIAI</SelectItem>
              <SelectItem value="CSC">CSC</SelectItem>
            </SelectContent>
          </Select>
          {selectedIds.length > 0 && (
            <Button
              size="sm"
              onClick={() => bulkMutation.mutate()}
              disabled={bulkMutation.isPending}
            >
              <Send className="h-4 w-4 mr-1.5" />
              Mark {selectedIds.length} banner
              {selectedIds.length > 1 ? "s" : ""} sent
            </Button>
          )}
          <Button onClick={() => setEditing({ open: true })}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add speaker
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {COLUMNS.map((col) => (
          <div key={col.key} className="min-w-0">
            <div className="flex items-center justify-between px-1 mb-2">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {col.title}
                </div>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {grouped[col.key].length}
              </div>
            </div>
            <div className="space-y-2 min-h-24">
              {grouped[col.key].length === 0 ? (
                <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                  No speakers yet
                </div>
              ) : (
                grouped[col.key].map((s: any) => {
                  const ev = eventById[s.event_id];
                  const colKey = columnFor(s);
                  const pill = stagePill[colKey];
                  return (
                    <Card
                      key={s.id}
                      className={`group p-3 border-t-2 ${col.accent} hover:shadow-md transition-shadow cursor-pointer`}
                      onClick={() => setEditing({ open: true, speaker: s })}
                    >
                      <div className="flex items-start gap-2">
                        <Checkbox
                          className="mt-0.5"
                          checked={!!selected[s.id]}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={(v) =>
                            setSelected({ ...selected, [s.id]: !!v })
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate leading-tight">
                            {s.name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                            {s.title && <span>{s.title}</span>}
                            {s.title && s.company && (
                              <span className="opacity-40">·</span>
                            )}
                            {s.company && (
                              <span className="inline-flex items-center gap-0.5">
                                <Building2 className="h-3 w-3 opacity-60" />
                                {s.company}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1 mt-2">
                            <StatusPill className={pill.cls}>
                              {pill.label}
                            </StatusPill>
                            {ev && (
                              <StatusPill className={eventChipCls}>
                                {ev.code}
                              </StatusPill>
                            )}
                            {s.bio_received ? (
                              <StatusPill className={okChipCls}>
                                <CheckCircle2 className="h-3 w-3" /> Bio
                              </StatusPill>
                            ) : (
                              <StatusPill className={missingChipCls}>
                                <AlertTriangle className="h-3 w-3" /> Missing bio
                              </StatusPill>
                            )}
                            {s.headshot_received ? (
                              <StatusPill className={okChipCls}>
                                <CheckCircle2 className="h-3 w-3" /> Headshot
                              </StatusPill>
                            ) : (
                              <StatusPill className={missingChipCls}>
                                <AlertTriangle className="h-3 w-3" /> Missing
                                headshot
                              </StatusPill>
                            )}
                          </div>

                          <div
                            className="flex items-center gap-1 mt-2.5 pt-2 border-t border-border/60"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                if (!s.email) {
                                  toast.error("No email on file");
                                  return;
                                }
                                setEmailing(s);
                              }}
                            >
                              <Mail className="h-3.5 w-3.5 mr-1" />
                              Email
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => copyLink(s)}
                            >
                              <Link2 className="h-3.5 w-3.5 mr-1" />
                              Copy link
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs ml-auto"
                              onClick={() =>
                                setEditing({ open: true, speaker: s })
                              }
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1" />
                              Edit
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <SpeakerFormDialog
          open={editing.open}
          onOpenChange={(o) => setEditing(o ? editing : null)}
          speaker={editing.speaker}
        />
      )}
      <EmailComposeDialog
        speaker={emailing}
        event={emailing ? eventById[emailing.event_id] : undefined}
        onOpenChange={(o) => !o && setEmailing(null)}
      />
    </div>
  );
}

function EmailComposeDialog({
  speaker,
  event,
  onOpenChange,
}: {
  speaker: any | null;
  event: any | undefined;
  onOpenChange: (o: boolean) => void;
}) {
  const open = !!speaker;
  const eventLabel = event ? `${event.code}` : "our upcoming event";
  const firstName = speaker?.name?.split(" ")[0] ?? "there";
  const defaultSubject = speaker
    ? `${eventLabel} — quick check-in`
    : "";
  const defaultBody = speaker
    ? `Hi ${firstName},\n\nJust following up on your session for ${eventLabel}. Let me know if you need anything from us — happy to help move things forward.\n\nThanks!`
    : "";

  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);

  // Reset when speaker changes
  useMemo(() => {
    setSubject(defaultSubject);
    setBody(defaultBody);
  }, [speaker?.id]);

  function openInMailClient() {
    if (!speaker?.email) return;
    const url = `mailto:${encodeURIComponent(
      speaker.email,
    )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
    onOpenChange(false);
  }

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      toast.success("Email copied to clipboard");
    } catch {
      toast.error("Couldn't copy");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Email {speaker?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input value={speaker?.email ?? ""} readOnly />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Message</Label>
            <Textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={copyBody}>
            Copy
          </Button>
          <Button onClick={openInMailClient}>
            <Mail className="h-4 w-4 mr-1.5" />
            Open in mail app
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
