import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Plus,
  CheckCircle2,
  Circle,
  Calendar,
  Search,
  X,
  CalendarDays,
  Users,
  ImageIcon,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Not set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not set";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}


type KpiTone = "violet" | "emerald" | "sky" | "amber";

const kpiTone: Record<
  KpiTone,
  { box: string; icon: string; label: string; sub: string; accent: string }
> = {
  violet: {
    box: "bg-violet-50 ring-violet-100",
    icon: "bg-violet-100 text-violet-700",
    label: "text-violet-900",
    sub: "text-violet-700/70",
    accent: "text-violet-900",
  },
  emerald: {
    box: "bg-emerald-50 ring-emerald-100",
    icon: "bg-emerald-100 text-emerald-700",
    label: "text-emerald-900",
    sub: "text-emerald-700/70",
    accent: "text-emerald-900",
  },
  sky: {
    box: "bg-sky-50 ring-sky-100",
    icon: "bg-sky-100 text-sky-700",
    label: "text-sky-900",
    sub: "text-sky-700/70",
    accent: "text-sky-900",
  },
  amber: {
    box: "bg-amber-50 ring-amber-100",
    icon: "bg-amber-100 text-amber-800",
    label: "text-amber-900",
    sub: "text-amber-800/70",
    accent: "text-amber-900",
  },
};

