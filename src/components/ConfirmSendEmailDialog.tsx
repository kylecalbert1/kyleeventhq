import { useEffect, useState } from "react";
import { Send, Loader2, ShieldAlert } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEmailEditor } from "@/components/RichTextEmailEditor";
import { toEmailHtml } from "@/lib/email-format";
import { logEmailSend, type TemplateType } from "@/lib/email-sends.functions";

export type ConfirmDraft = {
  to: string;
  subject: string;
  body: string;
  recipientName?: string;
  templateType?: TemplateType;
  eventId?: string | null;
  speakerId?: string | null;
};

export function ConfirmSendEmailDialog({
  open,
  onOpenChange,
  draft,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  draft: ConfirmDraft | null;
  onConfirm: (edited: { subject: string; body: string }) => Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const logSend = useServerFn(logEmailSend);
  const qc = useQueryClient();

  useEffect(() => {
    if (draft) {
      setSubject(draft.subject);
      // Body may arrive as plain text (older callers) or HTML (rich-text
      // callers). Normalize so the rich-text editor renders line breaks
      // and any legacy `**bold**` markdown correctly.
      setBody(toEmailHtml(draft.body));
    }
  }, [draft]);

  async function handleConfirm() {
    setSending(true);
    try {
      await onConfirm({ subject, body });
      if (draft?.templateType) {
        try {
          await logSend({
            data: {
              event_id: draft.eventId ?? null,
              template_type: draft.templateType,
              subject,
              body,
              recipients: [
                {
                  speaker_id: draft.speakerId ?? null,
                  email: draft.to,
                  name: draft.recipientName ?? null,
                },
              ],
            },
          });
          qc.invalidateQueries({ queryKey: ["emailSends"] });
          qc.invalidateQueries({ queryKey: ["speakerActivity"] });
        } catch (e) {
          console.error("Failed to log email send:", e);
        }
      }
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Confirm email
            {draft?.recipientName ? ` to ${draft.recipientName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-amber-50/70 border border-amber-200 px-3 py-2 text-xs text-amber-900">
            This email will be sent immediately from your connected Gmail
            account. Review and edit before confirming.
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input value={draft?.to ?? ""} readOnly className="bg-muted/40" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={sending}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Body</Label>
            <RichTextEmailEditor
              value={body}
              onChange={setBody}
              disabled={sending}
              minRows={10}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={sending || !subject.trim() || !body.trim()}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1.5" />
                Confirm &amp; send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
