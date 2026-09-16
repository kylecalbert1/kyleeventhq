import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, Save, RotateCcw } from "lucide-react";
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
  const [refinement, setRefinement] = useState("");
  const [templateName, setTemplateName] = useState("");
  const generate = useServerFn(generateEmailDraft);
  const saveTemplate = useServerFn(createEmailTemplate);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) {
      setPrompt("");
      setDraft(null);
      setTemplateName("");
      setRefinement("");
    }
  }, [open]);

  const run = useMutation({
    mutationFn: (input: { text: string; refine: boolean }) =>
      generate({
        data: {
          prompt: input.text,
          event_id: eventId,
          group,
          ...(input.refine && draft ? { current_draft: draft } : {}),
        },
      }),
    onSuccess: (d) => {
      const draftValue = d as AiEmailDraft;
      setDraft(draftValue);
      setTemplateName(draftValue.subject.slice(0, 60));
      setRefinement("");
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
            Describe an email
          </DialogTitle>
          <DialogDescription>
            Say what you want to send as an email. The draft stays templated with {"{{placeholders}}"} so it
            works for the whole audience, and you can edit it before previewing.
          </DialogDescription>
        </DialogHeader>

        {!draft && (
          <Textarea
            rows={6}
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask speakers who confirmed but haven't registered yet to register, deadline is coming up soon"
          />
        )}

        {draft && (
          <div className="space-y-3 rounded-xl border-2 border-border bg-muted/30 p-4">
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Subject
              </Label>
              <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
            </div>
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Body
              </Label>
              <div className="grid gap-3 md:grid-cols-2">
                <Textarea rows={11} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                <div className="min-h-[180px] rounded-lg border border-border bg-card px-4 py-3 text-[13px] leading-relaxed">
                  <p className="mb-3">Hi {"{{first_name}}"},</p>
                  <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: draft.body.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>") }} />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Refine this draft</Label>
              <Textarea
                rows={3}
                value={refinement}
                onChange={(e) => setRefinement(e.target.value)}
                placeholder="Make it shorter, more urgent, or change the tone"
              />
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
          {!draft ? <Button
            disabled={prompt.trim().length < 3 || run.isPending}
            onClick={() => run.mutate({ text: prompt.trim(), refine: false })}
          >
            {run.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            {run.isPending ? "Generating" : "Generate"}
          </Button> : <>
            <Button variant="ghost" disabled={busy} onClick={() => { setDraft(null); setRefinement(""); }}>
              <RotateCcw className="mr-1.5 h-4 w-4" /> Start over
            </Button>
            <Button variant="outline" disabled={refinement.trim().length < 3 || busy} onClick={() => run.mutate({ text: refinement.trim(), refine: true })}>
              {run.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              {run.isPending ? "Refining" : "Refine"}
            </Button>
          </>}
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
