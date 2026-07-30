import { useState } from "react";
import { Send, Loader2, ShieldAlert } from "lucide-react";
import { toEmailHtml } from "@/lib/email-format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type BulkConfirmRow = {
  id: string;
  name: string;
  to: string;
  subject: string;
  body: string;
};

export function BulkConfirmSendDialog({
  open,
  onOpenChange,
  rows,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: BulkConfirmRow[];
  onConfirm: () => Promise<void>;
}) {
  const [sending, setSending] = useState(false);

  async function handleConfirm() {
    setSending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Confirm sending {rows.length} email{rows.length === 1 ? "" : "s"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md bg-amber-50/70 border border-amber-200 px-3 py-2 text-xs text-amber-900">
            These emails will be sent immediately from your connected Gmail
            account. Review each personalized message before confirming. To
            edit a specific message, cancel and use the individual Send button
            on that row.
          </div>

          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
            {rows.map((r, i) => (
              <div
                key={r.id}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold truncate">
                    {i + 1}. {r.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.to}
                  </div>
                </div>
                <div className="mt-1.5 text-xs font-medium truncate">
                  {r.subject}
                </div>
                <div className="mt-1 text-xs text-muted-foreground whitespace-pre-line line-clamp-4">
                  {r.body}
                </div>
              </div>
            ))}
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
            disabled={sending || rows.length === 0}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1.5" />
                Confirm &amp; send all ({rows.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
