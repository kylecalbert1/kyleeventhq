import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  CalendarDays,
  MapPin,
  Sparkles,
  Settings as SettingsIcon,
  FileBarChart,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EventFormDialog } from "@/components/dialogs/EventFormDialog";
import { SyncDialog } from "@/components/SyncDialog";
import { MyPrioritiesWidget } from "@/components/MyPrioritiesWidget";
import { WeekFocusWidget } from "@/components/WeekFocusWidget";
import { eventSummariesQuery, speakersQuery, overdueWebsiteAsanaQuery } from "@/lib/queries";
import { daysBetween } from "@/lib/status";
import { isPastEvent } from "@/lib/event-lifecycle";
import { getSyncHealth } from "@/lib/sync-health.functions";
import { fuzzyMatch } from "@/lib/fuzzy-search";

function SyncStalenessBanner() {
  const { data } = useQuery({
    queryKey: ["sync-health"],
    queryFn: () => getSyncHealth(),
    refetchInterval: 60_000,
  });
  const stale = useMemo(() => {
    const health = data?.health ?? {};
    const items: string[] = [];
    const check = (kind: string, label: string, requiredSecret?: boolean) => {
      if (requiredSecret === false) return; // skip when integration not configured
      const row = (health as any)[kind];
      if (!row) return items.push(label);
      const ageH = (Date.now() - new Date(row.last_run_at).getTime()) / 3_600_000;
      if (ageH > 48 || row.ok === false) items.push(label);
    };
    check("tito_full", "Tito reconcile", data?.secrets?.TITO_API_TOKEN);
    check("asana", "Asana milestones", data?.secrets?.ASANA_CONNECTED);
    return items;
  }, [data]);

  if (!data || stale.length === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <div className="flex-1">
        <span className="font-semibold">Sync stale:</span>{" "}
        {stale.join(", ")} hasn't run in the last 48 hours.
      </div>
      <Link
        to="/settings"
        className="text-xs font-semibold text-amber-900 underline underline-offset-2"
      >
        Open settings →
      </Link>
    </div>
  );
}

function AsanaOverdueChip() {
  const { data } = useQuery(overdueWebsiteAsanaQuery);
  if (!data || data === 0) return null;
  return (
    <Link
      to="/asana"
      search={{ event: undefined, website: true, hideDone: true }}
      className="inline-flex items-center gap-2 rounded-full bg-rose-100 text-rose-800 ring-1 ring-rose-200 px-3 py-1.5 text-xs font-semibold hover:bg-rose-200 transition-colors"
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      {data} website Asana task{data === 1 ? "" : "s"} overdue
    </Link>
  );
}

export const Route = createFileRoute("/_authenticated/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(eventSummariesQuery),
      context.queryClient.ensureQueryData(speakersQuery()),
    ]),
  component: EventsGrid,
});

