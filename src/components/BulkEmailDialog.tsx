import { useMemo, useState } from "react";
import { Mail, AlertTriangle, CheckCircle2, XCircle, Loader2, Send, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { renderTemplate, firstNameOf } from "@/lib/gmail";
import { sendGmailEmail, checkGmailConnected } from "@/lib/email.functions";
import { ConfirmSendEmailDialog, type ConfirmDraft } from "@/components/ConfirmSendEmailDialog";
import { BulkConfirmSendDialog } from "@/components/BulkConfirmSendDialog";

type Speaker = {
  id: string;
  name: string;
  email?: string | null;
  company?: string | null;
};

type SendStatus = "idle" | "sending" | "sent" | "failed" | "skipped";

export function BulkEmailDialog({
  open,
  onOpenChange,
  speakers,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  speakers: Speaker[];
}) {
  const [subject, setSubject] = useState(
    "Quick ask for {{firstName}} — event assets",
  );
  const [body, setBody] = useState(
    "Hey {{firstName}},\n\nHope you're doing well! Could you send over your logo, headshot and short bio when you get a moment? It helps us finalise everything for the event.\n\nThanks so much!",
  );
  const [confirmOne, setConfirmOne] = useState<
    (ConfirmDraft & { id: string }) | null
  >(null);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [status, setStatus] = useState<Record<string, SendStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sendingAll, setSendingAll] = useState(false);

  const send = useServerFn(sendGmailEmail);
  const checkConn = useServerFn(checkGmailConnected);
  const connQuery = useQuery({
    queryKey: ["gmail-connected"],
    queryFn: () => checkConn(),
  });
  const connected = connQuery.data?.connected ?? false;

  const rows = useMemo(() => {
    return speakers.map((s) => {
      const firstName = firstNameOf(s.name);
      const vars = { firstName, name: s.name, company: s.company ?? "" };
      return {
        ...s,
        firstName,
        rSubject: renderTemplate(subject, vars),
        rBody: renderTemplate(body, vars),
      };
    });
  }, [speakers, subject, body]);

  const missingEmail = rows.filter((r) => !r.email).length;
  const sendable = rows.filter((r) => r.email);

  async function sendOne(r: (typeof rows)[number]) {
    if (!r.email) {
      setStatus((s) => ({ ...s, [r.id]: "skipped" }));
      return;
    }
    setStatus((s) => ({ ...s, [r.id]: "sending" }));
    try {
      await send({ data: { to: r.email, subject: r.rSubject, body: r.rBody } });
      setStatus((s) => ({ ...s, [r.id]: "sent" }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setErrors((x) => ({ ...x, [r.id]: msg }));
      setStatus((s) => ({ ...s, [r.id]: "failed" }));
    }
  }

  async function sendAll() {
    setSendingAll(true);
    // Sequentially to avoid rate limits
    for (const r of sendable) {
      if (status[r.id] === "sent") continue;
      // eslint-disable-next-line no-await-in-loop
      await sendOne(r);
    }
    setSendingAll(false);
  }

  const sentCount = Object.values(status).filter((s) => s === "sent").length;
  const failedCount = Object.values(status).filter((s) => s === "failed").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email {speakers.length} speaker{speakers.length === 1 ? "" : "s"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!connQuery.isLoading && !connected && (
            <div className="rounded-md border border-amber-300 bg-amber-50/70 px-3 py-3 text-sm text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Gmail isn't connected yet
              </div>
              <p className="text-xs">
                Connect your Google account in <strong>Connectors → Gmail</strong> to send emails
                directly from this app. Once connected, reopen this dialog.
              </p>
              <Button asChild size="sm" variant="outline">
                <a href="/connectors" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open Connectors
                </a>
              </Button>
            </div>
          )}

          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            Use <code className="bg-background px-1 py-0.5 rounded">{`{{firstName}}`}</code>{" "}
            as a merge tag. Each speaker gets a personalized email sent through your
            connected Gmail account.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Subject template</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:row-span-2">
              <Label className="text-xs">Body template</Label>
              <Textarea
                rows={9}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </div>

          {missingEmail > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              {missingEmail} selected speaker{missingEmail === 1 ? " has" : "s have"} no
              email on file and will be skipped.
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Personalized previews
              </div>
              <div className="text-xs text-muted-foreground">
                {sentCount} sent · {failedCount} failed
              </div>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {rows.map((r) => {
                const st = status[r.id] ?? "idle";
                const borderCls =
                  st === "sent"
                    ? "border-emerald-300 bg-emerald-50/50"
                    : st === "failed"
                      ? "border-red-300 bg-red-50/50"
                      : st === "sending"
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-card hover:border-primary/40";
                return (
                  <div
                    key={r.id}
                    className={`rounded-lg border p-3 transition-colors ${borderCls}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">
                          {r.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.email ?? (
                            <span className="text-amber-700">No email on file</span>
                          )}
                        </div>
                        <div className="mt-2 text-xs font-medium truncate">
                          {r.rSubject}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground whitespace-pre-line line-clamp-3">
                          {r.rBody}
                        </div>
                        {st === "failed" && errors[r.id] && (
                          <div className="mt-2 text-xs text-red-700">
                            {errors[r.id]}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {st === "sent" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Sent
                          </span>
                        ) : st === "failed" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-700 font-medium">
                            <XCircle className="h-3.5 w-3.5" /> Failed
                          </span>
                        ) : st === "sending" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending
                          </span>
                        ) : null}
                        <Button
                          size="sm"
                          variant={st === "sent" ? "outline" : "default"}
                          disabled={!r.email || !connected || st === "sending"}
                          onClick={() => sendOne(r)}
                        >
                          {st === "sent" ? "Resend" : "Send"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <div className="text-xs text-muted-foreground mr-auto">
            {sentCount} of {sendable.length} emails sent
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={sendAll}
            disabled={!connected || sendingAll || sendable.length === 0}
          >
            {sendingAll ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1.5" />
                Send all ({sendable.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
