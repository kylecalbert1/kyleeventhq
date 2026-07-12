import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, CheckCircle2, Circle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import { EventFormDialog } from "@/components/dialogs/EventFormDialog";
import { WeeklyPrioritiesWidget } from "@/components/WeeklyPrioritiesWidget";
import { CapacityPanel } from "@/components/CapacityPanel";
import { NeedsAttentionWidget } from "@/components/NeedsAttentionWidget";
import { eventSummariesQuery, speakersQuery } from "@/lib/queries";
import {
  labels,
  pillClass,
  daysBetween,
  readinessTone,
  readinessClass,
  type SelfStatus,
  type BusinessLine,
} from "@/lib/status";

export const Route = createFileRoute("/_authenticated/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(eventSummariesQuery),
      context.queryClient.ensureQueryData(speakersQuery()),
    ]),
  component: EventsGrid,
});

const readinessLabel = { 1: "P1", 2: "P2", 3: "Sign-off" } as const;

function ReadinessBadge({
  n,
  due,
  done,
}: {
  n: 1 | 2 | 3;
  due: string | null | undefined;
  done: boolean;
}) {
  const tone = readinessTone(due, done);
  const cls = readinessClass[tone];
  const days = due ? daysBetween(new Date(), new Date(due)) : null;
  let right = "—";
  if (done) right = "✓";
  else if (days !== null)
    right = days < 0 ? `${Math.abs(days)}d late` : days === 0 ? "today" : `${days}d`;
  return (
    <div
      className={`flex items-center justify-between gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${cls}`}
    >
      <span>{readinessLabel[n]}</span>
      <span className="tabular-nums">{right}</span>
    </div>
  );
}

type SortKey = "launch" | "health" | "confirmed_pct" | "banners_pct";
type StatusFilter = "all" | "on_track" | "needs_attention";
type LineFilter = "all" | BusinessLine;

const healthRank: Record<SelfStatus, number> = {
  off_track: 0,
  needs_attention: 1,
  on_track: 2,
};

