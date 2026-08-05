import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Target, CalendarClock, Flame, ChevronRight } from "lucide-react";
import { eventSummariesQuery, speakersQuery } from "@/lib/queries";
import { listAsanaTasks } from "@/lib/asana-tasks.functions";
import { isPastEvent } from "@/lib/event-lifecycle";
import { daysBetween } from "@/lib/status";

type Row = {
  id: string;
  name: string;
  code: string;
  businessLine: string;
  days: number | null;
  confirmed: number;
  target: number;
  gap: number;
  score: number;
  milestone: { name: string; due_on: string | null } | null;
};

function fmtDue(iso: string | null) {
  if (!iso) return "no date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "no date";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function WeekFocusWidget() {
  const { data: summaries } = useQuery(eventSummariesQuery);
  const { data: speakers } = useQuery(speakersQuery());
  const { data: asanaTasks } = useQuery({
    queryKey: ["asana-tasks", "open", "all"],
    queryFn: () => listAsanaTasks({ data: { hide_completed: true } }),
    staleTime: 5 * 60_000,
  });

  const rows = useMemo<Row[]>(() => {
    const confirmedByEvent = new Map<string, number>();
    for (const s of speakers ?? []) {
      const ev = (s as any).event_id as string | null;
      if (!ev) continue;
      if ((s as any).status === "confirmed")
        confirmedByEvent.set(ev, (confirmedByEvent.get(ev) ?? 0) + 1);
    }

    // Next upcoming (or overdue) open Asana milestone per event.
    const todayIso = new Date().toISOString().slice(0, 10);
    const nextMilestone = new Map<string, { name: string; due_on: string | null }>();
    for (const t of (asanaTasks ?? []) as any[]) {
      const evId = t.event_id as string | null;
      if (!evId || !t.due_on) continue;
      const cur = nextMilestone.get(evId);
      // rows arrive sorted by due_on asc; prefer the first not-yet-past, else earliest overdue
      if (!cur) {
        nextMilestone.set(evId, { name: t.name, due_on: t.due_on });
      } else if (cur.due_on && cur.due_on < todayIso && t.due_on >= todayIso) {
        nextMilestone.set(evId, { name: t.name, due_on: t.due_on });
      }
    }

    const out: Row[] = [];
    for (const s of summaries ?? []) {
      const ev = (s as any).event as any;
      if (isPastEvent(ev)) continue;
      const launch = ev.launch_date ?? ev.event_date;
      const days = launch ? daysBetween(new Date(), new Date(launch)) : null;
      const target = Number(ev.speaker_target ?? 0);
      const confirmed = confirmedByEvent.get(ev.id) ?? 0;
      const gap = Math.max(0, target - confirmed);

      // Urgency: speaker gap weighted by proximity to launch.
      const proximity = days === null ? 0.25 : 30 / Math.max(3, days);
      const score = gap * proximity + (days !== null && days <= 14 ? 2 : 0);

      out.push({
        id: ev.id,
        name: ev.name,
        code: ev.code,
        businessLine: ev.business_line,
        days,
        confirmed,
        target,
        gap,
        score,
        milestone: nextMilestone.get(ev.id) ?? null,
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }, [summaries, speakers, asanaTasks]);

  if (rows.length === 0) return null;

  const focus = rows.slice(0, 2).filter((r) => r.score > 0);
  const rest = rows.slice(focus.length);

  return (
    <div className="surface-card p-4">
      <div className="flex items-center gap-2 px-1 pb-3">
        <Flame className="h-4 w-4 text-rose-500" />
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          This week's focus
        </div>
      </div>

      <div className="space-y-2">
        {focus.map((r, i) => (
          <FocusRow key={r.id} row={r} tone={i === 0 ? "red" : "amber"} />
        ))}
        {focus.length === 0 && (
          <div className="px-1 pb-2 text-sm text-slate-500">
            Nothing urgent — all live events are on target.
          </div>
        )}
        {rest.length > 0 && (
          <div className="pt-1 space-y-1">
            {rest.map((r) => (
              <FocusRow key={r.id} row={r} tone="neutral" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FocusRow({ row, tone }: { row: Row; tone: "red" | "amber" | "neutral" }) {
  const toneClass =
    tone === "red"
      ? "bg-rose-50 ring-1 ring-rose-200 hover:bg-rose-100/70"
      : tone === "amber"
        ? "bg-amber-50 ring-1 ring-amber-200 hover:bg-amber-100/70"
        : "bg-white ring-1 ring-slate-200/70 hover:bg-slate-50";
  const strong =
    tone === "red" ? "text-rose-800" : tone === "amber" ? "text-amber-800" : "text-slate-700";

  return (
    <Link
      to="/events/$eventId"
      params={{ eventId: row.id }}
      className={`group flex items-center gap-3 rounded-xl px-3.5 py-3 transition-colors ${toneClass}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-slate-900 truncate">{row.name}</span>
          <span className="pill pill-slate font-mono text-[10px]">{row.code}</span>
          {tone !== "neutral" && (
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${strong}`}>
              Needs attention
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
            {row.days === null
              ? "No launch date"
              : row.days < 0
                ? `${Math.abs(row.days)}d overdue`
                : `${row.days}d to launch`}
          </span>
          <span className="inline-flex items-center gap-1">
            <Target className="h-3.5 w-3.5 text-slate-400" />
            <span className={row.gap > 0 ? strong : "text-slate-600"}>
              {row.confirmed}/{row.target} confirmed
            </span>
            {row.gap > 0 && <span className="text-slate-500">({row.gap} to go)</span>}
          </span>
          {row.milestone && (
            <span className="truncate max-w-[280px] text-slate-500">
              Next: {row.milestone.name} · {fmtDue(row.milestone.due_on)}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-600" />
    </Link>
  );
}
