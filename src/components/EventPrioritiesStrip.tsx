import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Flame, ListChecks } from "lucide-react";
import { eventPrioritiesQuery } from "@/lib/queries";

// Compact strip that appears on the Event detail page listing priorities
// tagged to that event. Read-only view — full editing lives on the dashboard.
export function EventPrioritiesStrip({ eventId }: { eventId: string }) {
  const q = useQuery(eventPrioritiesQuery(eventId));
  const rows = (q.data ?? []) as any[];
  if (rows.length === 0) return null;
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2">
        <ListChecks className="h-3.5 w-3.5 text-primary" />
        Priorities
        <span className="text-[10px] font-normal text-slate-400">
          {rows.filter((r) => r.done).length}/{rows.length}
        </span>
      </div>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-xs">
            {r.is_asap && (
              <span className="pill bg-rose-100 text-rose-700 ring-1 ring-rose-200 text-[9px] font-semibold flex items-center gap-0.5 shrink-0">
                <Flame className="h-2.5 w-2.5" /> ASAP
              </span>
            )}
            <span className={r.done ? "line-through text-slate-400" : "text-slate-700"}>
              {r.text}
            </span>
            {r.due_date && (
              <span className="ml-auto text-[10px] text-slate-500 tabular-nums shrink-0">
                {new Date(r.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
