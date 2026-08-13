import { PageHelp } from "@/components/PageHelp";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, Columns3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { boardsQuery } from "@/lib/queries";
import { createBoard } from "@/lib/boards.functions";
import { softCard } from "@/components/speakers/SpeakerListCard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fuzzyFilter } from "@/lib/fuzzy-search";

export const Route = createFileRoute("/_authenticated/boards/")({
  head: () => ({
    meta: [
      { title: "Speaker boards — Event Command Centre" },
      {
        name: "description",
        content: "Per-event speaker boards: quiet cards, few columns, detail on click.",
      },
      { property: "og:title", content: "Speaker boards — Event Command Centre" },
      {
        property: "og:description",
        content: "Per-event speaker boards: quiet cards, few columns, detail on click.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(boardsQuery),
  component: BoardsIndexPage,
});

function BoardsIndexPage() {
  const boards = useQuery(boardsQuery);
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const rows = useMemo(() => {
    const all = boards.data ?? [];
    return fuzzyFilter(all, q, (b: any) => [b.name, b.event?.code, b.event?.name]);
  }, [boards.data, q]);

  const eventBoards = rows.filter((b: any) => b.event_id);
  const customBoards = rows.filter((b: any) => !b.event_id);

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 animate-fade-in">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="accent-bar mb-3" />
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Columns3 className="h-6 w-6 text-primary" />
            Speaker boards
          </h1>
          <PageHelp
            title={"Speaker boards"}
            what={"A kanban board per event for moving speakers through the pipeline, plus any custom pools you create."}
            steps={[
              "Open the board for the event you"re recruiting for.",
              "Drag cards between columns — the speaker"s status updates automatically.",
              "Add speakers directly to a board or import a list.",
            ]}
          />
          <p className="text-sm text-muted-foreground mt-1">
            One board per event, plus any pools you create yourself.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          New board
        </Button>
      </div>

      <div className="mb-6 relative max-w-xl">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          className="pl-10 h-11 rounded-xl bg-white border-slate-200 shadow-sm"
          placeholder="Search boards…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <BoardGroup title="Event boards" boards={eventBoards} loading={boards.isLoading} />
      <BoardGroup title="Custom boards" boards={customBoards} loading={boards.isLoading} />

      <NewBoardDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function BoardGroup({
  title,
  boards,
  loading,
}: {
  title: string;
  boards: any[];
  loading: boolean;
}) {
  return (
    <section className="mb-8 space-y-3">
      <div>
        <div className="accent-bar mb-2" />
        <h2 className="text-sm font-semibold">
          {title} <span className="text-muted-foreground">({boards.length})</span>
        </h2>
      </div>
      {loading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground rounded-2xl">Loading…</Card>
      ) : boards.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground rounded-2xl">
          Nothing here yet.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {boards.map((b) => (
            <Link
              key={b.id}
              to="/boards/$boardId"
              params={{ boardId: b.id }}
              className={cn(softCard, "p-4 block")}
            >
              <div className="text-sm font-semibold truncate">{b.name}</div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {b.event
                  ? `${b.event.code} · ${b.event.event_date ? new Date(b.event.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "no date"}`
                  : "Standalone board"}
              </div>
              <div className="mt-3 text-xs text-muted-foreground tabular-nums">
                {b.speaker_count} speaker{b.speaker_count === 1 ? "" : "s"} ·{" "}
                {b.confirmed_count} confirmed
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function NewBoardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [name, setName] = useState("");
  const create = useServerFn(createBoard);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const m = useMutation({
    mutationFn: () => create({ data: { name: name.trim(), event_id: null } }),
    onSuccess: async (b: any) => {
      await qc.invalidateQueries({ queryKey: ["speakerBoards"] });
      toast.success("Board created");
      onOpenChange(false);
      setName("");
      navigate({ to: "/boards/$boardId", params: { boardId: b.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New board</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="e.g. 2027 speaker pool"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Starts with the five default columns. You can rename, reorder and add more.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => m.mutate()} disabled={!name.trim() || m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
