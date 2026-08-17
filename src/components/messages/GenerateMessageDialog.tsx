import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Check, AlertTriangle, Pencil, Filter, Save, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  renderMessage,
  markdownToHtml,
  streamMeta,
  typicalWeeksLabel,
  buildPlaceholderValues,
  unrenderPlaceholders,
  PLACEHOLDER_FIELD_LABEL,
  type MessageEvent,
} from "@/lib/message-render";
import {
  updateMessageTemplate,
  markMessageSent,
  type MessageTemplate,
} from "@/lib/message-templates.functions";
import { InsertBlockMenu } from "./InsertBlockMenu";

export function GenerateMessageDialog({
  open,
  onOpenChange,
  template,
  event,
  userFirstName,
  onEditEvent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: MessageTemplate | null;
  event: MessageEvent;
  userFirstName: string;
  onEditEvent?: () => void;
}) {
  const qc = useQueryClient();
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState("");
  const [warnLost, setWarnLost] = useState<string[] | null>(null);

  const update = useServerFn(updateMessageTemplate);
  const logSend = useServerFn(markMessageSent);

  const rendered = useMemo(() => {
    if (!template) return null;
    return renderMessage(template, event, userFirstName);
  }, [template, event, userFirstName]);

  // Re-seed the editable fields whenever a different type is opened.
  useEffect(() => {
    if (!rendered) return;
    setSubject(rendered.subject);
    setBody(rendered.body);
    setRecipients("");
  }, [template?.id, rendered?.subject, rendered?.body]);

  const edited =
    Boolean(rendered) && (subject !== rendered!.subject || body !== rendered!.body);
  const blocked = (rendered?.missing.length ?? 0) > 0;

  const saveTemplate = useMutation({
    mutationFn: async () => {
      if (!template) return;
      const values = buildPlaceholderValues(event, userFirstName);
      const s = unrenderPlaceholders(subject, template.subject, values);
      const b = unrenderPlaceholders(body, template.body_markdown, values);
      return update({
        data: { id: template.id, patch: { subject: s.text, body_markdown: b.text } },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messageTemplates"] });
      toast.success("Template updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const logged = useMutation({
    mutationFn: async () => {
      if (!template) return;
      return logSend({
        data: {
          event_id: event.id,
          template_id: template.id,
          recipient_count: recipients ? Number(recipients) : null,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eventMessageSends", event.id] });
      toast.success("Copied and logged as sent");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  async function copy(text: string, which: "subject" | "body") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
      return true;
    } catch {
      toast.error("Could not copy, select the text and copy manually");
      return false;
    }
  }

  function attemptSaveToTemplate() {
    if (!template) return;
    const values = buildPlaceholderValues(event, userFirstName);
    const s = unrenderPlaceholders(subject, template.subject, values);
    const b = unrenderPlaceholders(body, template.body_markdown, values);
    const lost = [...new Set([...s.lost, ...b.lost])];
    if (lost.length) {
      setWarnLost(lost);
      return;
    }
    saveTemplate.mutate();
  }

  if (!template || !rendered) return null;
  const meta = streamMeta[template.stream];
  const typical = typicalWeeksLabel(template.typical_weeks);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>{template.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.chip}`}>
                {meta.label}
              </span>
              {typical && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                  {typical}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Edit freely, this only changes what you copy now. Use "Save changes to template" if
              you want the change to stick for every event.
            </DialogDescription>
          </DialogHeader>

          {template.tito_filter_hint && (
            <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-900">
              <Filter className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <span className="font-semibold">Tito recipient filter: </span>
                {template.tito_filter_hint}
              </div>
            </div>
          )}

          {blocked && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Cannot copy yet: {rendered.missing.length} event field
                {rendered.missing.length === 1 ? "" : "s"} missing
              </div>
              <ul className="mt-1.5 list-disc pl-5">
                {rendered.missing.map((k) => (
                  <li key={k}>
                    <span className="font-medium">{PLACEHOLDER_FIELD_LABEL[k] ?? k}</span>{" "}
                    <span className="font-mono text-[11px] opacity-70">[[{k}]]</span>
                  </li>
                ))}
              </ul>
              {onEditEvent && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-8 border-amber-300 bg-white"
                  onClick={onEditEvent}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Fill these in on the event
                </Button>
              )}
            </div>
          )}

          <div className="space-y-4">
            <section className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Subject
                </Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={blocked}
                  onClick={() => copy(subject, "subject")}
                >
                  {copied === "subject" ? (
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Copy subject
                </Button>
              </div>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Message (markdown)
                  </Label>
                  <InsertBlockMenu textareaRef={bodyRef} value={body} onChange={setBody} />
                </div>
                <Textarea
                  ref={bodyRef}
                  rows={18}
                  className="font-mono text-[12.5px]"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </section>

              <section className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview
                </Label>
                <div
                  className="min-h-[200px] rounded-lg border border-border bg-card px-4 py-3 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:my-2 [&_ul]:my-2"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(body) }}
                />
                <p className="text-[11px] text-muted-foreground">
                  {"{{curly_brace}}"} tags are Tito merge tags and are left untouched, Tito fills
                  them when it sends.
                </p>
              </section>
            </div>
          </div>

          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <Button
              variant="outline"
              disabled={!edited || saveTemplate.isPending}
              onClick={attemptSaveToTemplate}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Save changes to template
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={0}
                placeholder="Recipients"
                className="h-9 w-28"
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={blocked}
                onClick={() => copy(body, "body").then((ok) => ok && toast.success("Copied"))}
              >
                <Copy className="mr-1.5 h-4 w-4" />
                Copy
              </Button>
              <Button
                disabled={blocked || logged.isPending}
                onClick={async () => {
                  const ok = await copy(body, "body");
                  if (ok) logged.mutate();
                }}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Copy and log as sent
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={warnLost !== null} onOpenChange={(v) => !v && setWarnLost(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Some placeholders will be baked in</AlertDialogTitle>
            <AlertDialogDescription>
              You edited text that came from{" "}
              {(warnLost ?? []).map((k) => `[[${k}]]`).join(", ")}. Saving now stores this event's
              wording as literal text in the shared template, so other events will get it too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setWarnLost(null);
                saveTemplate.mutate();
              }}
            >
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
