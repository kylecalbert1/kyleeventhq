import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  LayoutGrid,
  Rows3,
  Plus,
  Search,
  Mail,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusPill } from "@/components/StatusPill";
import { SpeakerDetailDialog } from "@/components/dialogs/SpeakerDetailDialog";
import { SpeakerFormDialog } from "@/components/dialogs/SpeakerFormDialog";
import { BulkEmailDialog } from "@/components/BulkEmailDialog";
import { BoardSpeakerCard, onSiteOf } from "@/components/boards/BoardSpeakerCard";
import { DuplicateCompareDialog } from "@/components/boards/DuplicateCompareDialog";
import { boardQuery } from "@/lib/queries";
import {
  moveSpeakerToColumn,
  addBoardColumn,
  renameBoardColumn,
  deleteBoardColumn,
  reorderBoardColumns,
  setSpeakerOnSite,
} from "@/lib/boards.functions";
import { labels } from "@/lib/status";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/boards/$boardId")({
  head: () => ({
    meta: [
      { title: "Speaker board — Event Command Centre" },
      {
        name: "description",
        content: "Drag speakers between stages on a quiet, Asana-style board.",
      },
      { property: "og:title", content: "Speaker board — Event Command Centre" },
      {
        property: "og:description",
        content: "Drag speakers between stages on a quiet, Asana-style board.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(boardQuery(params.boardId)),
  component: BoardPage,
});

type SortKey = "name" | "company" | "column" | "last";

function normEmailKey(e: string | null | undefined): string {
  return (e ?? "").trim().toLowerCase();
}

function BoardPage() {
  const { boardId } = Route.useParams();
  const q = useQuery(boardQuery(boardId));
  const qc = useQueryClient();

  const [view, setView] = useState<"board" | "list">("board");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [dupFor, setDupFor] = useState<any[] | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [declinedOpen, setDeclinedOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteCol, setDeleteCol] = useState<any | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const move = useServerFn(moveSpeakerToColumn);
  const onSiteFn = useServerFn(setSpeakerOnSite);
  const reorder = useServerFn(reorderBoardColumns);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["speakerBoard", boardId] });
    qc.invalidateQueries({ queryKey: ["speakers"] });
    qc.invalidateQueries({ queryKey: ["eventSummaries"] });
  };

  const moveMut = useMutation({
    mutationFn: (v: { speaker_id: string; column_id: string }) => move({ data: v }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to move"),
  });
  const onSiteMut = useMutation({
    mutationFn: (v: { speaker_id: string; on_site: boolean }) => onSiteFn({ data: v }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const reorderMut = useMutation({
    mutationFn: (ordered_ids: string[]) => reorder({ data: { board_id: boardId, ordered_ids } }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const board = q.data?.board;
  const columns = q.data?.columns ?? [];
  const speakers = q.data?.speakers ?? [];

  const columnById = useMemo(
    () => Object.fromEntries(columns.map((c: any) => [c.id, c])),
    [columns],
  );

  // Duplicate detection: two or more speakers on this board sharing an email.
  const dupGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of speakers) {
      const k = normEmailKey(s.email);
      if (!k) continue;
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    const out = new Map<string, any[]>();
    for (const [, group] of map) {
      if (group.length < 2) continue;
      for (const s of group) out.set(s.id, group);
    }
    return out;
  }, [speakers]);

  const filtered = useMemo(() => {
    const terms = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return speakers;
    return speakers.filter((s: any) => {
      const hay = `${s.name ?? ""} ${s.company ?? ""} ${s.title ?? ""} ${s.email ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [speakers, term]);

  const byColumn = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const c of columns) map[c.id] = [];
    for (const s of filtered) {
      if (s.board_column_id && map[s.board_column_id]) map[s.board_column_id].push(s);
    }
    return map;
  }, [filtered, columns]);

  const sortedRows = useMemo(() => {
    const arr = [...filtered];
    const dir = sortAsc ? 1 : -1;
    arr.sort((a: any, b: any) => {
      if (sortKey === "name") return dir * (a.name ?? "").localeCompare(b.name ?? "");
      if (sortKey === "company") return dir * (a.company ?? "").localeCompare(b.company ?? "");
      if (sortKey === "column") {
        const pa = columnById[a.board_column_id]?.position ?? 99;
        const pb = columnById[b.board_column_id]?.position ?? 99;
        return dir * (pa - pb);
      }
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return dir * (ta - tb);
    });
    return arr;
  }, [filtered, sortKey, sortAsc, columnById]);

  const selectedSpeakers = speakers.filter((s: any) => selected[s.id]);

  function handleDrop(columnId: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOverCol(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const s = speakers.find((x: any) => x.id === id);
    if (!s || s.board_column_id === columnId) return;
    moveMut.mutate({ speaker_id: id, column_id: columnId });
  }

  function handleColumnDrop(targetId: string) {
    if (!dragCol || dragCol === targetId) return;
    const ids = columns.map((c: any) => c.id);
    const from = ids.indexOf(dragCol);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragCol(null);
    reorderMut.mutate(ids);
  }

  const declinedCol = columns.find((c: any) => c.kind === "declined");
  const mainColumns = columns.filter((c: any) => c.kind !== "declined");

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc(!sortAsc);
    else {
      setSortKey(k);
      setSortAsc(true);
    }
  }

  if (q.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading board…</div>;
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 animate-fade-in">
      <Link
        to="/boards"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All boards
      </Link>

      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <div className="accent-bar mb-3" />
          <h1 className="text-2xl font-semibold tracking-tight">{board?.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {speakers.length} speaker{speakers.length === 1 ? "" : "s"} · click a card for detail.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                view === "list" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900",
              )}
            >
              <Rows3 className="h-3.5 w-3.5" /> List
            </button>
            <button
              type="button"
              onClick={() => setView("board")}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                view === "board" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Board
            </button>
          </div>
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add column
          </Button>
        </div>
      </div>

      <div className="mb-4 relative max-w-xl">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          className="pl-10 h-11 rounded-xl bg-white border-slate-200 shadow-sm"
          placeholder="Search this board…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      {selectedSpeakers.length > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
          <div className="text-sm">{selectedSpeakers.length} selected</div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected({})}>
              Clear
            </Button>
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              <Mail className="h-3.5 w-3.5 mr-1.5" /> Compose email
            </Button>
          </div>
        </div>
      )}

      {view === "board" ? (
        <>
          <div className="flex gap-3 overflow-x-auto pb-3">
            {mainColumns.map((col: any) => (
              <div
                key={col.id}
                className={cn(
                  "w-72 shrink-0 rounded-2xl border p-2 transition-colors",
                  dragOverCol === col.id
                    ? "border-primary/50 bg-primary/5"
                    : "border-slate-200/70 bg-slate-50/60",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverCol !== col.id) setDragOverCol(col.id);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                  setDragOverCol(null);
                }}
                onDrop={(e) => {
                  if (dragCol) {
                    handleColumnDrop(col.id);
                    setDragOverCol(null);
                    return;
                  }
                  handleDrop(col.id, e);
                }}
              >
                <ColumnHeader
                  col={col}
                  count={byColumn[col.id]?.length ?? 0}
                  onDragStart={() => setDragCol(col.id)}
                  onDelete={() => setDeleteCol(col)}
                  boardId={boardId}
                />
                <div className="space-y-2 min-h-24 px-1 pb-1">
                  {(byColumn[col.id] ?? []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-muted-foreground/25 bg-white/40 px-3 py-6 text-center text-xs text-muted-foreground">
                      {dragOverCol === col.id ? "Drop here" : "Empty"}
                    </div>
                  ) : (
                    (byColumn[col.id] ?? []).map((s: any) => (
                      <BoardSpeakerCard
                        key={s.id}
                        s={s}
                        duplicate={dupGroups.has(s.id)}
                        onOpenDetail={() => setDetail(s)}
                        onOpenDuplicate={() => setDupFor(dupGroups.get(s.id) ?? null)}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          {declinedCol && (
            <div
              className={cn(
                "mt-3 rounded-2xl border transition-colors",
                dragOverCol === declinedCol.id
                  ? "border-rose-300 bg-rose-50"
                  : "border-slate-200/70 bg-slate-50/60",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverCol !== declinedCol.id) setDragOverCol(declinedCol.id);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOverCol(null);
              }}
              onDrop={(e) => handleDrop(declinedCol.id, e)}
            >
              <button
                type="button"
                onClick={() => setDeclinedOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                <span>
                  {declinedCol.name}{" "}
                  <span className="tabular-nums">({byColumn[declinedCol.id]?.length ?? 0})</span>
                </span>
                {declinedOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              {declinedOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 px-3 pb-3">
                  {(byColumn[declinedCol.id] ?? []).length === 0 ? (
                    <div className="text-xs text-muted-foreground px-1 pb-2">Nobody declined.</div>
                  ) : (
                    (byColumn[declinedCol.id] ?? []).map((s: any) => (
                      <BoardSpeakerCard
                        key={s.id}
                        s={s}
                        duplicate={dupGroups.has(s.id)}
                        onOpenDetail={() => setDetail(s)}
                        onOpenDuplicate={() => setDupFor(dupGroups.get(s.id) ?? null)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <Card className="rounded-2xl border-slate-200/70 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-slate-100">
              <tr className="text-left">
                <th className="p-3 w-8">
                  <Checkbox
                    checked={sortedRows.length > 0 && sortedRows.every((s: any) => selected[s.id])}
                    onCheckedChange={(v) => {
                      const next = { ...selected };
                      sortedRows.forEach((s: any) => (next[s.id] = !!v));
                      setSelected(next);
                    }}
                  />
                </th>
                <Th onClick={() => toggleSort("name")}>Name</Th>
                <Th onClick={() => toggleSort("company")}>Role / company</Th>
                <Th onClick={() => toggleSort("column")}>Column</Th>
                <th className="p-3 font-medium">Session type</th>
                <th className="p-3 font-medium">Comms channel</th>
                <th className="p-3 font-medium">On site</th>
                <th className="p-3 font-medium">In Tito</th>
                <Th onClick={() => toggleSort("last")}>Last contact</Th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((s: any) => (
                <tr
                  key={s.id}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer"
                  onClick={() => setDetail(s)}
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={!!selected[s.id]}
                      onCheckedChange={(v) => setSelected({ ...selected, [s.id]: !!v })}
                    />
                  </td>
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 text-muted-foreground">
                    {[s.title, s.company].filter(Boolean).join(" at ") || "—"}
                  </td>
                  <td className="p-3">
                    <StatusPill className="bg-slate-100 text-slate-700 ring-slate-200 text-[10px]">
                      {columnById[s.board_column_id]?.name ?? "Unplaced"}
                    </StatusPill>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {s.session_format ? (labels.sessionFormat?.[s.session_format] ?? s.session_format) : "—"}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {s.outreach_channel
                      ? (labels.channel?.[s.outreach_channel] ?? s.outreach_channel)
                      : "—"}
                  </td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={onSiteOf(s)}
                      onCheckedChange={(v) =>
                        onSiteMut.mutate({ speaker_id: s.id, on_site: !!v })
                      }
                    />
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{s.in_tito ? "Yes" : "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {s.last_message_at
                      ? new Date(s.last_message_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-sm text-muted-foreground">
                    No speakers on this board.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      <SpeakerDetailDialog
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        speaker={detail}
        event={detail?.event ?? null}
        onEdit={() => {
          const s = detail;
          setDetail(null);
          if (s) setEditing(s);
        }}
        onEmail={() => {
          if (detail) {
            setSelected({ [detail.id]: true });
            setDetail(null);
            setBulkOpen(true);
          }
        }}
      />
      {editing && (
        <SpeakerFormDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          speaker={editing}
        />
      )}
      <BulkEmailDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        speakers={selectedSpeakers}
        eventId={board?.event_id ?? null}
      />
      <DuplicateCompareDialog
        open={!!dupFor}
        onOpenChange={(o) => !o && setDupFor(null)}
        candidates={dupFor ?? []}
        boardId={boardId}
      />
      <AddColumnDialog open={addOpen} onOpenChange={setAddOpen} boardId={boardId} />
      <DeleteColumnDialog
        col={deleteCol}
        onClose={() => setDeleteCol(null)}
        boardId={boardId}
        count={deleteCol ? (byColumn[deleteCol.id]?.length ?? 0) : 0}
      />
    </div>
  );
}

function Th({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <th className="p-3 font-medium">
      <button type="button" onClick={onClick} className="hover:text-foreground">
        {children}
      </button>
    </th>
  );
}

function ColumnHeader({
  col,
  count,
  onDragStart,
  onDelete,
  boardId,
}: {
  col: any;
  count: number;
  onDragStart: () => void;
  onDelete: () => void;
  boardId: string;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(col.name);
  const rename = useServerFn(renameBoardColumn);
  const qc = useQueryClient();

  async function commit() {
    setEditingName(false);
    const next = name.trim();
    if (!next || next === col.name) {
      setName(col.name);
      return;
    }
    try {
      await rename({ data: { id: col.id, name: next } });
      qc.invalidateQueries({ queryKey: ["speakerBoard", boardId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
      setName(col.name);
    }
  }

  return (
    <div
      className="flex items-center gap-1.5 px-1 mb-2 pt-1"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
    >
      <GripVertical className="h-3.5 w-3.5 text-slate-300 cursor-grab shrink-0" />
      {editingName ? (
        <Input
          autoFocus
          className="h-7 text-xs"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setName(col.name);
              setEditingName(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingName(true)}
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground truncate"
        >
          {col.name}
        </button>
      )}
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{count}</span>
      <button
        type="button"
        onClick={onDelete}
        title="Delete column"
        className="text-slate-300 hover:text-rose-600"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AddColumnDialog({
  open,
  onOpenChange,
  boardId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  boardId: string;
}) {
  const [name, setName] = useState("");
  const add = useServerFn(addBoardColumn);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => add({ data: { board_id: boardId, name: name.trim() } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["speakerBoard", boardId] });
      setName("");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add column</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Column name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Custom columns don't change a speaker's status when you drag a card into them.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => m.mutate()} disabled={!name.trim() || m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteColumnDialog({
  col,
  onClose,
  boardId,
  count,
}: {
  col: any | null;
  onClose: () => void;
  boardId: string;
  count: number;
}) {
  const del = useServerFn(deleteBoardColumn);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => del({ data: { id: col.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["speakerBoard", boardId] });
      qc.invalidateQueries({ queryKey: ["speakers"] });
      toast.success("Column deleted");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <Dialog open={!!col} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete "{col?.name}"?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {count > 0
            ? `${count} card${count === 1 ? "" : "s"} will move to the first column. Statuses stay as they are.`
            : "This column is empty."}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
