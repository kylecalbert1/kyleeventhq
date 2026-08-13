import { PageHelp } from "@/components/PageHelp";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { z } from "zod";
import {
  Plus,
  Send,
  Mail,
  Linkedin,
  Eye,
  Sparkles,
  Search,
  X,
  LayoutGrid,
  Rows3,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { SyncDialog } from "@/components/SyncDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import { SpeakerFormDialog } from "@/components/dialogs/SpeakerFormDialog";
import { SpeakerDetailDialog } from "@/components/dialogs/SpeakerDetailDialog";
import { ChannelMixPanel } from "@/components/ChannelMixPanel";
import { BulkEmailDialog } from "@/components/BulkEmailDialog";
import { ConfirmSendEmailDialog, type ConfirmDraft } from "@/components/ConfirmSendEmailDialog";
import { SendHistoryPanel } from "@/components/SendHistoryPanel";
import { speakersQuery, eventsQuery } from "@/lib/queries";
import { bulkMarkBannerSent, updateSpeaker, copySpeakerToEvent } from "@/lib/speakers.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  labels,
  OUTREACH_CHANNELS,
  type OutreachChannel,
} from "@/lib/status";
import { firstNameOf, initialsOf } from "@/lib/gmail";
import { sendGmailEmail } from "@/lib/email.functions";
import { logEmailSend } from "@/lib/email-sends.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  SpeakerListCard,
  softCard,
  columnFor,
  stagePill,
  avatarGradient,
  eventChipCls,
  outreachAlert,
  type ColKey,
} from "@/components/speakers/SpeakerListCard";
import { useContactHistory } from "@/hooks/use-contact-history";
import { DiscoveryView } from "@/components/speakers/DiscoveryView";
import { PastSpeakersDirectorySection } from "@/components/speakers/PastSpeakersDirectorySection";
import { isPastEvent } from "@/lib/event-lifecycle";
import { fuzzyMatch } from "@/lib/fuzzy-search";

const searchSchema = z.object({
  attention: z.enum(["reply", "follow_up", "any"]).optional(),
  mode: z.enum(["pipeline", "discover"]).optional(),
  call_scheduled: z.enum(["true"]).optional(),
});

export const Route = createFileRoute("/_authenticated/speakers")({
  validateSearch: searchSchema,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(speakersQuery()),
      context.queryClient.ensureQueryData(eventsQuery),
    ]),
  component: SpeakersPage,
});

function SpeakersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  // Discovery is the default: the day-to-day "my speakers" workflow lives on
  // each event's page, where the list is already scoped to that event.
  const mode = search.mode ?? "discover";
  return (
    <div className="min-h-screen bg-background">
      <div className="px-6 md:px-8 pt-6">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {(["discover", "pipeline"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => navigate({ to: "/speakers", search: { ...search, mode: m } })}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                mode === m ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900",
              )}
            >
              {m === "discover" ? "Find new candidates" : "All speakers (cross-event)"}
            </button>
          ))}
        </div>
      </div>
      {mode === "discover" ? <DiscoveryView /> : <SpeakerBoard />}
    </div>
  );
}


const COLUMNS = [
  { key: "new", title: "New", accent: "border-t-slate-400", dot: "bg-slate-400" },
  { key: "contacted", title: "Contacted", accent: "border-t-sky-400", dot: "bg-sky-400" },
  { key: "responded", title: "Responded", accent: "border-t-violet-400", dot: "bg-violet-400" },
  { key: "confirmed", title: "Confirmed", accent: "border-t-emerald-500", dot: "bg-emerald-500" },
  { key: "banner_sent", title: "Banner Sent", accent: "border-t-amber-500", dot: "bg-amber-500" },
] as const;

type StageFilter = "all" | ColKey;

function patchForColumn(target: ColKey): Record<string, any> {
  switch (target) {
    case "new":
      return { status: "new" };
    case "contacted":
      return { status: "contacted" };
    case "responded":
      return { status: "responded" };
    case "confirmed":
      return { status: "confirmed" };
    case "banner_sent":
      return { status: "confirmed", banner_status: "sent" };
  }
}


