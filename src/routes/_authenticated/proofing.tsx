import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import { pillClass } from "@/lib/status";
import { RefreshCw, ExternalLink, AlertCircle, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import {
  listProofingBoard,
  moveProofingStage,
  PROOFING_STAGES,
  STAGE_LABELS,
  currentStage,
  type ProofingStageKey,
} from "@/lib/proofing.functions";

const proofingBoardQuery = {
  queryKey: ["proofingBoard"] as const,
  queryFn: () => listProofingBoard(),
};

export const Route = createFileRoute("/_authenticated/proofing")({
  loader: ({ context }) => context.queryClient.ensureQueryData(proofingBoardQuery),
  component: ProofingBoard,
});

type BoardRow = {
  event: {
    id: string;
    code: string;
    name: string;
    business_line: string;
    event_date: string | null;
    asana_project_gid: string | null;
  };
  task: any;
  dues: Record<ProofingStageKey, string | null>;
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyClass(days: number | null): string {
  if (days === null) return "text-slate-500";
  if (days < 0) return "text-rose-700 font-semibold";
  if (days <= 3) return "text-rose-700 font-semibold";
  if (days <= 7) return "text-amber-700 font-medium";
  return "text-slate-600";
}

function ProofingBoard() {
  const qc = useQueryClient();
  const board = useQuery(proofingBoardQuery);
  const move = useServerFn(moveProofingStage);
  const [eventFilter, setEventFilter] = useState("all");
  const [lineFilter, setLineFilter] = useState<"all" | "AIAI" | "CSC">("all");
  const [urgFilter, setUrgFilter] = useState<"all" | "due">("all");
  const [dragging, setDragging] = useState<string | null>(null);

  const moveMut = useMutation({
    mutationFn: async (v: { task_id: string; target_stage: ProofingStageKey | "completed" }) =>
      move({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proofingBoard"] });
      qc.invalidateQueries({ queryKey: ["websiteTasks"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rows = (board.data ?? []) as BoardRow[];

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (eventFilter !== "all" && r.event.id !== eventFilter) return false;
      if (lineFilter !== "all" && r.event.business_line !== lineFilter) return false;
      if (urgFilter === "due") {
        const stage = currentStage(r.task);
        if (stage === "completed") return false;
        const d = daysUntil(r.dues[stage]);
        if (d === null || d > 7) return false;
      }
      return true;
    });
  }, [rows, eventFilter, lineFilter, urgFilter]);

  const grouped: Record<ProofingStageKey, BoardRow[]> = {
    buddy_proof: [],
    marketer_proof: [],
    amendments_actioned: [],
    final_signoff: [],
  };
  const completed: BoardRow[] = [];
  for (const r of filtered) {
    const s = currentStage(r.task);
    if (s === "completed") completed.push(r);
    else grouped[s].push(r);
  }

  function onDrop(target: ProofingStageKey | "completed", row: BoardRow) {
    const s = currentStage(row.task);
    if (s === target) return;
    moveMut.mutate({ task_id: row.task.id, target_stage: target });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] p-6 md:p-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="accent-bar mb-3" />
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Proofing tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every event's website proofing cycle in one place. Drag cards between stages to mark
            progress. Due dates pulled live from Asana.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Select value={lineFilter} onValueChange={(v) => setLineFilter(v as any)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All business lines</SelectItem>
              <SelectItem value="AIAI">AIAI</SelectItem>
              <SelectItem value="CSC">CSC</SelectItem>
            </SelectContent>
          </Select>
          <Select value={urgFilter} onValueChange={(v) => setUrgFilter(v as any)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All deadlines</SelectItem>
              <SelectItem value="due">Overdue / due soon</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {rows.map((r) => (
                <SelectItem key={r.event.id} value={r.event.id}>
                  {r.event.code} - {r.event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["proofingBoard"] })}
            disabled={board.isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${board.isFetching ? "animate-spin" : ""}`} />
            Sync Asana
          </Button>
        </div>
      </div>

      {rows.length === 0 && !board.isLoading && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No events with an Asana project linked yet. Add an Asana project GID to an event to see
          its proofing cycle here.
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {PROOFING_STAGES.map((stage) => (
          <div
            key={stage}
            className="min-w-0"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              const row = rows.find((r) => r.task.id === id);
              if (row) onDrop(stage, row);
              setDragging(null);
            }}
          >
            <div className="flex items-center justify-between px-1 mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                {STAGE_LABELS[stage]}
              </div>
              <div className="text-xs text-muted-foreground">{grouped[stage].length}</div>
            </div>
            <div
              className={`space-y-2 min-h-24 rounded-xl p-1.5 transition-colors ${
                dragging ? "bg-slate-100/60 ring-1 ring-dashed ring-slate-300" : ""
              }`}
            >
              {grouped[stage].map((r) => (
                <ProofingCard
                  key={r.task.id}
                  row={r}
                  currentStageKey={stage}
                  onDragStart={() => setDragging(r.task.id)}
                  onDragEnd={() => setDragging(null)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {completed.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-2 px-1">
            Signed off ({completed.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            {completed.map((r) => (
              <Card key={r.task.id} className="p-3 bg-emerald-50/40 border-emerald-200">
                <div className="font-mono text-[10px] text-muted-foreground">{r.event.code}</div>
                <Link
                  to="/events/$eventId"
                  params={{ eventId: r.event.id }}
                  className="font-medium text-sm hover:underline"
                >
                  {r.event.name}
                </Link>
                <div className="text-[11px] text-emerald-700 mt-1">✓ All stages complete</div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}


function ProofingCard({
  row,
  currentStageKey,
  onDragStart,
  onDragEnd,
}: {
  row: BoardRow;
  currentStageKey: ProofingStageKey;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const due = row.dues[currentStageKey];
  const days = daysUntil(due);
  return (
    <Card
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", row.task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="p-3 cursor-grab active:cursor-grabbing hover:shadow-sm bg-white"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="font-mono text-[10px] text-muted-foreground">{row.event.code}</div>
            <StatusPill className={pillClass.businessLine[row.event.business_line as "AIAI" | "CSC"]}>
              {row.event.business_line}
            </StatusPill>
          </div>
          <Link
            to="/events/$eventId"
            params={{ eventId: row.event.id }}
            className="font-medium text-sm hover:underline block truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {row.event.name}
          </Link>
        </div>
      </div>
      <div className={`mt-2 text-xs ${urgencyClass(days)}`}>
        {due ? (
          <span className="inline-flex items-center gap-1">
            {days !== null && days < 3 && <AlertCircle className="h-3 w-3" />}
            Asana due {new Date(due).toLocaleDateString()}
            {days !== null && (
              <span className="ml-1 text-[10px]">
                ({days < 0 ? `${-days}d overdue` : days === 0 ? "today" : `${days}d`})
              </span>
            )}
          </span>
        ) : (
          <span className="text-slate-400">No Asana due date</span>
        )}
      </div>
      {row.task.markup_url && (
        <a
          href={row.task.markup_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-700 hover:underline"
        >
          Markup <ExternalLink className="h-3 w-3" />
        </a>
      )}
      <div className="mt-2 text-[10px] text-slate-400">Drag to next stage →</div>
    </Card>
  );
}
