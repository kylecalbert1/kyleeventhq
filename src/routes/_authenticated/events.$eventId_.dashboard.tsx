import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Plus, RefreshCw, Pencil, Trash2, Target as TargetIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/StatusPill";
import { PageHelp } from "@/components/PageHelp";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { TargetFormDialog } from "@/components/events/TargetFormDialog";
import { eventQuery, eventTargetsQuery, eventReconciliationQuery } from "@/lib/queries";
import { syncEventFromTito } from "@/lib/tito.functions";
import {
  updateEventTarget,
  deleteEventTarget,
  type EventTarget,
} from "@/lib/event-targets.functions";

export const Route = createFileRoute("/_authenticated/events/$eventId_/dashboard")({
  head: () => ({
    meta: [
      { title: "Sales dashboard — Event Command Centre" },
      {
        name: "description",
        content: "Ticket and target progress for this event, with live Tito sales trends.",
      },
      { property: "og:title", content: "Sales dashboard — Event Command Centre" },
      {
        property: "og:description",
        content: "Ticket and target progress for this event, with live Tito sales trends.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EventDashboardPage,
});

const tone = {
  green: {
    bar: "bg-emerald-500",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
    soft: "bg-emerald-50",
    stroke: "hsl(160 84% 39%)",
  },
  amber: {
    bar: "bg-amber-500",
    text: "text-amber-700",
    ring: "ring-amber-200",
    soft: "bg-amber-50",
    stroke: "hsl(38 92% 50%)",
  },
  red: {
    bar: "bg-rose-500",
    text: "text-rose-700",
    ring: "ring-rose-200",
    soft: "bg-rose-50",
    stroke: "hsl(350 89% 60%)",
  },
  neutral: {
    bar: "bg-slate-700",
    text: "text-slate-700",
    ring: "ring-slate-200",
    soft: "bg-slate-50",
    stroke: "hsl(215 25% 27%)",
  },
} as const;

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return "never";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function EventDashboardPage() {
  const { eventId } = Route.useParams();
  const qc = useQueryClient();
  const ev = useQuery(eventQuery(eventId));
  const targets = useQuery(eventTargetsQuery(eventId));
  const recon = useQuery(eventReconciliationQuery(eventId));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EventTarget | null>(null);

  const hasTitoSlug = Boolean((ev.data as any)?.tito_slug);
  const lastSynced = (recon.data as any)?.last_synced_at as string | null | undefined;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["eventTargets", eventId] });
    qc.invalidateQueries({ queryKey: ["eventReconciliation", eventId] });
    qc.invalidateQueries({ queryKey: ["cardTargets"] });
  };

  const syncFn = useServerFn(syncEventFromTito);
  const sync = useMutation({
    mutationFn: () => syncFn({ data: { event_id: eventId } }),
    onSuccess: () => {
      toast.success("Synced from Tito");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  // Auto-refresh when Tito data is more than 6 hours stale.
  const [autoTried, setAutoTried] = useState(false);
  useEffect(() => {
    if (autoTried || !hasTitoSlug || recon.isLoading) return;
    const stale =
      !lastSynced || Date.now() - new Date(lastSynced).getTime() > 6 * 60 * 60 * 1000;
    if (stale) {
      setAutoTried(true);
      sync.mutate();
    } else {
      setAutoTried(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTried, hasTitoSlug, recon.isLoading, lastSynced]);

  const rows = targets.data ?? [];

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 animate-fade-in">
      <div className="mb-6">
        <Link
          to="/events/$eventId"
          params={{ eventId }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to event
        </Link>
        <div className="mt-2 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {(ev.data as any)?.name ?? "Event"}
              {(ev.data as any)?.code ? (
                <span className="text-muted-foreground"> · {(ev.data as any).code}</span>
              ) : null}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
              Sales dashboard
              <PageHelp
                title="Sales dashboard"
                what="Track ticket and revenue targets for this event. Tito-linked targets pull live delegate ticket sales; manual targets are numbers you keep updated yourself."
                steps={[
                  "Add a target and choose whether you type the number or it comes from Tito.",
                  "Use Sync from Tito to pull the latest ticket sales.",
                  "Watch the 10-week trend and needed-per-week pace.",
                ]}
              />
            </p>

          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {hasTitoSlug && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Tito synced {fmtWhen(lastSynced)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sync.mutate()}
                  disabled={sync.isPending}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 mr-1.5 ${sync.isPending ? "animate-spin" : ""}`}
                  />
                  {sync.isPending ? "Syncing…" : "Sync from Tito"}
                </Button>
              </div>
            )}
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add target
            </Button>
          </div>
        </div>
      </div>

      {targets.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading targets…</div>
      ) : rows.length === 0 ? (
        <Card className="p-10 rounded-2xl border-slate-200/70 text-center">
          <TargetIcon className="h-6 w-6 mx-auto text-slate-400" />
          <p className="mt-3 text-sm text-muted-foreground">
            No targets yet. Add one to track ticket sales or any number you care about.
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          {rows.map((t) => (
            <TargetHeroCard
              key={t.id}
              target={t}
              onEdit={() => {
                setEditing(t);
                setFormOpen(true);
              }}
              onSaved={invalidate}
            />
          ))}
        </div>
      )}

      <TargetFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        eventId={eventId}
        hasTitoSlug={hasTitoSlug}
        target={editing}
        onSaved={invalidate}
      />
    </div>
  );
}

const chartConfig = {
  count: { label: "Tickets", color: "hsl(215 25% 27%)" },
} satisfies ChartConfig;

function TargetHeroCard({
  target,
  onEdit,
  onSaved,
}: {
  target: EventTarget;
  onEdit: () => void;
  onSaved: () => void;
}) {
  const update = useServerFn(updateEventTarget);
  const del = useServerFn(deleteEventTarget);
  const [value, setValue] = useState(String(target.manual_current_value ?? 0));

  const isTito = target.source === "tito_delegate_tickets";
  const t = isTito ? tone[target.tone ?? "green"] : tone.neutral;
  const pct =
    target.target_value > 0
      ? Math.min(100, Math.round((target.current_value / target.target_value) * 100))
      : 0;

  const chartData = useMemo(
    () =>
      (target.weekly ?? []).map((w) => ({
        week: new Date(w.week_start).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        }),
        week_start: w.week_start,
        count: w.count,
      })),
    [target.weekly],
  );

  const saveCurrent = async () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n === (target.manual_current_value ?? 0)) return;
    try {
      await update({ data: { id: target.id, patch: { manual_current_value: n } } });
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete target "${target.label}"?`)) return;
    try {
      await del({ data: { id: target.id } });
      toast.success("Target deleted");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <Card className="p-6 rounded-2xl border-slate-200/70">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-base font-semibold text-slate-900">{target.label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {isTito ? "Live from Tito — delegate ticket sales" : "Number you keep updated"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {target.met && (
            <StatusPill className="bg-emerald-50 text-emerald-800 ring-emerald-200">
              Target met
            </StatusPill>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit target">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={remove} aria-label="Delete target">
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(240px,1fr)_2fr]">
        <div>
          <div className="flex items-end gap-2">
            {isTito ? (
              <span className="text-5xl font-semibold tabular-nums text-slate-900 leading-none">
                {target.current_value}
              </span>
            ) : (
              <Input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={saveCurrent}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="h-14 w-32 text-4xl font-semibold tabular-nums"
              />
            )}
            <span className="text-lg font-medium text-slate-500 pb-1">
              of {target.target_value}
            </span>
          </div>

          <div className="mt-4 h-4 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all ${t.bar}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className={`mt-2 text-sm font-medium ${t.text}`}>{pct}% of target</div>

          {isTito && target.unavailable && (
            <div className="mt-3 text-xs text-muted-foreground">
              No Tito delegate release found for this event yet.
            </div>
          )}

          {isTito && !target.unavailable && !target.met && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className={`rounded-xl px-3 py-2.5 ring-1 ring-inset ${t.soft} ${t.ring}`}>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">
                  Needed / week
                </div>
                <div className={`text-xl font-semibold tabular-nums ${t.text}`}>
                  {target.needed_per_week ?? 0}
                </div>
              </div>
              <div className="rounded-xl px-3 py-2.5 ring-1 ring-inset ring-slate-200 bg-slate-50">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">
                  Recent average
                </div>
                <div className="text-xl font-semibold tabular-nums text-slate-800">
                  {target.recent_avg_per_week ?? 0}
                </div>
              </div>
            </div>
          )}

          {isTito && target.breakdown && target.breakdown.length > 0 && (
            <div className="mt-5 space-y-3">
              {target.total_revenue !== null && target.total_revenue !== undefined && (
                <div className="rounded-xl px-3 py-2.5 ring-1 ring-inset ring-slate-200 bg-slate-50">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Total revenue
                  </div>
                  <div className="text-xl font-semibold tabular-nums text-slate-800">
                    {target.currency}
                    {target.total_revenue.toLocaleString()}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">
                  Breakdown
                </div>
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {target.breakdown.map((item) => (
                    <div
                      key={item.title}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="text-muted-foreground">{item.title}</span>
                      <span className="tabular-nums text-slate-800">
                        {item.tickets_count} sold
                        {item.revenue !== null && item.revenue !== undefined
                          ? ` · ${target.currency}${item.revenue.toLocaleString()}`
                          : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {isTito && chartData.length > 0 && (
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
              Last 10 weeks
            </div>
            <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
              <AreaChart data={chartData} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id={`fill-${target.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={t.stroke} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={t.stroke} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="week"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={12}
                />
                <YAxis
                  width={32}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tickMargin={4}
                />
                <ChartTooltip
                  content={<ChartTooltipContent labelFormatter={(l) => `Week of ${l}`} />}
                />
                <Area
                  dataKey="count"
                  type="monotone"
                  stroke={t.stroke}
                  strokeWidth={2}
                  fill={`url(#fill-${target.id})`}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        )}
      </div>
    </Card>
  );
}
