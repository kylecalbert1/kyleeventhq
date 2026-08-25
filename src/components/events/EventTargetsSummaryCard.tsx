import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Target as TargetIcon, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import { eventTargetsQuery } from "@/lib/queries";

const toneBar: Record<"green" | "amber" | "red", string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
};

export function EventTargetsSummaryCard({ eventId }: { eventId: string }) {
  const targets = useQuery(eventTargetsQuery(eventId));
  const rows = targets.data ?? [];

  return (
    <Card className="p-5 rounded-2xl border-slate-200/70">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <TargetIcon className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold">Targets</h2>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/events/$eventId/dashboard" params={{ eventId }}>
            View sales dashboard
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Link>
        </Button>
      </div>

      {targets.isLoading ? (
        <div className="mt-4 text-xs text-muted-foreground">Loading targets…</div>
      ) : rows.length === 0 ? (
        <div className="mt-4 text-xs text-muted-foreground">
          No targets yet — add one on the sales dashboard.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {rows.map((t) => {
            const pct =
              t.target_value > 0
                ? Math.min(100, Math.round((t.current_value / t.target_value) * 100))
                : 0;
            const bar =
              t.source === "tito_delegate_tickets" ? toneBar[t.tone ?? "green"] : "bg-slate-700";
            return (
              <div key={t.id} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600 truncate">{t.label}</span>
                  {t.met && (
                    <StatusPill className="bg-emerald-50 text-emerald-800 ring-emerald-200">
                      Met
                    </StatusPill>
                  )}
                </div>
                <div className="mt-1 flex items-end gap-1.5">
                  <span className="text-2xl font-semibold tabular-nums text-slate-900">
                    {t.current_value}
                  </span>
                  <span className="text-sm text-slate-500 pb-0.5">of {t.target_value}</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
