import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { z } from "zod";
import {
  Reply,
  Clock,
  AtSign,
  MessageSquare,
  RefreshCw,
  CheckCircle2,
  Check,
  Eye,
  Inbox as InboxIcon,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { queryOptions } from "@tanstack/react-query";
import { StatusPill } from "@/components/StatusPill";
import { SpeakerDetailDialog } from "@/components/dialogs/SpeakerDetailDialog";
import { eventsQuery, speakersQuery } from "@/lib/queries";
import { listReplyQueue, ackReplyQueueRow, scanReplyQueue } from "@/lib/reply-queue.functions";
import { initialsOf, openGmailThread, gmailThreadUrl } from "@/lib/gmail";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  filter: z.enum(["speaker_reply", "mention", "follow_up", "all"]).optional(),
});

export const replyQueueQuery = queryOptions({
  queryKey: ["replyQueue"],
  queryFn: () => listReplyQueue(),
});

export const Route = createFileRoute("/_authenticated/reply-needed")({
  validateSearch: searchSchema,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(replyQueueQuery),
      context.queryClient.ensureQueryData(eventsQuery),
      context.queryClient.ensureQueryData(speakersQuery()),
    ]),
  component: ReplyNeededPage,
});

type Row = {
  id: string;
  speaker_id: string | null;
  event_id: string | null;
  person_email: string;
  person_name: string | null;
  gmail_thread_id: string;
  last_message_id: string;
  last_message_at: string;
  reason: "speaker_reply" | "mention" | "follow_up";
  summary: string | null;
  subject: string | null;
  acked_message_id: string | null;
  acked_at: string | null;
};

const REASON_META: Record<
  Row["reason"],
  { label: string; icon: typeof Reply; chip: string; barColor: string }
> = {
  speaker_reply: {
    label: "Reply needed",
    icon: Reply,
    chip: "bg-rose-100 text-rose-700 ring-rose-200",
    barColor: "before:bg-rose-500",
  },
  mention: {
    label: "You're mentioned",
    icon: AtSign,
    chip: "bg-indigo-100 text-indigo-700 ring-indigo-200",
    barColor: "before:bg-indigo-500",
  },
  follow_up: {
    label: "Follow up",
    icon: Clock,
    chip: "bg-amber-100 text-amber-800 ring-amber-200",
    barColor: "before:bg-amber-500",
  },
};

function daysAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400_000);
  if (d < 1) return "today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ReplyNeededPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const events = useQuery(eventsQuery);
  const speakers = useQuery(speakersQuery());
  const queue = useQuery(replyQueueQuery);

  const eventById = useMemo(
    () => Object.fromEntries((events.data ?? []).map((e: any) => [e.id, e])),
    [events.data],
  );
  const speakerById = useMemo(
    () => Object.fromEntries((speakers.data ?? []).map((s: any) => [s.id, s])),
    [speakers.data],
  );

  const ackFn = useServerFn(ackReplyQueueRow);
  const scanFn = useServerFn(scanReplyQueue);

  const ackMutation = useMutation({
    mutationFn: (id: string) => ackFn({ data: { id } }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["replyQueue"] });
      const prev = qc.getQueryData<{ rows: Row[]; total: number }>(["replyQueue"]);
      if (prev) {
        qc.setQueryData(["replyQueue"], {
          ...prev,
          rows: prev.rows.filter((r) => r.id !== id),
        });
      }
      return { prev };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["replyQueue"], ctx.prev);
      toast.error(e instanceof Error ? e.message : "Failed");
    },
    onSuccess: () => {
      toast.success("Marked as replied");
      qc.invalidateQueries({ queryKey: ["speakers"] });
      qc.invalidateQueries({ queryKey: ["eventSummaries"] });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["replyQueue"] }),
  });

  const scanMutation = useMutation({
    mutationFn: () => scanFn({ data: { lookback_days: 14 } }),
    onSuccess: (r) => {
      if (!r.connected) {
        toast.error("Gmail is not connected");
        return;
      }
      toast.success(
        `Scanned ${r.scanned} · queued ${r.queued} · auto-cleared ${r.auto_acked} · skipped ${r.skipped_auto} auto-replies`,
      );
      qc.invalidateQueries({ queryKey: ["replyQueue"] });
      qc.invalidateQueries({ queryKey: ["speakers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Scan failed"),
  });

  const rows = (queue.data?.rows ?? []) as Row[];
  const activeFilter = search.filter ?? "all";
  const counts = useMemo(() => {
    const c = { speaker_reply: 0, mention: 0, follow_up: 0, all: rows.length };
    for (const r of rows) c[r.reason]++;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    if (activeFilter === "all") return rows;
    return rows.filter((r) => r.reason === activeFilter);
  }, [rows, activeFilter]);

  const grouped = useMemo(() => {
    const speakerReply = filtered.filter((r) => r.reason === "speaker_reply");
    const mention = filtered.filter((r) => r.reason === "mention");
    const followUp = filtered.filter((r) => r.reason === "follow_up");
    return { speakerReply, mention, followUp };
  }, [filtered]);

  function setFilter(f: "all" | Row["reason"]) {
    navigate({
      to: "/reply-needed",
      search: f === "all" ? {} : { filter: f },
      replace: true,
    });
  }

  const [detailSpeaker, setDetailSpeaker] = useState<any | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="accent-bar mb-3" />
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <InboxIcon className="h-6 w-6 text-indigo-600" />
              Reply Needed
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Threads that genuinely need you. Auto-replies and calendar RSVPs
              are filtered out. Your own replies clear rows automatically.
            </p>
          </div>
          <Button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="rounded-full"
          >
            {scanMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            Scan Gmail
          </Button>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChip label={`All (${counts.all})`} active={activeFilter === "all"} onClick={() => setFilter("all")} />
          <FilterChip
            label={`Reply needed (${counts.speaker_reply})`}
            icon={Reply}
            active={activeFilter === "speaker_reply"}
            activeClass="bg-rose-600 text-white hover:bg-rose-600"
            inactiveClass="text-rose-700"
            onClick={() => setFilter("speaker_reply")}
          />
          <FilterChip
            label={`Mentions (${counts.mention})`}
            icon={AtSign}
            active={activeFilter === "mention"}
            activeClass="bg-indigo-600 text-white hover:bg-indigo-600"
            inactiveClass="text-indigo-700"
            onClick={() => setFilter("mention")}
          />
          <FilterChip
            label={`Follow up (${counts.follow_up})`}
            icon={Clock}
            active={activeFilter === "follow_up"}
            activeClass="bg-amber-600 text-white hover:bg-amber-600"
            inactiveClass="text-amber-800"
            onClick={() => setFilter("follow_up")}
          />
        </div>

        {filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-emerald-500" />
            <p className="text-sm text-muted-foreground">
              You're all caught up. Nothing here needs a reply right now.
            </p>
          </Card>
        ) : (
          <div className="space-y-8">
            <Section title="Reply needed" rows={grouped.speakerReply} onAck={ackMutation.mutate} ackPending={ackMutation.isPending} speakerById={speakerById} eventById={eventById} onView={setDetailSpeaker} />
            <Section title="You're mentioned" rows={grouped.mention} onAck={ackMutation.mutate} ackPending={ackMutation.isPending} speakerById={speakerById} eventById={eventById} onView={setDetailSpeaker} />
            <Section title="Follow up (no reply 3+ days)" rows={grouped.followUp} onAck={ackMutation.mutate} ackPending={ackMutation.isPending} speakerById={speakerById} eventById={eventById} onView={setDetailSpeaker} followUp />
          </div>
        )}

        <SpeakerDetailDialog
          open={!!detailSpeaker}
          onOpenChange={(o) => !o && setDetailSpeaker(null)}
          speaker={detailSpeaker}
          event={detailSpeaker ? eventById[detailSpeaker.event_id] : null}
          onEdit={() => setDetailSpeaker(null)}
          onEmail={() => setDetailSpeaker(null)}
        />
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  icon: Icon,
  activeClass,
  inactiveClass,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: typeof Reply;
  activeClass?: string;
  inactiveClass?: string;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className={cn(
        "rounded-full",
        active ? activeClass : inactiveClass,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 mr-1.5" />}
      {label}
    </Button>
  );
}

function Section({
  title,
  rows,
  onAck,
  ackPending,
  speakerById,
  eventById,
  onView,
  followUp,
}: {
  title: string;
  rows: Row[];
  onAck: (id: string) => void;
  ackPending: boolean;
  speakerById: Record<string, any>;
  eventById: Record<string, any>;
  onView: (s: any) => void;
  followUp?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title} ({rows.length})
      </h2>
      <div className="space-y-3">
        {rows.map((r) => (
          <RowCard
            key={r.id}
            r={r}
            onAck={onAck}
            ackPending={ackPending}
            speaker={r.speaker_id ? speakerById[r.speaker_id] : null}
            event={r.event_id ? eventById[r.event_id] : null}
            onView={onView}
            followUp={followUp}
          />
        ))}
      </div>
    </section>
  );
}

function RowCard({
  r,
  onAck,
  ackPending,
  speaker,
  event,
  onView,
  followUp,
}: {
  r: Row;
  onAck: (id: string) => void;
  ackPending: boolean;
  speaker: any;
  event: any;
  onView: (s: any) => void;
  followUp?: boolean;
}) {
  const meta = REASON_META[r.reason];
  const Icon = meta.icon;
  const display = r.person_name ?? r.person_email ?? "Unknown";
  const isThreadFake = r.gmail_thread_id.startsWith("seed:");
  return (
    <Card className="p-4">
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[13px] font-bold text-white shadow-sm bg-gradient-to-br from-indigo-500 to-indigo-700">
          {initialsOf(display)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => speaker && onView(speaker)}
                disabled={!speaker}
                className="text-left text-base font-semibold text-slate-900 hover:text-indigo-700 transition-colors disabled:hover:text-slate-900"
              >
                {display}
              </button>
              {r.person_email && r.person_name && (
                <div className="text-xs text-slate-500 truncate">{r.person_email}</div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {event?.code && (
                <StatusPill className="bg-indigo-50 text-indigo-700 ring-indigo-200 text-[11px]">
                  {event.code}
                </StatusPill>
              )}
              <StatusPill className={cn(meta.chip, "text-[11px] font-semibold")}>
                <Icon className="h-3 w-3" />
                {meta.label}
              </StatusPill>
            </div>
          </div>

          {r.subject && (
            <div className="mt-1.5 text-sm text-slate-700 truncate">
              <span className="text-slate-400">Subject:</span> {r.subject}
            </div>
          )}
          {r.summary && (
            <div className="mt-1 text-sm text-slate-600 italic">"{r.summary}"</div>
          )}

          <div className="mt-2 text-xs text-slate-500">
            Last message: {fmt(r.last_message_at)}{" "}
            <span className="text-slate-400">· {daysAgo(r.last_message_at)}</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!isThreadFake && (
              <a
                href={gmailThreadUrl(r.gmail_thread_id)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openGmailThread(r.gmail_thread_id);
                }}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 ring-1 ring-rose-200 transition-colors"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Open thread
              </a>
            )}
            <Button
              size="sm"
              onClick={() => onAck(r.id)}
              disabled={ackPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              {followUp ? "Mark followed up" : "Mark replied"}
            </Button>
            {speaker && (
              <Button size="sm" variant="ghost" onClick={() => onView(speaker)}>
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                View details
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
