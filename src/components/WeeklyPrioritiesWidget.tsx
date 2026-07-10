import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles } from "lucide-react";
import { weeklyPrioritiesQuery } from "@/lib/queries";
import { upsertWeeklyPriority } from "@/lib/weekly-priorities.functions";
import { currentWeekStart, formatWeekLabel } from "@/lib/weekly";

type Row = { position: number; text: string; done: boolean; dirty?: boolean };

export function WeeklyPrioritiesWidget() {
  const week = currentWeekStart();
  const qc = useQueryClient();
  const upsert = useServerFn(upsertWeeklyPriority);
  const q = useQuery(weeklyPrioritiesQuery(week));

  const initial = useMemo<Row[]>(() => {
    const map = new Map<number, Row>();
    (q.data ?? []).forEach((r: { position: number; text: string; done: boolean }) =>
      map.set(r.position, { position: r.position, text: r.text ?? "", done: r.done }),
    );
    return [1, 2, 3, 4, 5].map((p) => map.get(p) ?? { position: p, text: "", done: false });
  }, [q.data]);

  const [rows, setRows] = useState<Row[]>(initial);
  useEffect(() => setRows(initial), [initial]);

  const mutation = useMutation({
    mutationFn: (r: Row) =>
      upsert({ data: { week_start: week, position: r.position, text: r.text, done: r.done } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weeklyPriorities", week] }),
  });

  function updateRow(pos: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.position === pos ? { ...r, ...patch } : r)));
  }

  function commit(r: Row) {
    mutation.mutate(r);
  }

  const done = rows.filter((r) => r.done && r.text.trim()).length;
  const filled = rows.filter((r) => r.text.trim()).length;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-amber-500" />
            This week's 5 priorities
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {formatWeekLabel(week)} · resets Monday
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums leading-none">
            {done}<span className="text-sm text-muted-foreground">/{Math.max(filled, 5)}</span>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">done</div>
        </div>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.position} className="flex items-center gap-2 group">
            <Checkbox
              checked={r.done}
              onCheckedChange={(v) => {
                const next = { ...r, done: !!v };
                updateRow(r.position, { done: !!v });
                commit(next);
              }}
            />
            <div className="w-5 text-xs text-muted-foreground tabular-nums">{r.position}.</div>
            <Input
              className={`h-8 text-sm ${r.done ? "line-through text-muted-foreground" : ""}`}
              placeholder="What must happen this week?"
              value={r.text}
              onChange={(e) => updateRow(r.position, { text: e.target.value })}
              onBlur={() => commit(rows.find((x) => x.position === r.position)!)}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
