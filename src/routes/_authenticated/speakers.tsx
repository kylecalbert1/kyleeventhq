import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { z } from "zod";
import {
  Plus,
  Send,
  Mail,
  Link2,
  Linkedin,
  Eye,
  Sparkles,
  Reply,
  Clock,
  Search,
  X,
  AlertTriangle,
  LayoutGrid,
  Rows3,
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
import { bulkMarkBannerSent, updateSpeaker } from "@/lib/speakers.functions";
import {
  labels,
  pillClass,
  daysBetween,
  OUTREACH_CHANNELS,
  type OutreachChannel,
} from "@/lib/status";
import { firstNameOf, initialsOf } from "@/lib/gmail";
import { sendGmailEmail } from "@/lib/email.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  attention: z.enum(["reply", "follow_up", "any"]).optional(),
});

export const Route = createFileRoute("/_authenticated/speakers")({
  validateSearch: searchSchema,
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
  if (s.banner_status === "sent" || s.banner_status === "confirmed_live") return "banner_sent";
  if (s.status === "confirmed") return "confirmed";
  if (s.status === "responded") return "responded";
  return "contacted";
}

function patchForColumn(target: ColKey): Record<string, any> {
  switch (target) {
    case "contacted":
      return { status: "contacted" };
    case "responded":
      return { status: "responded" };
    case "confirmed":
      return { status: "confirmed" };
    case "banner_sent":
      return { status: "confirmed", banner_status: "sent" };
    case "bio_headshot_in":
      return { bio_received: true, headshot_received: true };
  }
}

// Distinct color per stage — solid pills, like the reference.
const stagePill: Record<ColKey, { label: string; cls: string }> = {
  contacted: { label: "Contacted", cls: "bg-sky-100 text-sky-800 ring-sky-200" },
  responded: { label: "Responded", cls: "bg-violet-100 text-violet-800 ring-violet-200" },
  confirmed: { label: "Confirmed", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  banner_sent: { label: "Banner Sent", cls: "bg-amber-100 text-amber-900 ring-amber-200" },
  bio_headshot_in: { label: "Bio/Headshot In", cls: "bg-teal-100 text-teal-800 ring-teal-200" },
};

const avatarGradient: Record<ColKey, string> = {
  contacted: "from-sky-500 to-sky-600",
  responded: "from-violet-500 to-violet-600",
  confirmed: "from-emerald-500 to-emerald-600",
  banner_sent: "from-amber-500 to-amber-600",
  bio_headshot_in: "from-teal-500 to-teal-600",
};

// Event code pill — subtle indigo so it reads like a tag in the reference.
const eventChipCls = "bg-indigo-50 text-indigo-700 ring-indigo-200";
const missingChipCls =
  "border border-orange-300 text-orange-800 bg-orange-50 ring-0";

type OutreachAlertT =
  | { type: "reply"; label: "Reply needed"; cls: string; icon: typeof Reply }
  | { type: "follow_up"; label: "Follow up"; cls: string; icon: typeof Clock }
  | { type: "no_contact"; label: "No contact logged"; cls: string; icon: null }
  | null;

function outreachAlert(s: any): OutreachAlertT {
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
    return { type: "reply", label: "Reply needed", cls: "bg-rose-100 text-rose-700 ring-rose-200", icon: Reply };
  }
  if (direction === "outbound" && days > 7) {
    return { type: "follow_up", label: "Follow up", cls: "bg-amber-100 text-amber-800 ring-amber-200", icon: Clock };
  }
  return null;
}

type SortKey = "stalest" | "name" | "event" | "status";
type ViewMode = "list" | "board";
type StageFilter = "all" | ColKey;

function fmtShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Shared soft-card style — reused on Events and Banners for consistency.
export const softCard =
  "bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.05)] hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_10px_28px_rgba(15,23,42,0.08)] transition-all duration-200";

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
  const [missingBio, setMissingBio] = useState(false);
  const [missingHeadshot, setMissingHeadshot] = useState(false);
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
      if (missingBio && s.bio_received) return false;
      if (missingHeadshot && s.headshot_received) return false;
      if (attentionFilter !== "all") {
        const a = outreachAlert(s);
        if (!a) return false;
        if (attentionFilter === "reply" && a.type !== "reply") return false;
        if (attentionFilter === "follow_up" && a.type !== "follow_up") return false;
        if (attentionFilter === "any" && a.type !== "reply" && a.type !== "follow_up") return false;
      }
      if (term) {
        const hay = `${s.name ?? ""} ${s.company ?? ""} ${s.email ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [speakers.data, eventFilter, lineFilter, channelFilter, missingBio, missingHeadshot, attentionFilter, q, eventById]);

  // Stage counts (pre-stage-filter, so the dropdown shows real totals).
  const stageCounts = useMemo(() => {
    const c: Record<ColKey, number> = {
      contacted: 0, responded: 0, confirmed: 0, banner_sent: 0, bio_headshot_in: 0,
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
        const rank: Record<string, number> = { contacted: 0, responded: 1, confirmed: 2, declined: 3 };
        return (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      }
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : -Infinity;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : -Infinity;
      return ta - tb;
    });
    return arr;
  }, [filtered, sortKey, eventById]);

  const grouped: Record<ColKey, any[]> = {
    contacted: [], responded: [], confirmed: [], banner_sent: [], bio_headshot_in: [],
  };
  sorted.forEach((s: any) => grouped[columnFor(s)].push(s));

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
    const firstName = firstNameOf(s.name);
    const code = ev?.code ?? "our upcoming event";
    setConfirmEmail({
      to: s.email,
      recipientName: firstName,
      subject: `${code} — quick check-in`,
      body: `Hi ${firstName},\n\nJust following up on your session for ${code}. Let me know if you need anything from us — happy to help move things forward.\n\nThanks!`,
      templateType: "custom",
      eventId: s.event_id ?? null,
      speakerId: s.id,
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

  const hasFilters =
    stageFilter !== "all" ||
    eventFilter !== "all" ||
    lineFilter !== "all" ||
    channelFilter !== "all" ||
    missingBio ||
    missingHeadshot ||
    attentionFilter !== "all" ||
    q.trim() !== "";

  function clearFilters() {
    setStageFilter("all");
    setEventFilter("all");
    setLineFilter("all");
    setChannelFilter("all");
    setMissingBio(false);
    setMissingHeadshot(false);
    setAttentionFilter("all");
    setQ("");
    navigate({ to: "/speakers", search: {} });
  }

  const totalPreStage = preStageFiltered.length;

  return (
    <div className="p-6 md:p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Speaker pipeline</h1>
          <p className="text-sm text-muted-foreground">
            {view === "board"
              ? "Drag cards to move speakers between stages."
              : "One-column feed — filter by stage above, switch to Board to drag between stages."}
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

      {/* Primary Status filter — reference-style select */}
      <div className="mb-3">
        <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as StageFilter)}>
          <SelectTrigger
            className="h-11 w-full sm:w-[420px] bg-white border-slate-200 shadow-sm rounded-xl px-4 text-sm font-medium"
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Status
              </span>
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses ({totalPreStage})</SelectItem>
            {COLUMNS.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.title} ({stageCounts[c.key]})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Full-width search */}
      <div className="mb-4 relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          className="pl-10 h-11 rounded-xl bg-white border-slate-200 shadow-sm"
          placeholder="Search by name, company or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Secondary filters */}
      <Card className="p-3 mb-4 rounded-xl border-slate-200/70 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Sort by" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="stalest">Sort: Stalest contact</SelectItem>
              <SelectItem value="name">Sort: Name A–Z</SelectItem>
              <SelectItem value="event">Sort: Event</SelectItem>
              <SelectItem value="status">Sort: Status</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {(events.data ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={lineFilter} onValueChange={setLineFilter}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lines</SelectItem>
              <SelectItem value="AIAI">AIAI</SelectItem>
              <SelectItem value="CSC">CSC</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="untagged">Untagged</SelectItem>
              {OUTREACH_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>{labels.outreachChannel[c as OutreachChannel]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={attentionFilter} onValueChange={(v) => setAttentionFilter(v as any)}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Attention: all</SelectItem>
              <SelectItem value="any">Needs attention</SelectItem>
              <SelectItem value="reply">Reply needed</SelectItem>
              <SelectItem value="follow_up">Follow up</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer px-1">
            <Checkbox checked={missingBio} onCheckedChange={(v) => setMissingBio(!!v)} /> Missing bio
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer px-1">
            <Checkbox checked={missingHeadshot} onCheckedChange={(v) => setMissingHeadshot(!!v)} /> Missing headshot
          </label>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8">
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground cursor-pointer px-2 py-1 rounded-md hover:bg-muted/60 transition-colors">
            <Checkbox
              checked={sorted.length > 0 && sorted.every((s: any) => selected[s.id])}
              onCheckedChange={(v) => {
                if (v) {
                  const next = { ...selected };
                  sorted.forEach((s: any) => (next[s.id] = true));
                  setSelected(next);
                } else {
                  const next = { ...selected };
                  sorted.forEach((s: any) => delete next[s.id]);
                  setSelected(next);
                }
              }}
            />
            Select all visible
          </label>
          <div className="text-xs text-muted-foreground tabular-nums">
            {sorted.length} shown
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
        <div className="space-y-3">
          {sorted.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground rounded-2xl">
              No speakers match these filters.
            </Card>
          ) : (
            sorted.map((s: any) => {
              const ev = eventById[s.event_id];
              return (
                <SpeakerListCard
                  key={s.id}
                  s={s}
                  ev={ev}
                  selected={!!selected[s.id]}
                  onToggleSelect={(v) => setSelected({ ...selected, [s.id]: v })}
                  onOpenDetail={() => setDetailSpeaker(s)}
                  onEmail={() => emailOne(s, ev)}
                  onCopyLink={() => copyLink(s)}
                  onEdit={() => setEditing({ open: true, speaker: s })}
                />
              );
            })
          )}
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

/* ------------------------- Reference-style list card ------------------------- */

function SpeakerListCard({
  s,
  ev,
  selected,
  onToggleSelect,
  onOpenDetail,
  onEmail,
  onCopyLink,
  onEdit,
}: {
  s: any;
  ev: any;
  selected: boolean;
  onToggleSelect: (v: boolean) => void;
  onOpenDetail: () => void;
  onEmail: () => void;
  onCopyLink: () => void;
  onEdit: () => void;
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
        {/* checkbox + avatar */}
        <div className="flex flex-col items-center gap-2 pt-0.5">
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onToggleSelect(!!v)}
          />
          <div
            className={cn(
              "h-11 w-11 rounded-full flex items-center justify-center text-[13px] font-bold text-white shadow-sm bg-gradient-to-br",
              avatarGradient[colKey],
            )}
          >
            {initialsOf(s.name)}
          </div>
        </div>

        {/* main body */}
        <div className="flex-1 min-w-0">
          {/* Top row: name + status pill (left)   Copy Link (right) */}
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
              {ev?.code && (
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

          {/* Title at Company */}
          {titleAtCompany && (
            <div className="mt-1 text-sm text-slate-500 truncate">{titleAtCompany}</div>
          )}

          {/* Email + LinkedIn chip + channel */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {s.email && (
              <span className="text-sm text-slate-600 truncate">{s.email}</span>
            )}
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
              <StatusPill
                className={cn(
                  pillClass.outreachChannel[s.outreach_channel as OutreachChannel],
                  "text-[11px]",
                )}
              >
                {labels.outreachChannel[s.outreach_channel as OutreachChannel]}
              </StatusPill>
            )}
          </div>

          {/* Warning pills */}
          {(!s.bio_received || !s.headshot_received) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {!s.bio_received && (
                <StatusPill className={cn(missingChipCls, "text-[11px]")}>
                  <AlertTriangle className="h-3 w-3" /> Missing bio
                </StatusPill>
              )}
              {!s.headshot_received && (
                <StatusPill className={cn(missingChipCls, "text-[11px]")}>
                  <AlertTriangle className="h-3 w-3" /> Missing headshot
                </StatusPill>
              )}
            </div>
          )}

          {/* Metadata line: added left, last outreach right */}
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

          {/* Outreach SLA pill */}
          {alert && (alert.type === "reply" || alert.type === "follow_up") && (
            <div className="mt-2">
              <StatusPill className={cn(alert.cls, "text-[11px] font-semibold")}>
                {alert.icon && <alert.icon className="h-3 w-3" />}
                {alert.label}
              </StatusPill>
            </div>
          )}

          {/* Bottom action row */}
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
      className={cn(softCard, "p-3 cursor-pointer active:cursor-grabbing")}
      onClick={onOpenDetail}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          className="mt-1"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={(v) => onToggleSelect(!!v)}
        />
        <div
          className={cn(
            "h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm bg-gradient-to-br",
            avatarGradient[colKey],
          )}
        >
          {initialsOf(s.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate leading-tight">{s.name}</div>
          {s.company && (
            <div className="text-xs text-slate-500 truncate">{s.company}</div>
          )}
          <div className="flex flex-wrap gap-1 mt-2">
            <StatusPill className={cn(stage.cls, "text-[10px]")}>{stage.label}</StatusPill>
            {ev?.code && (
              <StatusPill className={cn(eventChipCls, "text-[10px]")}>{ev.code}</StatusPill>
            )}
            {alert && (alert.type === "reply" || alert.type === "follow_up") && (
              <StatusPill className={cn(alert.cls, "text-[10px]")}>
                {alert.icon && <alert.icon className="h-3 w-3" />}
                {alert.label}
              </StatusPill>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={onEmail}
              disabled={!s.email}
            >
              <Mail className="h-3.5 w-3.5 mr-1" /> Email
            </Button>
            {s.linkedin_url && (
              <a
                href={s.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open LinkedIn profile"
                className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-sky-50 text-sky-700 transition-colors"
              >
                <Linkedin className="h-3.5 w-3.5" />
              </a>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs ml-auto"
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