function formatDateLong(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "amber" | "green" | "violet" | "red";
}) {
  const styles: Record<string, { card: string; value: string; label: string }> = {
    neutral: {
      card: "bg-white ring-1 ring-slate-200/70",
      value: "text-slate-900",
      label: "text-slate-500",
    },
    amber: {
      card: "bg-amber-50 ring-1 ring-amber-100",
      value: "text-amber-700",
      label: "text-amber-600",
    },
    green: {
      card: "bg-emerald-50 ring-1 ring-emerald-100",
      value: "text-emerald-700",
      label: "text-emerald-600",
    },
    violet: {
      card: "bg-violet-50 ring-1 ring-violet-100",
      value: "text-violet-700",
      label: "text-violet-600",
    },
    red: {
      card: "bg-red-50 ring-1 ring-red-100",
      value: "text-red-700",
      label: "text-red-600",
    },
  };
  const s = styles[tone];
  return (
    <div className={`flex-1 min-w-[120px] rounded-xl px-4 py-4 text-center ${s.card}`}>
      <div className={`text-3xl font-bold tabular-nums leading-none ${s.value}`}>{value}</div>
      <div className={`mt-1.5 text-[11px] font-medium uppercase tracking-wider ${s.label}`}>
        {label}
      </div>
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "neutral" | "amber" | "green" | "purple" | "red" | "blue";
  children: React.ReactNode;
}) {
  const toneClass: Record<string, string> = {
    neutral: "bg-slate-100 text-slate-700 ring-slate-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    purple: "bg-violet-50 text-violet-800 ring-violet-200",
    red: "bg-rose-50 text-rose-800 ring-rose-200",
    blue: "bg-blue-50 text-blue-800 ring-blue-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

function EventsGrid() {
  const { data } = useQuery(eventSummariesQuery);
  const { data: speakers } = useQuery(speakersQuery());
  const [creating, setCreating] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pastOpen, setPastOpen] = useState(false);
  const summaries = data ?? [];
  const allSpeakers = speakers ?? [];

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Per-event speaker status breakdown
  const perEvent = useMemo(() => {
    const map = new Map<string, { contacted: number; responded: number; confirmed: number; declined: number; total: number }>();
    for (const s of allSpeakers) {
      const key = (s as any).event_id as string | null;
      if (!key) continue;
      const cur = map.get(key) ?? { contacted: 0, responded: 0, confirmed: 0, declined: 0, total: 0 };
      cur.total++;
      const st = (s as any).status as string;
      if (st === "contacted") cur.contacted++;
      else if (st === "responded") cur.responded++;
      else if (st === "confirmed") cur.confirmed++;
      else if (st === "declined") cur.declined++;
      map.set(key, cur);
    }
    return map;
  }, [allSpeakers]);

  // Global stats
  const stats = useMemo(() => {
    let contacted = 0, responded = 0, confirmed = 0, declined = 0;
    for (const s of allSpeakers) {
      const st = (s as any).status as string;
      if (st === "contacted") contacted++;
      else if (st === "responded") responded++;
      else if (st === "confirmed") confirmed++;
      else if (st === "declined") declined++;
    }
    return {
      events: summaries.length,
      speakers: allSpeakers.length,
      contacted,
      responded,
      confirmed,
      declined,
    };
  }, [summaries, allSpeakers]);

  const filtered = useMemo(() => {
    return summaries.filter((s) => {
      const ev = s.event as any;
      return fuzzyMatch(q, ev.name, ev.code, ev.venue);
    });
  }, [summaries, q]);

  const { upcomingSorted, pastSorted } = useMemo(() => {
    const upcoming: typeof filtered = [];
    const past: typeof filtered = [];
    for (const s of filtered) {
      (isPastEvent(s.event as any) ? past : upcoming).push(s);
    }
    upcoming.sort((a, b) => {
      const da = (a.event as any).event_date ?? (a.event as any).launch_date;
      const db = (b.event as any).event_date ?? (b.event as any).launch_date;
      const ta = da ? new Date(da).getTime() : Infinity;
      const tb = db ? new Date(db).getTime() : Infinity;
      return ta - tb;
    });
    past.sort((a, b) => {
      // Most recently finished first
      const da = (a.event as any).event_date ?? (a.event as any).launch_date;
      const db = (b.event as any).event_date ?? (b.event as any).launch_date;
      const ta = da ? new Date(da).getTime() : -Infinity;
      const tb = db ? new Date(db).getTime() : -Infinity;
      return tb - ta;
    });
    return { upcomingSorted: upcoming, pastSorted: past };
  }, [filtered]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-8 md:py-10 space-y-6">
        <SyncStalenessBanner />
        <AsanaOverdueChip />
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Event Command Center
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Admin Dashboard</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-9" onClick={() => setScanOpen(true)}>
              <Sparkles className="h-4 w-4 mr-1.5" />
              Scan Gmail & Calendar
            </Button>
            <Button variant="outline" size="sm" className="h-9" disabled>
              <FileBarChart className="h-4 w-4 mr-1.5" />
              All-events Report
            </Button>
            <Button variant="outline" size="sm" className="h-9" asChild>
              <Link to="/settings">
                <SettingsIcon className="h-4 w-4 mr-1.5" />
                Settings
              </Link>
            </Button>
            <Button
              size="sm"
              onClick={() => setCreating(true)}
              className="h-9 bg-slate-900 hover:bg-slate-800 text-white"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New Event
            </Button>
          </div>
        </div>

        {/* Overview */}
        <div className="surface-card p-4">
          <div className="px-1 pb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Overview
          </div>
          <div className="flex flex-wrap items-stretch gap-3">
            <Stat label="Events" value={stats.events} tone="neutral" />
            <Stat label="Attendees" value={stats.speakers} tone="neutral" />
            <Stat label="New" value={stats.contacted} tone="amber" />
            <Stat label="Confirmed" value={stats.confirmed} tone="green" />
            <Stat label="Reconfirmed" value={stats.responded} tone="violet" />
            <Stat label="Declined" value={stats.declined} tone="red" />
          </div>
        </div>

        <WeekFocusWidget />

        <MyPrioritiesWidget />

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9 h-10 bg-card border-slate-200 shadow-sm"
              placeholder="Search events by name, city, venue…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {/* Upcoming events */}
        {upcomingSorted.length === 0 && pastSorted.length === 0 ? (
          <div className="surface-card p-12 text-center">
            <div className="text-sm text-slate-500">No events match.</div>
            <Button variant="outline" className="mt-4" onClick={() => setCreating(true)}>
              Add an event
            </Button>
          </div>
        ) : (
          <>
            {upcomingSorted.length > 0 ? (
              <div className="space-y-3">
                {upcomingSorted.map((s) => (
                  <EventCard key={(s.event as any).id} s={s} perEvent={perEvent} />
                ))}
              </div>
            ) : (
              <div className="surface-card p-8 text-center text-sm text-slate-500">
                No upcoming events. Past events are below.
              </div>
            )}

            {pastSorted.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setPastOpen((v) => !v)}
                  className="w-full flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                >
                  {pastOpen ? (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  )}
                  <span className="text-sm font-semibold text-slate-700">
                    Past events
                  </span>
                  <span className="text-xs text-slate-500">
                    {pastSorted.length} finished — kept for the past speaker directory
                  </span>
                </button>
                {pastOpen && (
                  <div className="mt-3 space-y-3 opacity-90">
                    {pastSorted.map((s) => (
                      <EventCard key={(s.event as any).id} s={s} perEvent={perEvent} past />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <EventFormDialog open={creating} onOpenChange={setCreating} />
      <SyncDialog open={scanOpen} onOpenChange={setScanOpen} />
    </div>
  );
}

function EventCard({
  s,
  perEvent,
  past,
}: {
  s: any;
  perEvent: Map<string, { contacted: number; responded: number; confirmed: number; declined: number; total: number }>;
  past?: boolean;
}) {
  const ev = s.event as any;
  const eventDate = ev.event_date ?? ev.launch_date;
  const days = eventDate ? daysBetween(new Date(), new Date(eventDate)) : null;
  const dateLabel = formatDateLong(eventDate);
  const isVirtual = ev.format === "virtual";
  const counts = perEvent.get(ev.id) ?? { contacted: 0, responded: 0, confirmed: 0, declined: 0, total: 0 };
  let awayPill: { label: string; tone: "neutral" | "amber" | "green" | "red" } | null = null;
  if (days !== null) {
    if (days < 0) awayPill = { label: `${Math.abs(days)}d ago`, tone: "neutral" };
    else if (days === 0) awayPill = { label: "Today", tone: "red" };
    else if (days <= 7) awayPill = { label: `${days}d away`, tone: "red" };
    else if (days <= 30) awayPill = { label: `${days}d away`, tone: "amber" };
    else awayPill = { label: `${days}d away`, tone: "green" };
  }
  return (
    <Link
      to="/events/$eventId"
      params={{ eventId: ev.id }}
      className="group block"
    >
      <div className="surface-card p-5 md:p-6 transition-all hover:shadow-[var(--shadow-soft-hover)] hover:-translate-y-0.5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-lg text-slate-900 leading-tight group-hover:text-slate-700 truncate">
                {ev.name}
              </h3>
              <span className="pill pill-slate font-mono text-[10px]">{ev.code}</span>
              <span className={`pill ${ev.business_line === "AIAI" ? "pill-purple" : "pill-blue"}`}>
                {ev.business_line}
              </span>
              {past && (
                <span className="pill bg-slate-100 text-slate-600 ring-1 ring-slate-200 text-[10px]">
                  Ended
                </span>
              )}
            </div>
            {dateLabel && (
              <div className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                <span>{dateLabel}</span>
              </div>
            )}
            {(ev.venue || isVirtual) && (
              <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <span>{isVirtual ? "Virtual event" : ev.venue}</span>
              </div>
            )}
          </div>
          {awayPill && <Pill tone={awayPill.tone}>{awayPill.label}</Pill>}
        </div>

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <Pill tone="neutral">{counts.total} attendees</Pill>
          {counts.contacted > 0 && <Pill tone="amber">{counts.contacted} registered</Pill>}
          {counts.confirmed > 0 && <Pill tone="green">{counts.confirmed} confirmed</Pill>}
          {counts.declined > 0 && <Pill tone="red">{counts.declined} declined</Pill>}
          {s.bannersSent > 0 && <Pill tone="blue">{s.bannersSent} speakers/sponsors</Pill>}
        </div>
      </div>
    </Link>
  );
}

