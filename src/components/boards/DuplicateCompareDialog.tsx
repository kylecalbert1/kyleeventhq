import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Merge } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { mergeSpeakers } from "@/lib/boards.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const FIELDS: Array<{ key: string; label: string }> = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "company", label: "Company" },
  { key: "title", label: "Job title" },
  { key: "status", label: "Status" },
  { key: "session_title", label: "Session title" },
  { key: "session_format", label: "Session format" },
  { key: "linkedin_url", label: "LinkedIn" },
  { key: "outreach_channel", label: "Channel" },
  { key: "last_message_at", label: "Last message" },
  { key: "notes", label: "Notes" },
];

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

/**
 * Side-by-side duplicate compare. Nothing happens until Kyle picks a survivor
 * and clicks Merge; the loser's non-null fields fill the survivor's blanks.
 */
export function DuplicateCompareDialog({
  open,
  onOpenChange,
  candidates,
  boardId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  candidates: any[];
  boardId: string;
}) {
  const [survivorId, setSurvivorId] = useState<string | null>(null);
  const merge = useServerFn(mergeSpeakers);
  const qc = useQueryClient();

  const pair = candidates.slice(0, 2);
  const loser = pair.find((p) => p.id !== survivorId);

  const m = useMutation({
    mutationFn: () =>
      merge({ data: { survivor_id: survivorId!, loser_id: loser!.id } }),
    onSuccess: () => {
      toast.success("Records merged");
      qc.invalidateQueries({ queryKey: ["speakerBoard", boardId] });
      qc.invalidateQueries({ queryKey: ["speakers"] });
      onOpenChange(false);
      setSurvivorId(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Merge failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Possible duplicate</DialogTitle>
        </DialogHeader>
        {candidates.length > 2 && (
          <p className="text-xs text-muted-foreground">
            {candidates.length} records match on name or email — comparing the first two.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {pair.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSurvivorId(c.id)}
              className={cn(
                "text-left rounded-xl border p-3 transition-colors",
                survivorId === c.id
                  ? "border-primary bg-primary/5"
                  : "border-slate-200 hover:bg-slate-50",
              )}
            >
              <div className="text-sm font-semibold">{c.name}</div>
              <div className="text-[11px] text-muted-foreground mb-2">
                {survivorId === c.id ? "Keeps this record" : "Click to keep this one"}
              </div>
              <dl className="space-y-1">
                {FIELDS.map((f) => (
                  <div key={f.key} className="grid grid-cols-[92px_1fr] gap-2 text-[11px]">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="truncate">{show(c[f.key])}</dd>
                  </div>
                ))}
              </dl>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={!survivorId || !loser || m.isPending}
          >
            {m.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Merge className="h-4 w-4 mr-1.5" />
            )}
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
