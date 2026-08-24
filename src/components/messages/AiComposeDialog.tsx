import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
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
  const generate = useServerFn(generateMessageDraft);

  const run = useMutation({
    mutationFn: () => generate({ data: { prompt: prompt.trim(), event_id: eventId } }),
    onSuccess: (draft) => {
      setPrompt("");
      onOpenChange(false);
      onDraft(draft as AiMessageDraft);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not generate a draft"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !run.isPending && onOpenChange(v)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Describe a message
          </DialogTitle>
          <DialogDescription>
            Say what you want to send. The draft uses this event's real details through the usual
            placeholders, and you can edit it before copying.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          rows={7}
          autoFocus
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What do you want to send? e.g. 'Urgent reminder to fill out dietary requirements and book their hotel room, deadline is approaching fast'"
        />

        <DialogFooter>
          <Button
            disabled={prompt.trim().length < 3 || run.isPending}
            onClick={() => run.mutate()}
          >
            {run.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            {run.isPending ? "Generating" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
