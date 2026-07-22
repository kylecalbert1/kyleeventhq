import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Flame, GripVertical, X, Plus, ListChecks } from "lucide-react";
import { myPrioritiesQuery } from "@/lib/queries";
import {
  createPriority,
  updatePriority,
  deletePriority,
  reorderPriorities,
} from "@/lib/priorities.functions";
import { toast } from "sonner";

// "My priorities" — ASAP-pinned rows always on top; other rows are current
// week only. Quick-add + tick + drag reorder, no dialog.
export function MyPrioritiesWidget() {
  const qc = useQueryClient();
  const q = useQuery(myPrioritiesQuery);
  const create = useServerFn(createPriority);
  const update = useServerFn(updatePriority);
  const remove = useServerFn(deletePriority);
  const reorder = useServerFn(reorderPriorities);

  const [text, setText] = useState("");
  const [asap, setAsap] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["myPriorities"] }),
      qc.invalidateQueries({ queryKey: ["eventPriorities"] }),
    ]);

  const addM = useMutation({
    mutationFn: (input: { text: string; is_asap: boolean }) =>
      create({ data: { text: input.text, is_asap: input.is_asap } }),
    onSuccess: () => {
      setText("");
      setAsap(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add"),
  });

  const patchM = useMutation({
    mutationFn: (v: { id: string; patch: any }) => update({ data: v }),
    onSuccess: () => invalidate(),
  });

  const delM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => invalidate(),
  });

  const reorderM = useMutation({
    mutationFn: (ids: string[]) => reorder({ data: { ids } }),
    onSuccess: () => invalidate(),
  });

  const rows = q.data ?? [];
  const asapRows = rows.filter((r: any) => r.is_asap);
  const weekRows = rows.filter((r: any) => !r.is_asap);
  const doneCount = rows.filter((r: any) => r.done).length;

  function onDrop(targetId: string, groupIsAsap: boolean) {
    if (!dragId || dragId === targetId) return;
    const group = groupIsAsap ? asapRows : weekRows;
    const ids = group.map((r: any) => r.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    reorderM.mutate(ids);
    setDragId(null);
  }

  function renderRow(r: any) {
    return (
      <div
        key={r.id}
        draggable
        onDragStart={() => setDragId(r.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDrop(r.id, r.is_asap)}
        className={`group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50 ${
          dragId === r.id ? "opacity-60" : ""
        }`}
      >
        <GripVertical className="h-3.5 w-3.5 text-slate-300 cursor-grab shrink-0" />
        <Checkbox
          checked={r.done}
          onCheckedChange={(v) => patchM.mutate({ id: r.id, patch: { done: !!v } })}
        />
        {r.is_asap && (
          <span className="pill bg-rose-100 text-rose-700 ring-1 ring-rose-200 text-[9px] uppercase tracking-wider font-semibold flex items-center gap-0.5 shrink-0">
            <Flame className="h-2.5 w-2.5" /> ASAP
          </span>
        )}
        <Input
          className={`h-7 text-sm border-0 shadow-none px-1 focus-visible:ring-1 ${
            r.done ? "line-through text-muted-foreground" : ""
          }`}
          defaultValue={r.text ?? ""}
          onBlur={(e) => {
            const next = e.target.value;
            if (next !== r.text) patchM.mutate({ id: r.id, patch: { text: next } });
          }}
        />
        {r.events?.code && (
          <span className="pill pill-slate text-[10px] font-mono shrink-0">{r.events.code}</span>
        )}
        {r.due_date && (
          <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
            {new Date(r.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
          </span>
        )}
        <button
          onClick={() => patchM.mutate({ id: r.id, patch: { is_asap: !r.is_asap } })}
          className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 hover:text-rose-600 shrink-0"
          title={r.is_asap ? "Un-pin" : "Pin as ASAP"}
        >
          <Flame className="h-3 w-3" />
        </button>
        <button
          onClick={() => delM.mutate(r.id)}
          className="text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-600 shrink-0"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4 text-primary" />
            My priorities
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            ASAP always on top · other items reset weekly
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums leading-none">
            {doneCount}
            <span className="text-sm text-muted-foreground">/{Math.max(rows.length, 1)}</span>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">done</div>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          addM.mutate({ text: text.trim(), is_asap: asap });
        }}
        className="flex items-center gap-1.5 mb-2"
      >
        <button
          type="button"
          onClick={() => setAsap((v) => !v)}
          className={`shrink-0 rounded-md px-1.5 py-1 text-[10px] font-semibold ring-1 ${
            asap
              ? "bg-rose-100 text-rose-700 ring-rose-200"
              : "bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100"
          }`}
          title="Mark ASAP"
        >
          <Flame className="h-3 w-3" />
        </button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a priority… ⏎"
          className="h-8 text-sm"
        />
        <Button type="submit" size="sm" className="h-8" disabled={!text.trim() || addM.isPending}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </form>

      <div className="space-y-0.5">
        {asapRows.length > 0 && (
          <div className="mb-1">
            {asapRows.map((r: any) => renderRow(r))}
          </div>
        )}
        {weekRows.map((r: any) => renderRow(r))}
        {rows.length === 0 && (
          <div className="text-xs text-muted-foreground italic px-2 py-3">
            Nothing yet. Add what has to happen this week.
          </div>
        )}
      </div>
    </Card>
  );
}
