import { useMemo, useState } from "react";
import { Copy, Check, AlertTriangle, Pencil, Filter } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  renderMessage,
  markdownToHtml,
  streamMeta,
  weeksSlotLabel,
  PLACEHOLDER_FIELD_LABEL,
  type MessageEvent,
} from "@/lib/message-render";
import type { MessageTemplate } from "@/lib/message-templates.functions";

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
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);

  const rendered = useMemo(() => {
    if (!template) return null;
    return renderMessage(template, event, userFirstName);
  }, [template, event, userFirstName]);

  const blocked = (rendered?.missing.length ?? 0) > 0;

  async function copy(text: string, which: "subject" | "body") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
      toast.success(which === "subject" ? "Subject copied" : "Message copied");
    } catch {
      toast.error("Could not copy, select the text and copy manually");
    }
  }

  if (!template || !rendered) return null;
  const meta = streamMeta[template.stream];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{template.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.chip}`}>
              {meta.label}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
              {weeksSlotLabel(template.weeks_out)}
            </span>
          </DialogTitle>
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
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Subject
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={blocked}
                onClick={() => copy(rendered.subject, "subject")}
              >
                {copied === "subject" ? (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                Copy subject
              </Button>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
              {rendered.subject}
            </div>
          </section>

          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Message (markdown, paste into Tito)
              </div>
              <Button
                size="sm"
                className="h-8"
                disabled={blocked}
                onClick={() => copy(rendered.body, "body")}
              >
                {copied === "body" ? (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                Copy message
              </Button>
            </div>
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-foreground">
              {rendered.body}
            </pre>
          </section>

          <section className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Preview
            </div>
            <div
              className="rounded-lg border border-border bg-card px-4 py-3 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:my-2 [&_ul]:my-2"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(rendered.body) }}
            />
            <p className="text-[11px] text-muted-foreground">
              {"{{curly_brace}}"} tags are Tito merge tags and are left untouched, Tito fills
              them when it sends.
            </p>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