function KpiBox({
  tone,
  label,
  value,
  sub,
  icon: Icon,
}: {
  tone: KpiTone;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: typeof Users;
}) {
  const t = kpiTone[tone];
  return (
    <div
      className={`rounded-xl ring-1 ${t.box} p-4 flex items-start gap-3 transition-transform hover:-translate-y-0.5 hover:shadow-sm`}
    >
      <div className={`shrink-0 rounded-lg ${t.icon} h-10 w-10 flex items-center justify-center`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className={`text-[11px] font-semibold uppercase tracking-wider ${t.sub}`}>
          {label}
        </div>
        <div className={`mt-0.5 text-2xl font-semibold tabular-nums leading-tight ${t.accent}`}>
          {value}
        </div>
        {sub && <div className={`text-xs mt-0.5 ${t.sub}`}>{sub}</div>}
      </div>
    </div>
  );
}

function ratioPillClass(numerator: number, denominator: number, palette: "confirmed" | "banners") {
  const pct = denominator === 0 ? 0 : numerator / denominator;
  if (palette === "confirmed") {
    if (denominator === 0) return "bg-slate-100 text-slate-600 ring-slate-200";
    if (pct >= 1) return "bg-emerald-100 text-emerald-800 ring-emerald-200";
    if (pct >= 0.7) return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    if (pct >= 0.4) return "bg-amber-100 text-amber-800 ring-amber-200";
    return "bg-rose-100 text-rose-700 ring-rose-200";
  }
  // banners
  if (denominator === 0) return "bg-slate-100 text-slate-600 ring-slate-200";
  if (pct >= 1) return "bg-emerald-100 text-emerald-800 ring-emerald-200";
  if (pct >= 0.5) return "bg-sky-100 text-sky-800 ring-sky-200";
  return "bg-amber-100 text-amber-800 ring-amber-200";
}

function EventsGrid() {
  const { data } = useQuery(eventSummariesQuery);
  const [creating, setCreating] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("launch");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [lineFilter, setLineFilter] = useState<LineFilter>("all");
  const [q, setQ] = useState("");
  const [prioritiesOpen, setPrioritiesOpen] = useState(false);
  const summaries = data ?? [];

  // KPI aggregates across ACTIVE events (launch in future OR no launch date set)
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const kpi = useMemo(() => {
    const active = summaries.filter((s) => {
      const ev: any = s.event;
      if (!ev.launch_date) return true;
      return new Date(ev.launch_date) >= now;
    });
    let speakers = 0,
      confirmed = 0,
      banners = 0,
      bannersSent = 0,
      attention = 0;
    for (const s of active) {
      speakers += s.speakerCount;
      confirmed += s.confirmedCount;
      banners += s.bannerTotal;
      bannersSent += s.bannersSent;
      const self = (s.event as any).self_status ?? "on_track";
      if (self !== "on_track") attention++;
    }
    return {
      activeCount: active.length,
      speakers,
      confirmed,
      speakersOpen: Math.max(0, speakers - confirmed),
      banners,
      bannersSent,
      bannersPending: Math.max(0, banners - bannersSent),
      attention,
    };
  }, [summaries]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return summaries.filter((s) => {
      const ev = s.event as any;
      const self: SelfStatus = ev.self_status ?? "on_track";
      if (lineFilter !== "all" && ev.business_line !== lineFilter) return false;
      if (statusFilter === "on_track" && self !== "on_track") return false;
      if (statusFilter === "needs_attention" && self === "on_track") return false;
      if (term) {
        const hay = `${ev.name ?? ""} ${ev.code ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [summaries, statusFilter, lineFilter, q]);

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

  const hasFilters = q.trim() !== "" || statusFilter !== "all" || lineFilter !== "all";

  return (
    <div className="p-6 md:p-8 animate-fade-in space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
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

      {/* Section: KPIs */}
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiBox
            tone="violet"
            icon={CalendarDays}
            label="Active events"
            value={kpi.activeCount}
            sub={`${summaries.length} total tracked`}
          />
          <KpiBox
            tone="emerald"
            icon={Users}
            label="Speakers confirmed"
            value={
              <>
                {kpi.confirmed}
                <span className="text-muted-foreground/70 text-lg">/{kpi.speakers}</span>
              </>
            }
            sub={`${kpi.speakersOpen} still open`}
          />
          <KpiBox
            tone="sky"
            icon={ImageIcon}
            label="Banners sent"
            value={
              <>
                {kpi.bannersSent}
                <span className="text-muted-foreground/70 text-lg">/{kpi.banners}</span>
              </>
            }
            sub={`${kpi.bannersPending} pending`}
          />
          <KpiBox
            tone="amber"
            icon={AlertTriangle}
            label="Needing attention"
            value={kpi.attention}
            sub={
              kpi.attention === 0
                ? "All events on track"
                : `${kpi.attention} of ${kpi.activeCount} active`
            }
          />
        </div>
      </section>

      {/* Section: Needs attention + Workload */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeedsAttentionWidget />
        <CapacityPanel summaries={summaries} />
      </section>

      {/* Section: Weekly priorities (secondary, collapsible) */}
      <section>
        <button
          type="button"
          onClick={() => setPrioritiesOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 rounded-lg border bg-background/60 hover:bg-accent/40 transition-colors px-4 py-2.5 text-sm"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              This week's 5 priorities
            </span>
            <span className="text-xs text-muted-foreground/70">
              {prioritiesOpen ? "hide" : "show"}
            </span>
          </div>
          {prioritiesOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {prioritiesOpen && (
          <div className="mt-3 max-w-2xl">
            <WeeklyPrioritiesWidget />
          </div>
        )}
      </section>

      {/* Section: Event list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight">All events</h2>
          <div className="text-xs text-muted-foreground tabular-nums">
            {sorted.length} of {summaries.length}
          </div>
        </div>

        <Card className="p-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-9"
                placeholder="Search event name or code"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="w-52 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="launch">Soonest to launch</SelectItem>
                <SelectItem value="health">Health (needs attention first)</SelectItem>
                <SelectItem value="confirmed_pct">Speakers confirmed %</SelectItem>
                <SelectItem value="banners_pct">Banners sent %</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="w-44 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="on_track">On track</SelectItem>
                <SelectItem value="needs_attention">Needs attention</SelectItem>
              </SelectContent>
            </Select>
            <Select value={lineFilter} onValueChange={(v) => setLineFilter(v as LineFilter)}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lines</SelectItem>
                <SelectItem value="AIAI">AIAI</SelectItem>
                <SelectItem value="CSC">CSC</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQ("");
                  setStatusFilter("all");
                  setLineFilter("all");
                }}
                className="h-8"
              >
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
        </Card>

        {sorted.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="text-sm text-muted-foreground">No events match these filters.</div>
            <Button variant="outline" className="mt-4" onClick={() => setCreating(true)}>
              Add an event
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
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
              const days = daysBetween(
                new Date(),
                ev.launch_date ? new Date(ev.launch_date) : null,
              );
              const selfStatus = ev.self_status ?? "on_track";
              const launchLabel =
                days === null
                  ? null
                  : days < 0
                    ? `Launched ${Math.abs(days)}d ago`
                    : days === 0
                      ? "Launches today"
                      : `${days}d to launch`;
              const launchTone =
                days === null
                  ? "text-slate-500"
                  : days < 0
                    ? "text-emerald-700"
                    : days <= 7
                      ? "text-rose-700"
                      : days <= 21
                        ? "text-amber-700"
                        : "text-slate-700";

              return (
                <Link
                  key={ev.id}
                  to="/events/$eventId"
                  params={{ eventId: ev.id }}
                  className="group block"
                >
                  <Card className="relative overflow-hidden bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.05)] transition-all duration-200 group-hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_10px_28px_rgba(15,23,42,0.08)] group-hover:-translate-y-0.5">
                    {/* Colored left border accent by health */}
                    <span
                      className={`absolute left-0 top-0 bottom-0 w-1 ${
                        selfStatus === "on_track"
                          ? "bg-emerald-500"
                          : selfStatus === "needs_attention"
                            ? "bg-amber-500"
                            : "bg-rose-500"
                      }`}
                    />

                    <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-4 items-center">
                      {/* LEFT: identity */}
                      <div className="md:col-span-4 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {ev.code}
                          </span>
                          <StatusPill className={pillClass.businessLine[ev.business_line]}>
                            {ev.business_line}
                          </StatusPill>
                          <StatusPill className={pillClass.selfStatus[selfStatus]}>
                            {labels.selfStatus[selfStatus]}
                          </StatusPill>
                        </div>
                        <div className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors truncate">
                          {ev.name}
                        </div>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          <StatusPill className={pillClass.website[ev.website_status]}>
                            {labels.website[ev.website_status]}
                          </StatusPill>
                          {ev.owner && (
                            <span className="text-xs text-muted-foreground">
                              Owner: {ev.owner}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* MIDDLE: Launch (most prominent) + Kickoff */}
                      <div className="md:col-span-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            Launch
                          </div>
                          <div className="mt-0.5 text-base font-semibold tabular-nums text-slate-900 leading-tight">
                            {ev.launch_date ? formatDate(ev.launch_date) : "Not set"}
                          </div>
                          {launchLabel && (
                            <div className={`text-xs font-medium mt-0.5 ${launchTone}`}>
                              {launchLabel}
                            </div>
                          )}
                        </div>
                        <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            Kickoff
                          </div>
                          <div className="mt-0.5 text-base font-semibold tabular-nums text-slate-900 leading-tight">
                            {ev.kickoff_date ? formatDate(ev.kickoff_date) : "Not set"}
                          </div>
                          <div className="text-xs font-medium mt-0.5 flex items-center gap-1">
                            {s.kickoffDone ? (
                              <>
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                <span className="text-emerald-700">Done</span>
                              </>
                            ) : s.kickoffExists ? (
                              <>
                                <Circle className="h-3 w-3 text-slate-400" />
                                <span className="text-slate-500">Pending</span>
                              </>
                            ) : (
                              <span className="text-slate-400">Not scheduled</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* RIGHT: milestones + stats */}
                      <div className="md:col-span-4 space-y-2.5">
                        <div className="grid grid-cols-3 gap-1.5">
                          <ReadinessBadge n={1} due={ev.proof1_due} done={!!ev.proof1_done} />
                          <ReadinessBadge n={2} due={ev.proof2_due} done={!!ev.proof2_done} />
                          <ReadinessBadge
                            n={3}
                            due={ev.final_signoff_due}
                            done={!!ev.signoff_done}
                          />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusPill
                            className={ratioPillClass(
                              s.confirmedCount,
                              s.speakerCount,
                              "confirmed",
                            )}
                          >
                            <Users className="h-3 w-3" />
                            {s.confirmedCount}/{s.speakerCount} confirmed
                          </StatusPill>
                          <StatusPill
                            className={ratioPillClass(s.bannersSent, s.bannerTotal, "banners")}
                          >
                            <ImageIcon className="h-3 w-3" />
                            {s.bannersSent}/{s.bannerTotal} banners
                          </StatusPill>
                          {s.washupExists && (
                            <StatusPill
                              className={
                                s.washupDone
                                  ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                                  : "bg-slate-100 text-slate-600 ring-slate-200"
                              }
                            >
                              Washup {s.washupDone ? "done" : "pending"}
                            </StatusPill>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

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
  value: React.ReactNode;
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