type SortKey = "stalest" | "name" | "event" | "status";
type ViewMode = "list" | "board";


function SpeakerBoard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const events = useQuery(eventsQuery);
  const speakers = useQuery(speakersQuery());
  const bulk = useServerFn(bulkMarkBannerSent);
  const updateSp = useServerFn(updateSpeaker);

  const [view, setView] = useState<ViewMode>("list");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [lineFilter, setLineFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [attentionFilter, setAttentionFilter] = useState<"all" | "reply" | "follow_up" | "any">(
    search.attention ?? "all",
  );
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("stalest");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<null | { open: boolean; speaker?: any }>(null);
  const [detailSpeaker, setDetailSpeaker] = useState<any | null>(null);
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState<ConfirmDraft | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [dragOver, setDragOver] = useState<ColKey | null>(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [callScheduledOnly, setCallScheduledOnly] = useState(search.call_scheduled === "true");
  const [candidatesOpen, setCandidatesOpen] = useState(true);
  const [showPastEvents, setShowPastEvents] = useState(false);

  const eventById = useMemo(
    () => Object.fromEntries((events.data ?? []).map((e) => [e.id, e])),
    [events.data],
  );

  const preStageFiltered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (speakers.data ?? []).filter((s: any) => {
      if (eventFilter !== "all" && s.event_id !== eventFilter) return false;
      if (lineFilter !== "all") {
        const ev = eventById[s.event_id];
        if (ev?.business_line !== lineFilter) return false;
      }
      if (channelFilter !== "all") {
        if (channelFilter === "untagged") {
          if (s.outreach_channel) return false;
        } else if (s.outreach_channel !== channelFilter) return false;
      }
      if (callScheduledOnly && !s.call_scheduled) return false;
      if (attentionFilter !== "all") {
        const a = outreachAlert(s);
        if (!a) return false;
        if (attentionFilter === "reply" && a.type !== "reply") return false;
        if (attentionFilter === "follow_up" && a.type !== "follow_up") return false;
        if (attentionFilter === "any" && a.type !== "reply" && a.type !== "follow_up") return false;
      }
      if (term && !fuzzyMatch(term, s.name, s.company, s.email)) return false;
      return true;
    });
  }, [speakers.data, eventFilter, lineFilter, channelFilter, callScheduledOnly, attentionFilter, q, eventById]);

  // Stage counts (pre-stage-filter, so the dropdown shows real totals).
  const stageCounts = useMemo(() => {
    const c: Record<ColKey, number> = {
      new: 0, contacted: 0, responded: 0, confirmed: 0, banner_sent: 0,
    };
    preStageFiltered.forEach((s: any) => { c[columnFor(s)]++; });
    return c;
  }, [preStageFiltered]);

  const filtered = useMemo(() => {
    if (stageFilter === "all") return preStageFiltered;
    return preStageFiltered.filter((s: any) => columnFor(s) === stageFilter);
  }, [preStageFiltered, stageFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a: any, b: any) => {
      if (sortKey === "name") return (a.name ?? "").localeCompare(b.name ?? "");
      if (sortKey === "event") {
        const ea = eventById[a.event_id]?.code ?? "";
        const eb = eventById[b.event_id]?.code ?? "";
        return ea.localeCompare(eb);
      }
      if (sortKey === "status") {
        const rank: Record<string, number> = { new: -1, contacted: 0, responded: 1, confirmed: 2, declined: 3 };
        return (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      }
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : -Infinity;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : -Infinity;
      return ta - tb;
    });
    return arr;
  }, [filtered, sortKey, eventById]);

  // Partition: freshly-tagged Tito candidates (source='tito_candidate', status='contacted', no messages yet)
  // land in a separate "Potential speakers" section grouped by event; everything else stays in the main pipeline.
  const isPotentialCandidate = (s: any) =>
    s.source === "tito_candidate" && (s.status === "new" || s.status === "contacted") && !s.last_message_at;

  const pipelineSorted = useMemo(() => sorted.filter((s: any) => !isPotentialCandidate(s)), [sorted]);
  const candidatesSorted = useMemo(() => sorted.filter((s: any) => isPotentialCandidate(s)), [sorted]);

  const speakerEmails = useMemo(
    () => sorted.map((s: any) => s.email as string | null),
    [sorted],
  );
  const { lookup: lookupHistory } = useContactHistory(speakerEmails);

  const candidatesByEvent = useMemo(() => {
    const map = new Map<string, { event: any; rows: any[] }>();
    for (const s of candidatesSorted) {
      const ev = eventById[s.event_id];
      const key = s.event_id ?? "unassigned";
      const entry = map.get(key) ?? { event: ev, rows: [] };
      entry.rows.push(s);
      map.set(key, entry);
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [candidatesSorted, eventById]);

  const grouped: Record<ColKey, any[]> = {
    new: [], contacted: [], responded: [], confirmed: [], banner_sent: [],
  };
  pipelineSorted.forEach((s: any) => grouped[columnFor(s)].push(s));

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const selectedSpeakers = useMemo(
    () => (speakers.data ?? []).filter((s: any) => selectedIds.includes(s.id)),
    [speakers.data, selectedIds],
  );

  const sendEmail = useServerFn(sendGmailEmail);
  const logSend = useServerFn(logEmailSend);

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

  const dragMove = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) =>
      updateSp({ data: { id, patch } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["speakers"] });
      qc.invalidateQueries({ queryKey: ["eventSummaries"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to move"),
  });

  function handleDrop(target: ColKey, e: React.DragEvent) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const s = (speakers.data ?? []).find((x: any) => x.id === id);
    if (!s) return;
    if (columnFor(s) === target) return;
    const patch = patchForColumn(target);
    dragMove.mutate({ id, patch });
    toast.success(`Moved ${s.name} → ${COLUMNS.find((c) => c.key === target)?.title}`);
  }

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
    const firstName = firstNameOf(s.name, s.email);
    const code = ev?.code ?? "our upcoming event";
    setConfirmEmail({
      to: s.email,
      recipientName: firstName,
      subject: `${code} - quick check-in`,
      body: `Hi ${firstName},\n\nJust following up on your session for ${code}. Let me know if you need anything from us - happy to help move things forward.\n\nThanks!`,
      // Logged explicitly in performSendConfirmed so failures aren't recorded.
      eventId: s.event_id ?? null,
      speakerId: s.id,
    });
  }

  async function performSendConfirmed(edited: { subject: string; body: string }) {
    if (!confirmEmail) return;
    const t = toast.loading(`Sending email to ${confirmEmail.recipientName ?? confirmEmail.to}…`);
    try {
      await sendEmail({
        data: { to: confirmEmail.to, subject: edited.subject, body: edited.body, isHtml: true },
      });
      toast.success(`Sent to ${confirmEmail.recipientName ?? confirmEmail.to}`, { id: t });
      try {
        await logSend({
          data: {
            event_id: confirmEmail.eventId ?? null,
            template_type: "custom",
            subject: edited.subject,
            body: edited.body,
            recipients: [
              {
                speaker_id: confirmEmail.speakerId ?? null,
                email: confirmEmail.to,
                name: confirmEmail.recipientName ?? null,
              },
            ],
          },
        });
        qc.invalidateQueries({ queryKey: ["emailSends"] });
        qc.invalidateQueries({ queryKey: ["speakerActivity"] });
      } catch (err) {
        console.error("Failed to log email send:", err);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send", { id: t });
    }
  }

  const hasFilters =
    stageFilter !== "all" ||
    eventFilter !== "all" ||
    lineFilter !== "all" ||
    channelFilter !== "all" ||
    attentionFilter !== "all" ||
    q.trim() !== "";

  function clearFilters() {
    setStageFilter("all");
    setEventFilter("all");
    setLineFilter("all");
    setChannelFilter("all");
    setAttentionFilter("all");
    setQ("");
    navigate({ to: "/speakers", search: {} });
  }

  const totalPreStage = preStageFiltered.length;

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 animate-fade-in">
      <Card className="mb-5 rounded-xl border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-900">
        This is a secondary cross-event view for searching and re-recruiting. Day to day, open an
        event and work its own speaker list or board.
      </Card>
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="accent-bar mb-3" />
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <LayoutGrid className="h-6 w-6 text-primary" />
            All speakers (cross-event)
          </h1>

          <p className="text-sm text-muted-foreground mt-1">
            {view === "board"
              ? "Drag cards to move speakers between stages."
              : "One-column feed - filter by stage above, switch to Board to drag between stages."}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* List / Board toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                view === "list" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900",
              )}
            >
              <Rows3 className="h-3.5 w-3.5" />
              List
            </button>
            <button
              type="button"
              onClick={() => setView("board")}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                view === "board" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Board
            </button>
          </div>
          <Button variant="outline" onClick={() => setSyncOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            Sync
          </Button>
          <Button onClick={() => setEditing({ open: true })}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add speaker
          </Button>
        </div>
      </div>

      {/* One search bar. One filter row. Consistent across every page. */}
      <div className="mb-4 relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          className="pl-10 h-11 rounded-xl bg-white border-slate-200 shadow-sm"
          placeholder="Search by name, company or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Card className="p-3 mb-4 rounded-xl border-slate-200/70 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as StageFilter)}>
            <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses ({totalPreStage})</SelectItem>
              {COLUMNS.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.title} ({stageCounts[c.key]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <SearchableSelect
            triggerClassName="w-56 h-9"
            placeholder="Event"
            searchPlaceholder="Search events…"
            value={eventFilter}
            onValueChange={setEventFilter}
            allOption={{ value: "all", label: "All events" }}
            options={(events.data ?? [])
              .filter((e) => showPastEvents || !isPastEvent(e) || e.id === eventFilter)
              .map((e) => ({
                value: e.id,
                label: e.code + (isPastEvent(e) ? " (past)" : ""),
                keywords: e.name,
              }))}
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer px-1">
            <Checkbox checked={showPastEvents} onCheckedChange={(v) => setShowPastEvents(!!v)} />
            Show past
          </label>

          <Select value={lineFilter} onValueChange={setLineFilter}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Business line" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lines</SelectItem>
              <SelectItem value="AIAI">AIAI</SelectItem>
              <SelectItem value="CSC">CSC</SelectItem>
            </SelectContent>
          </Select>

          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Channel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="untagged">Untagged</SelectItem>
              {OUTREACH_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>{labels.outreachChannel[c as OutreachChannel]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={attentionFilter} onValueChange={(v) => setAttentionFilter(v as any)}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Attention" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any attention</SelectItem>
              <SelectItem value="any">Needs attention</SelectItem>
              <SelectItem value="reply">Reply needed</SelectItem>
              <SelectItem value="follow_up">Follow up</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="stalest">Sort: Stalest</SelectItem>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="event">Sort: Event</SelectItem>
              <SelectItem value="status">Sort: Status</SelectItem>
            </SelectContent>
          </Select>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer px-1">
            <Checkbox checked={callScheduledOnly} onCheckedChange={(v) => setCallScheduledOnly(!!v)} /> Call scheduled
          </label>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8">
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}

          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={pipelineSorted.length > 0 && pipelineSorted.every((s: any) => selected[s.id])}
                onCheckedChange={(v) => {
                  if (v) {
                    const next = { ...selected };
                    pipelineSorted.forEach((s: any) => (next[s.id] = true));
                    setSelected(next);
                  } else {
                    const next = { ...selected };
                    pipelineSorted.forEach((s: any) => delete next[s.id]);
                    setSelected(next);
                  }
                }}
              />
              Select all
            </label>
            <div className="text-xs text-muted-foreground tabular-nums">
              {pipelineSorted.length} shown
            </div>
          </div>
        </div>
      </Card>


      <div className="mb-4">
        <SendHistoryPanel />
      </div>

      <details className="mb-4 group">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 select-none">
          <span className="transition-transform group-open:rotate-90">▸</span>
          Outreach channel breakdown
        </summary>
        <div className="mt-2">
          <ChannelMixPanel speakers={filtered} />
        </div>
      </details>

      {/* Selection bar */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          selectedIds.length > 0 ? "max-h-24 opacity-100 mb-4" : "max-h-0 opacity-0 mb-0"
        }`}
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 shadow-sm">
          <div className="text-sm font-medium">
            {selectedIds.length} speaker{selectedIds.length === 1 ? "" : "s"} selected
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setSelected({})}>Clear</Button>
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
              Compose email
            </Button>
          </div>
        </div>
      </div>

      {view === "list" ? (
        <div className="space-y-10">
          <LifecycleSections
            sorted={sorted}
            eventById={eventById}
            selected={selected}
            setSelected={setSelected}
            lookupHistory={lookupHistory}
            onOpenDetail={(s) => setDetailSpeaker(s)}
            onEmail={(s) => emailOne(s, eventById[s.event_id])}
            onCopyLink={copyLink}
            onEdit={(s) => setEditing({ open: true, speaker: s })}
          />
          <PastSpeakersDirectorySection />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              className={`min-w-0 rounded-xl transition-colors ${
                dragOver === col.key ? "bg-primary/5 ring-2 ring-primary/40" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOver !== col.key) setDragOver(col.key);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOver(null);
              }}
              onDrop={(e) => handleDrop(col.key, e)}
            >
              <div className="flex items-center justify-between px-1 mb-2 pt-1">
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
              <div className="space-y-2 min-h-24 px-1 pb-1">
                {grouped[col.key].length === 0 ? (
                  <div className="rounded-xl border border-dashed border-muted-foreground/25 bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                    {dragOver === col.key ? "Drop here" : "No speakers"}
                  </div>
                ) : (
                  grouped[col.key].map((s: any) => {
                    const ev = eventById[s.event_id];
                    return (
                      <SpeakerBoardCard
                        key={s.id}
                        s={s}
                        ev={ev}
                        selected={!!selected[s.id]}
                        onToggleSelect={(v) => setSelected({ ...selected, [s.id]: v })}
                        onOpenDetail={() => setDetailSpeaker(s)}
                        onEmail={() => emailOne(s, ev)}
                      />
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <SpeakerFormDialog
          open={editing.open}
          onOpenChange={(o) => setEditing(o ? editing : null)}
          speaker={editing.speaker}
        />
      )}
      <SpeakerDetailDialog
        open={!!detailSpeaker}
        onOpenChange={(o) => !o && setDetailSpeaker(null)}
        speaker={detailSpeaker}
        event={detailSpeaker ? eventById[detailSpeaker.event_id] : null}
        onEdit={() => {
          const s = detailSpeaker;
          setDetailSpeaker(null);
          if (s) setEditing({ open: true, speaker: s });
        }}
        onEmail={() => {
          const s = detailSpeaker;
          if (s) emailOne(s, eventById[s.event_id]);
        }}
      />
      <BulkEmailDialog
        open={bulkEmailOpen}
        onOpenChange={setBulkEmailOpen}
        speakers={selectedSpeakers}
        eventId={eventFilter !== "all" ? eventFilter : null}
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




/* --------------------------- Board (draggable) card --------------------------- */

function SpeakerBoardCard({
  s,
  ev,
  selected,
  onToggleSelect,
  onOpenDetail,
  onEmail,
}: {
  s: any;
  ev: any;
  selected: boolean;
  onToggleSelect: (v: boolean) => void;
  onOpenDetail: () => void;
  onEmail: () => void;
}) {
  const colKey = columnFor(s);
  const stage = stagePill[colKey];
  const alert = outreachAlert(s);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", s.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(softCard, "p-4 cursor-pointer active:cursor-grabbing")}
      onClick={onOpenDetail}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          className="mt-1"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={(v) => onToggleSelect(!!v)}
        />
        <div
          className={cn(
            "h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-[12px] font-bold text-white shadow-sm bg-gradient-to-br",
            avatarGradient[colKey],
          )}
        >
          {initialsOf(s.name)}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <div className="font-semibold text-sm truncate leading-snug">{s.name}</div>
            {s.company && (
              <div className="mt-0.5 text-xs leading-relaxed text-slate-500 truncate">
                {s.company}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatusPill
              className={cn(stage.cls, "text-[10px] px-2.5 py-1 font-semibold uppercase tracking-wide")}
            >
              {stage.label}
            </StatusPill>
            {ev?.code && (
              <StatusPill className={cn(eventChipCls, "text-[10px]")}>{ev.code}</StatusPill>
            )}
            {alert && (alert.type === "reply" || alert.type === "follow_up") && (
              <StatusPill className={cn(alert.cls, "text-[10px] font-semibold")}>
                {alert.icon && <alert.icon className="h-3 w-3" />}
                {alert.label}
              </StatusPill>
            )}
          </div>
          <div className="flex items-center gap-1.5 pt-0.5" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" className="h-8 px-3 text-xs" onClick={onEmail} disabled={!s.email}>
              <Mail className="h-3.5 w-3.5 mr-1.5" /> Send email
            </Button>
            {s.linkedin_url && (
              <a
                href={s.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open LinkedIn profile"
                className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-sky-50 text-sky-700 transition-colors"
              >
                <Linkedin className="h-4 w-4" />
              </a>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs ml-auto text-slate-600"
              onClick={onOpenDetail}
            >
              <Eye className="h-3.5 w-3.5 mr-1" /> Details
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* --------------------------- Lifecycle sections (list view) --------------------------- */
// Groups a filtered speaker list into three independently-selectable sections:
//   • Prospective - recruiting (new/contacted/responded/…), future events
//   • Current     - confirmed for a future event (or event with unknown date)
//   • Past        - event date has passed (kept visible for re-recruitment)
// Each section has its own select-all header and Compose email button.

function classifyLifecycle(s: any, ev: any): "prospective" | "current" | "past" {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = ev?.event_date ? new Date(ev.event_date) : null;
  if (d && d.getTime() < today.getTime()) return "past";
  if (s.status === "confirmed") return "current";
  return "prospective";
}

function LifecycleSections({
  sorted,
  eventById,
  selected,
  setSelected,
  lookupHistory,
  onOpenDetail,
  onEmail,
  onCopyLink,
  onEdit,
}: {
  sorted: any[];
  eventById: Record<string, any>;
  selected: Record<string, boolean>;
  setSelected: (v: Record<string, boolean>) => void;
  lookupHistory: (email: string | null) => any;
  onOpenDetail: (s: any) => void;
  onEmail: (s: any) => void;
  onCopyLink: (s: any) => void;
  onEdit: (s: any) => void;
}) {
  const [copyTarget, setCopyTarget] = useState<any | null>(null);
  const [bulkOpen, setBulkOpen] = useState<null | "prospective" | "current" | "past">(null);

  const groups = useMemo(() => {
    const g: Record<"prospective" | "current" | "past", any[]> = {
      prospective: [], current: [], past: [],
    };
    for (const s of sorted) g[classifyLifecycle(s, eventById[s.event_id])].push(s);
    return g;
  }, [sorted, eventById]);

  if (sorted.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground rounded-2xl">
        No speakers match these filters.
      </Card>
    );
  }

  const bulkGroup = bulkOpen ? groups[bulkOpen] : [];
  const bulkSelected = bulkGroup.filter((s) => selected[s.id]);

  return (
    <div className="space-y-8">
      {(["prospective", "current", "past"] as const).map((key) => {
        const rows = groups[key];
        const title = key === "prospective" ? "Prospective" : key === "current" ? "Current" : "Past";
        const help =
          key === "prospective"
            ? "Being recruited - not yet confirmed."
            : key === "current"
            ? "Confirmed speakers for upcoming events."
            : "Events already ran. Kept visible for re-recruitment.";
        const selectedInGroup = rows.filter((s) => selected[s.id]);
        const allChecked = rows.length > 0 && rows.every((s) => selected[s.id]);
        return (
          <section key={key} className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="accent-bar mb-2" />
                <h2 className="text-sm font-semibold">
                  {title} <span className="text-muted-foreground">({rows.length})</span>
                </h2>
                <p className="text-xs text-muted-foreground">{help}</p>
              </div>
              {rows.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(v) => {
                        const next = { ...selected };
                        if (v) rows.forEach((s) => (next[s.id] = true));
                        else rows.forEach((s) => delete next[s.id]);
                        setSelected(next);
                      }}
                    />
                    Select all
                  </label>
                  <Button
                    size="sm"
                    variant={selectedInGroup.length > 0 ? "default" : "outline"}
                    disabled={selectedInGroup.length === 0}
                    onClick={() => setBulkOpen(key)}
                  >
                    <Mail className="h-3.5 w-3.5 mr-1.5" />
                    Compose email ({selectedInGroup.length})
                  </Button>
                </div>
              )}
            </div>

            {rows.length === 0 ? (
              <Card className="p-6 text-center text-xs text-muted-foreground rounded-2xl">
                Nothing here.
              </Card>
            ) : (
              <div className="space-y-3">
                {rows.map((s: any) => {
                  const ev = eventById[s.event_id];
                  return (
                    <div key={s.id} className="space-y-1">
                      <SpeakerListCard
                        s={s}
                        ev={ev}
                        selected={!!selected[s.id]}
                        onToggleSelect={(v) => setSelected({ ...selected, [s.id]: v })}
                        onOpenDetail={() => onOpenDetail(s)}
                        onEmail={() => onEmail(s)}
                        onCopyLink={() => onCopyLink(s)}
                        onEdit={() => onEdit(s)}
                        history={lookupHistory(s.email)}
                      />
                      {key === "past" && (
                        <div className="pl-3">
                          <button
                            type="button"
                            onClick={() => setCopyTarget(s)}
                            className="text-[11px] text-primary hover:underline"
                          >
                            Copy to a new event →
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <BulkEmailDialog
        open={bulkOpen != null}
        onOpenChange={(o) => !o && setBulkOpen(null)}
        speakers={bulkSelected}
        eventId={null}
      />
      <CopyPastSpeakerDialog
        speaker={copyTarget}
        onOpenChange={(o) => !o && setCopyTarget(null)}
      />
    </div>
  );
}

function CopyPastSpeakerDialog({
  speaker,
  onOpenChange,
}: {
  speaker: any | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const events = useQuery(eventsQuery);
  const [target, setTarget] = useState("");
  const copyFn = useServerFn(copySpeakerToEvent);
  const mut = useMutation({
    mutationFn: () =>
      copyFn({ data: { source_speaker_id: speaker!.id, target_event_id: target } }),
    onSuccess: () => {
      toast.success(`Copied ${speaker?.name} as a prospect`);
      qc.invalidateQueries({ queryKey: ["speakers"] });
      onOpenChange(false);
      setTarget("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!speaker) return null;
  return (
    <Dialog open={!!speaker} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy {speaker.name} to a new event</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Creates a new prospect record on the selected event, linked back to this one so history stays intact.
          </p>
          <SearchableSelect
            triggerClassName="w-full h-10"
            placeholder="Pick an event…"
            searchPlaceholder="Search events…"
            value={target}
            onValueChange={setTarget}
            options={(events.data ?? []).map((e) => ({
              value: e.id,
              label: `${e.code} - ${e.name}`,
              keywords: e.name,
            }))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!target || mut.isPending}
          >
            {mut.isPending ? "Copying…" : "Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
