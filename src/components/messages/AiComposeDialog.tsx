import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, RotateCcw, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { generateMessageDraft, type AiMessageDraft } from "@/lib/message-ai.functions";

export function AiComposeDialog({
  open,
  onOpenChange,
  eventId,
  onDraft,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  onDraft: (draft: AiMessageDraft) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<AiMessageDraft | null>(null);
  const [refinement, setRefinement] = useState("");
  const generate = useServerFn(generateMessageDraft);

  useEffect(() => {
    if (open) {
      setPrompt("");
      setDraft(null);
      setRefinement("");
    }
  }, [open]);

  const run = useMutation({
    mutationFn: (input: { text: string; refine: boolean }) =>
      generate({
        data: {
          prompt: input.text,
          event_id: eventId,
          ...(input.refine && draft ? { current_draft: draft } : {}),
        },
      }),
    onSuccess: (d) => {
      setDraft(d as AiMessageDraft);
      setRefinement("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not generate a draft"),
  });

  const busy = run.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Describe a message
          </DialogTitle>
          <DialogDescription>
            Say what you want to send, then refine it with follow-up instructions until it reads
            right. The draft uses this event's real details through the usual placeholders.
          </DialogDescription>
        </DialogHeader>

        {!draft && (
          <Textarea
            rows={7}
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What do you want to send? e.g. 'Urgent reminder to fill out dietary requirements and book their hotel room, deadline is approaching fast'"
          />
        )}

        {draft && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {draft.name} · {draft.stream.replace("_", " ")}
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">{draft.subject}</div>
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                {draft.body_markdown}
              </p>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Refine this draft
              </div>
              <Textarea
                rows={3}
                autoFocus
                value={refinement}
                onChange={(e) => setRefinement(e.target.value)}
                placeholder="e.g. 'Make it shorter and more urgent', 'Add a line about the early bird deadline', 'Softer tone'"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && refinement.trim().length >= 3) {
                    run.mutate({ text: refinement.trim(), refine: true });
                  }
                }}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {!draft ? (
            <Button
              disabled={prompt.trim().length < 3 || busy}
              onClick={() => run.mutate({ text: prompt.trim(), refine: false })}
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-4 w-4" />
              )}
              {busy ? "Generating" : "Generate"}
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setRefinement("");
                }}
              >
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Start over
              </Button>
              <Button
                variant="outline"
                disabled={refinement.trim().length < 3 || busy}
                onClick={() => run.mutate({ text: refinement.trim(), refine: true })}
              >
                {busy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" />
                )}
                {busy ? "Refining" : "Refine"}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  onOpenChange(false);
                  onDraft(draft);
                }}
              >
                <Check className="mr-1.5 h-4 w-4" />
                Use this draft
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
