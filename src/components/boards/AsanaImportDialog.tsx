import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { importAsanaBoard, listAsanaProjectsForImport } from "@/lib/boards.functions";
import { cn } from "@/lib/utils";
import { fuzzyFilter } from "@/lib/fuzzy-search";

export function AsanaImportDialog({
  open,
  onOpenChange,
  boardId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  boardId: string;
}) {
  const qc = useQueryClient();
  const importFn = useServerFn(importAsanaBoard);
  const listFn = useServerFn(listAsanaProjectsForImport);
  const [value, setValue] = useState("");
  const [filter, setFilter] = useState("");

  const projects = useQuery({
    queryKey: ["asanaProjectsForImport"],
    queryFn: () => listFn({}),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const m = useMutation({
    mutationFn: () => importFn({ data: { board_id: boardId, project: value.trim() } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["speakerBoard", boardId] });
      qc.invalidateQueries({ queryKey: ["speakers"] });
      toast.success(
        `Imported ${r.created} new card${r.created === 1 ? "" : "s"}${
          r.matched ? `, updated ${r.matched} existing` : ""
        }${r.unmatched_sections ? ` · ${r.unmatched_sections} task(s) landed in the first column` : ""}`,
      );
      onOpenChange(false);
      setValue("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  const list = fuzzyFilter(
    (projects.data?.projects ?? []) as any[],
    filter,
    (p: any) => [p.name],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from Asana</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Asana project URL or ID</Label>
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://app.asana.com/0/1201234567890/list"
            />
          </div>

          <div>
            <Label className="text-xs">Or pick a project you have access to</Label>
            {projects.isLoading ? (
              <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading Asana projects…
              </div>
            ) : projects.data?.connected === false ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Asana isn't connected, so the project list is unavailable — paste a project URL above
                instead.
              </p>
            ) : (
              <>
                <Input
                  className="mt-1 h-8"
                  placeholder="Filter projects…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                  {list.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-muted-foreground">No projects found.</p>
                  ) : (
                    list.map((p: any) => (
                      <button
                        key={p.gid}
                        type="button"
                        onClick={() => setValue(p.gid)}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0",
                          value === p.gid && "bg-primary/5 font-medium",
                        )}
                      >
                        {p.name}
                        <span className="ml-2 text-[11px] text-muted-foreground">{p.workspace}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Asana sections are matched to columns by name (Interest, In conversation, Confirmed,
            Registered, Declined). Anything that doesn't match lands in the first column.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => m.mutate()} disabled={!value.trim() || m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
