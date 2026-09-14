import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Target as TargetIcon, ArrowRight, Plus, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import { eventTargetsQuery, eventQuery } from "@/lib/queries";
import { TargetFormDialog } from "@/components/events/TargetFormDialog";
import type { EventTarget } from "@/lib/event-targets.functions";

const toneBar: Record<"green" | "amber" | "red", string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
};

export function EventTargetsSummaryCard({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const targets = useQuery(eventTargetsQuery(eventId));
  const ev = useQuery(eventQuery(eventId));
  const rows = targets.data ?? [];
  const hasTitoSlug = Boolean((ev.data as any)?.tito_slug);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EventTarget | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["eventTargets", eventId] });
    qc.invalidateQueries({ queryKey: ["cardTargets"] });
  };

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <Card className="p-5 rounded-2xl border-slate-200/70">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <TargetIcon className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold">Targets</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openNew}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Set a target
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/events/$eventId/dashboard" params={{ eventId }}>
              View sales dashboard
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      </div>

      {targets.isLoading ? (
        <div className="mt-4 text-xs text-muted-foreground">Loading targets…</div>
      ) : rows.length === 0 ? (
        <div className="mt-4 text-xs text-muted-foreground">
          No targets yet — use “Set a target” to add a sponsorship or delegate target.
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
              <div key={t.id} className="min-w-0 group">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600 truncate">{t.label}</span>
                  <div className="flex items-center gap-1.5">
                    {t.met && (
                      <StatusPill className="bg-emerald-50 text-emerald-800 ring-emerald-200">
                        Met
                      </StatusPill>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(t as unknown as EventTarget);
                        setFormOpen(true);
                      }}
                      className="text-slate-400 hover:text-slate-700"
                      aria-label={`Edit ${t.label}`}
                      title="Edit target"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
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

      <TargetFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        eventId={eventId}
        hasTitoSlug={hasTitoSlug}
        target={editing}
        onSaved={invalidate}
      />
    </Card>
  );
}