function EventsGrid() {
  const { data } = useQuery(eventSummariesQuery);
  const [creating, setCreating] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("launch");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [lineFilter, setLineFilter] = useState<LineFilter>("all");
  const summaries = data ?? [];

  const filtered = useMemo(() => {
    return summaries.filter((s) => {
      const ev = s.event as any;
      const self: SelfStatus = ev.self_status ?? "on_track";
      if (lineFilter !== "all" && ev.business_line !== lineFilter) return false;
      if (statusFilter === "on_track" && self !== "on_track") return false;
      if (statusFilter === "needs_attention" && self === "on_track") return false;
      return true;
    });
  }, [summaries, statusFilter, lineFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const ea = a.event as any;
      const eb = b.event as any;
      if (sortKey === "launch") {
        const da = ea.launch_date ? new Date(ea.launch_date).getTime() : Infinity;
        const db = eb.launch_date ? new Date(eb.launch_date).getTime() : Infinity;
        return da - db;
      }
      if (sortKey === "health") {
        return (
          healthRank[(ea.self_status ?? "on_track") as SelfStatus] -
          healthRank[(eb.self_status ?? "on_track") as SelfStatus]
        );
      }
      if (sortKey === "confirmed_pct") {
        const pa = a.speakerCount ? a.confirmedCount / a.speakerCount : -1;
        const pb = b.speakerCount ? b.confirmedCount / b.speakerCount : -1;
        return pb - pa;
      }
      const pa = a.bannerTotal ? a.bannersSent / a.bannerTotal : -1;
      const pb = b.bannerTotal ? b.bannersSent / b.bannerTotal : -1;
      return pb - pa;
    });
    return arr;
  }, [filtered, sortKey]);

  return (
    <div className="p-6 md:p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="text-sm text-muted-foreground">
            All live and upcoming events at a glance.
          </p>
        </div>
        <Button
          onClick={() => setCreating(true)}
          className="transition-transform hover:scale-[1.02]"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New event
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-1">
          <WeeklyPrioritiesWidget />
        </div>
        <div className="lg:col-span-1">
          <NeedsAttentionWidget />
        </div>
        <div className="lg:col-span-1">
          <CapacityPanel summaries={summaries} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="text-xs text-muted-foreground mr-1">Sort</div>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="launch">Soonest to launch</SelectItem>
            <SelectItem value="health">Health (needs attention first)</SelectItem>
            <SelectItem value="confirmed_pct">Speakers confirmed %</SelectItem>
            <SelectItem value="banners_pct">Banners sent %</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-2 mr-1">Status</div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="on_track">On track</SelectItem>
            <SelectItem value="needs_attention">Needs attention</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-2 mr-1">Line</div>
        <Select
          value={lineFilter}
          onValueChange={(v) => setLineFilter(v as LineFilter)}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lines</SelectItem>
            <SelectItem value="AIAI">AIAI</SelectItem>
            <SelectItem value="CSC">CSC</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto tabular-nums">
          {sorted.length} event{sorted.length === 1 ? "" : "s"}
        </div>
      </div>

      {sorted.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="text-sm text-muted-foreground">No events match these filters.</div>
          <Button variant="outline" className="mt-4" onClick={() => setCreating(true)}>
            Add an event
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sorted.map((s) => {
            const ev = s.event as typeof s.event & {
              proof1_due?: string | null;
              proof2_due?: string | null;
              final_signoff_due?: string | null;
              proof1_done?: boolean;
              proof2_done?: boolean;
              signoff_done?: boolean;
              self_status?: SelfStatus;
            };
            const days = daysBetween(new Date(), ev.launch_date ? new Date(ev.launch_date) : null);
            const selfStatus = ev.self_status ?? "on_track";
            return (
              <Link
                key={ev.id}
                to="/events/$eventId"
                params={{ eventId: ev.id }}
                className="group"
              >
                <Card className="p-5 h-full transition-all duration-200 ease-out hover:shadow-lg hover:border-primary/30 group-hover:-translate-y-1">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-muted-foreground">{ev.code}</div>
                      <div className="font-semibold text-base leading-tight mt-0.5 truncate group-hover:text-primary transition-colors">
                        {ev.name}
                      </div>
                    </div>
                    <StatusPill className={pillClass.businessLine[ev.business_line]}>
                      {ev.business_line}
                    </StatusPill>
                  </div>

                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {ev.launch_date
                        ? days === null
                          ? "—"
                          : days < 0
                            ? `Launched ${Math.abs(days)}d ago`
                            : days === 0
                              ? "Launches today"
                              : `${days}d to launch`
                        : "No launch date"}
                    </div>
                    <StatusPill className={pillClass.selfStatus[selfStatus]}>
                      {labels.selfStatus[selfStatus]}
                    </StatusPill>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    <ReadinessBadge n={1} due={ev.proof1_due} done={!!ev.proof1_done} />
                    <ReadinessBadge n={2} due={ev.proof2_due} done={!!ev.proof2_done} />
                    <ReadinessBadge n={3} due={ev.final_signoff_due} done={!!ev.signoff_done} />
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <StatusPill className={pillClass.website[ev.website_status]}>
                      {labels.website[ev.website_status]}
                    </StatusPill>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <Row
                      icon={s.kickoffDone ? "done" : "pending"}
                      label="Kickoff"
                      value={
                        s.kickoffExists ? (s.kickoffDone ? "Done" : "Pending") : "Not scheduled"
                      }
                    />
                    <Row
                      icon={s.washupDone ? "done" : "pending"}
                      label="Washup"
                      value={
                        s.washupExists ? (s.washupDone ? "Done" : "Pending") : "Not scheduled"
                      }
                    />
                    <div className="flex justify-between text-muted-foreground pt-1">
                      <span>Speakers</span>
                      <span className="font-medium text-foreground">
                        {s.confirmedCount}/{s.speakerCount} confirmed
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Banners</span>
                      <span className="font-medium text-foreground">
                        {s.bannersSent}/{s.bannerTotal} sent
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <EventFormDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: "done" | "pending";
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon === "done" ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Circle className="h-3.5 w-3.5" />
      )}
      <span className="flex-1">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
