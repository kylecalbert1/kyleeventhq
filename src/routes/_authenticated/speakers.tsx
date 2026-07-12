import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  Sparkles,
  Reply,
  Clock,
} from "lucide-react";
import { SyncDialog } from "@/components/SyncDialog";
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
import { StatusPill } from "@/components/StatusPill";
import { SpeakerFormDialog } from "@/components/dialogs/SpeakerFormDialog";
import { ChannelMixPanel } from "@/components/ChannelMixPanel";
import { BulkEmailDialog } from "@/components/BulkEmailDialog";
import { ConfirmSendEmailDialog, type ConfirmDraft } from "@/components/ConfirmSendEmailDialog";
import { speakersQuery, eventsQuery } from "@/lib/queries";
import { bulkMarkBannerSent } from "@/lib/speakers.functions";
import { labels, pillClass, type OutreachChannel } from "@/lib/status";
import { firstNameOf } from "@/lib/gmail";
import { sendGmailEmail } from "@/lib/email.functions";
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
  { key: "contacted", title: "Contacted", accent: "border-t-sky-400", dot: "bg-sky-400" },
  { key: "responded", title: "Responded", accent: "border-t-violet-400", dot: "bg-violet-400" },
  { key: "confirmed", title: "Confirmed", accent: "border-t-emerald-500", dot: "bg-emerald-500" },
  { key: "banner_sent", title: "Banner Sent", accent: "border-t-amber-500", dot: "bg-amber-500" },
  { key: "bio_headshot_in", title: "Bio/Headshot In", accent: "border-t-teal-500", dot: "bg-teal-500" },
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

const stagePill: Record<ColKey, { label: string; cls: string }> = {
  contacted: { label: "Contacted", cls: "border border-sky-400 text-sky-700 bg-sky-50/60" },
  responded: { label: "Responded", cls: "border border-violet-400 text-violet-700 bg-violet-50/60" },
  confirmed: { label: "Confirmed", cls: "bg-emerald-600 text-white ring-emerald-600" },
  banner_sent: { label: "Banner Sent", cls: "bg-amber-500 text-white ring-amber-500" },
  bio_headshot_in: { label: "Bio/Headshot In", cls: "bg-teal-600 text-white ring-teal-600" },
};

const eventChipCls = "border border-slate-300 text-slate-700 bg-white";

type OutreachAlert =
  | { type: "reply"; label: "Reply needed"; cls: string; icon: typeof Reply }
  | { type: "follow_up"; label: "Follow up"; cls: string; icon: typeof Clock }
  | { type: "no_contact"; label: "No contact logged"; cls: string; icon: null }
  | null;

function outreachAlert(s: any): OutreachAlert {
  const status = s.status as string;
  if (status !== "contacted" && status !== "responded") return null;
  const lastAt: string | null = s.last_message_at ?? null;
  const direction: string | null = s.last_message_direction ?? null;
  if (!lastAt) {
    return { type: "no_contact", label: "No contact logged", cls: "bg-slate-100 text-slate-600 ring-slate-200", icon: null };
  }
  const days = daysBetween(new Date(lastAt), new Date());
  if (days === null) return null;
  if (direction === "inbound" && days > 2) {
    return { type: "reply", label: "Reply needed", cls: "bg-rose-100 text-rose-700 ring-rose-200", icon: Reply };
  }
  if (direction === "outbound" && days > 7) {
    return { type: "follow_up", label: "Follow up", cls: "bg-amber-100 text-amber-800 ring-amber-200", icon: Clock };
  }
  return null;
}

