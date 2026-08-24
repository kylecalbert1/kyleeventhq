import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { generateEmailDraft, type AiEmailDraft } from "@/lib/email-ai.functions";
import { createEmailTemplate } from "@/lib/email-templates.functions";

type GroupKey =
  | "prospective"
  | "current_confirmed"
  | "past_speakers"
  | "confirmed_not_registered";

export function AiComposeEmailDialog({
  open,
  onOpenChange,
  eventId,
  group,
  onDraft,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  group: GroupKey;
  onDraft: (draft: AiEmailDraft) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<AiEmailDraft | null>(null);
  const [templateName, setTemplateName] = useState("");
  const generate = useServerFn(generateEmailDraft);
  const saveTemplate = useServerFn(createEmailTemplate);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) {
      setPrompt("");
      setDraft(null);
      setTemplateName("");
    }
  }, [open]);

  const run = useMutation({
    mutationFn: () => generate({ data: { prompt: prompt.trim(), event_id: eventId, group } }),
    onSuccess: (d) => {
      const draftValue = d as AiEmailDraft;
      setDraft(draftValue);
      setTemplateName(draftValue.subject.slice(0, 60));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not generate a draft"),
  });

  const save = useMutation({
    mutationFn: () =>
      saveTemplate({
        data: {
          name: templateName.trim() || draft?.subject || "AI draft",
          subject: draft?.subject ?? "",
          body: draft?.body ?? "",
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["emailTemplates"] });
      toast.success("Saved as template");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save template"),
  });

  const busy = run.isPending || save.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Describe a message
          </DialogTitle>
          <DialogDescription>
            Say what you want to send. The draft stays templated with {"{{placeholders}}"} so it
            works for the whole audience, and you can edit it before previewing.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          rows={6}
          autoFocus
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask speakers who confirmed but haven't registered yet to register, deadline is coming up soon"
        />

        {draft && (
          <div className="space-y-3 rounded-xl border-2 border-border bg-muted/30 p-4">
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Subject
              </Label>
              <p className="text-[13px] font-semibold text-foreground">{draft.subject}</p>
            </div>
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Body
              </Label>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                {draft.body}
              </p>
            </div>
            <div className="flex items-end gap-2 border-t border-border pt-3">
              <div className="flex-1">
                <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Template name
                </Label>
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="h-9 text-[13px]"
                />
              </div>
              <Button
                variant="outline"
                disabled={save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                Save as template
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant={draft ? "outline" : "default"}
            disabled={prompt.trim().length < 3 || run.isPending}
            onClick={() => run.mutate()}
          >
            {run.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            {run.isPending ? "Generating" : draft ? "Regenerate" : "Generate"}
          </Button>
          {draft && (
            <Button
              onClick={() => {
                onDraft(draft);
                onOpenChange(false);
              }}
            >
              Use this draft
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
