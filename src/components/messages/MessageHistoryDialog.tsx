import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2, Sparkles, Repeat, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { eventsQuery, messageGenerationHistoryQuery } from "@/lib/queries";
import {
  deleteMessageGenerationHistory,
  type MessageGenerationHistoryEntry,
} from "@/lib/message-history.functions";
import { streamMeta, type MessageEvent } from "@/lib/message-render";

export function MessageHistoryDialog({
  open,
  onOpenChange,
  event,
  onUse,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: MessageEvent;
  /** Open this generation in the compose flow, against the given event. */
  onUse: (entry: MessageGenerationHistoryEntry, target: MessageEvent) => void;
}) {
  const qc = useQueryClient();
  const history = useQuery(messageGenerationHistoryQuery(event.id));
  const events = useQuery(eventsQuery);
  const [reuseFor, setReuseFor] = useState<string | null>(null);

  const del = useServerFn(deleteMessageGenerationHistory);
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messageGenerationHistory", event.id] });
      toast.success("Removed from history");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const entries = history.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Generated message history
          </DialogTitle>
          <DialogDescription>
            Every AI generation and refinement for this event, newest first. Open one to keep
            refining it, or reuse it for another event with that event's details filled in.
          </DialogDescription>
        </DialogHeader>

        {history.isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing generated for this event yet.
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((h) => {
              const meta = streamMeta[h.stream] ?? streamMeta.attendees;
              return (
                <article key={h.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{h.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.chip}`}>
                      {meta.label}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {h.source === "refine" ? "Refinement" : "New draft"}
                    </span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
                    <span className="font-semibold text-foreground">What I asked: </span>
                    {h.prompt}
                  </div>

                  <div className="mt-2 text-[13px]">
                    <div className="font-medium text-foreground">{h.subject}</div>
                    <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-muted-foreground">
                      {h.body_markdown}
                    </pre>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => onUse(h, event)}>
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      Open and keep refining
                    </Button>

                    <div className="flex items-center gap-1.5">
                      <Select
                        value={reuseFor ?? undefined}
                        onValueChange={(v) => {
                          setReuseFor(v);
                          const target = (events.data ?? []).find((e) => e.id === v);
                          if (target) onUse(h, target as unknown as MessageEvent);
                        }}
                      >
                        <SelectTrigger className="h-8 w-[220px] text-[13px]">
                          <SelectValue placeholder="Reuse for another event" />
                        </SelectTrigger>
                        <SelectContent>
                          {(events.data ?? [])
                            .filter((e) => e.id !== event.id)
                            .map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-8 text-muted-foreground"
                      onClick={() => remove.mutate(h.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