function daysBetween(from: Date, to: Date | null | undefined): number | null {
  if (!to) return null;
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
const okChipCls = "border border-emerald-300 text-emerald-700 bg-emerald-50/70";
const missingChipCls = "border border-orange-400 text-orange-700 bg-orange-50/70";

function SpeakerBoard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const events = useQuery(eventsQuery);
  const speakers = useQuery(speakersQuery());
  const bulk = useServerFn(bulkMarkBannerSent);

  const [eventFilter, setEventFilter] = useState<string>("all");
  const [lineFilter, setLineFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<null | { open: boolean; speaker?: any }>(null);
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState<ConfirmDraft | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);

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
    contacted: [], responded: [], confirmed: [], banner_sent: [], bio_headshot_in: [],
  };
  filtered.forEach((s: any) => grouped[columnFor(s)].push(s));

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const selectedSpeakers = useMemo(
    () => (speakers.data ?? []).filter((s: any) => selectedIds.includes(s.id)),
    [speakers.data, selectedIds],
  );

  const sendEmail = useServerFn(sendGmailEmail);

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
    if (!url) { toast.error("No link stored for this speaker"); return; }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch { toast.error("Couldn't copy link"); }
  }

  function emailOne(s: any, ev: any) {
    if (!s.email) { toast.error("No email on file"); return; }
    const firstName = firstNameOf(s.name);
    const code = ev?.code ?? "our upcoming event";
    setConfirmEmail({
      to: s.email,
      recipientName: firstName,
      subject: `${code} — quick check-in`,
      body: `Hi ${firstName},\n\nJust following up on your session for ${code}. Let me know if you need anything from us — happy to help move things forward.\n\nThanks!`,
    });
  }

  async function performSendConfirmed(edited: { subject: string; body: string }) {
    if (!confirmEmail) return;
    const t = toast.loading(`Sending email to ${confirmEmail.recipientName ?? confirmEmail.to}…`);
    try {
      await sendEmail({
        data: { to: confirmEmail.to, subject: edited.subject, body: edited.body },
      });
      toast.success(`Sent to ${confirmEmail.recipientName ?? confirmEmail.to}`, { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send", { id: t });
    }
  }

  return (
    <div className="p-6 md:p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Speaker pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Track every speaker from first outreach to confirmed &amp; ready.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {(events.data ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={lineFilter} onValueChange={setLineFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lines</SelectItem>
              <SelectItem value="AIAI">AIAI</SelectItem>
              <SelectItem value="CSC">CSC</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setSyncOpen(true)} className="transition-transform hover:scale-[1.02]">
            <Sparkles className="h-4 w-4 mr-1.5" />
            Sync
          </Button>
          <Button onClick={() => setEditing({ open: true })} className="transition-transform hover:scale-[1.02]">
            <Plus className="h-4 w-4 mr-1.5" />
            Add speaker
          </Button>
        </div>
      </div>

      {/* Selection action bar — animates in */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          selectedIds.length > 0 ? "max-h-24 opacity-100 mb-4" : "max-h-0 opacity-0 mb-0"
        }`}
      >
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 shadow-sm">
          <div className="text-sm font-medium">
            {selectedIds.length} speaker{selectedIds.length === 1 ? "" : "s"} selected
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelected({})}
            >
              Clear
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkMutation.mutate()}
              disabled={bulkMutation.isPending}
            >
              <Send className="h-4 w-4 mr-1.5" />
              Mark banner{selectedIds.length > 1 ? "s" : ""} sent
            </Button>
            <Button size="sm" onClick={() => setBulkEmailOpen(true)}>
              <Mail className="h-4 w-4 mr-1.5" />
              Email selected
            </Button>
          </div>
        </div>
      </div>

      <ChannelMixPanel speakers={filtered} />

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
                <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:bg-muted/30">
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
                      className={`group p-3 border-t-2 ${col.accent} cursor-pointer transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30`}
                      onClick={() => navigate({ to: "/speakers/$speakerId", params: { speakerId: s.id } })}
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
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold text-sm truncate leading-tight group-hover:text-primary transition-colors">
                              {s.name}
                            </div>
                            {(() => {
                              const alert = outreachAlert(s);
                              if (!alert) return null;
                              return (
                                <StatusPill className={alert.cls}>
                                  {alert.icon && <alert.icon className="h-3 w-3" />}
                                  {alert.label}
                                </StatusPill>
                              );
                            })()}
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
                            <StatusPill className={pill.cls}>{pill.label}</StatusPill>
                            {ev && <StatusPill className={eventChipCls}>{ev.code}</StatusPill>}
                            {s.outreach_channel && (
                              <StatusPill className={pillClass.outreachChannel[s.outreach_channel as OutreachChannel]}>
                                {labels.outreachChannel[s.outreach_channel as OutreachChannel]}
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
                                <AlertTriangle className="h-3 w-3" /> Missing headshot
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
                              className="h-7 px-2 text-xs transition-colors"
                              onClick={() => emailOne(s, ev)}
                              disabled={!s.email}
                            >
                              <Mail className="h-3.5 w-3.5 mr-1" />
                              Email
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs transition-colors"
                              onClick={() => copyLink(s)}
                            >
                              <Link2 className="h-3.5 w-3.5 mr-1" />
                              Copy link
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs ml-auto transition-colors"
                              onClick={() => setEditing({ open: true, speaker: s })}
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
      <BulkEmailDialog
        open={bulkEmailOpen}
        onOpenChange={setBulkEmailOpen}
        speakers={selectedSpeakers}
      />
      <ConfirmSendEmailDialog
        open={!!confirmEmail}
        onOpenChange={(o) => !o && setConfirmEmail(null)}
        draft={confirmEmail}
        onConfirm={performSendConfirmed}
      />
      <SyncDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        defaultEventId={eventFilter}
      />
    </div>
  );
}
