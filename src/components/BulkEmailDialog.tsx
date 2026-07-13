import { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { renderTemplate, firstNameOf } from "@/lib/gmail";
import { sendGmailEmail, checkGmailConnected } from "@/lib/email.functions";
import { ConfirmSendEmailDialog, type ConfirmDraft } from "@/components/ConfirmSendEmailDialog";
import { BulkConfirmSendDialog } from "@/components/BulkConfirmSendDialog";
import { logEmailSend } from "@/lib/email-sends.functions";

type TemplateKey =
  | "custom"
  | "confirmation"
  | "banner_reminder"
  | "bio_headshot_reminder"
  | "follow_up";

const TEMPLATES: Record<
  TemplateKey,
  { label: string; subject: string; body: string }
> = {
  custom: {
    label: "Custom / blank",
    subject: "Quick ask for {{firstName}} — event assets",
    body:
      "Hey {{firstName}},\n\nHope you're doing well! Could you send over your logo, headshot and short bio when you get a moment? It helps us finalise everything for the event.\n\nThanks so much!",
  },
  confirmation: {
    label: "Speaker confirmation",
    subject: "Confirming your session, {{firstName}} 🎉",
    body:
      "Hi {{firstName}},\n\nDelighted to confirm your session with us. We'll be in touch shortly with logistics, banner artwork and everything else you need.\n\nLet me know if any questions in the meantime.\n\nThanks!",
  },
  banner_reminder: {
    label: "Banner request reminder",
    subject: "Quick nudge on your speaker banner",
    body:
      "Hi {{firstName}},\n\nJust a quick nudge — our design team is putting speaker banners together this week. Could you confirm the title / description on your session is still accurate so we can lock it in?\n\nThanks!",
  },
  bio_headshot_reminder: {
    label: "Bio & headshot reminder",
    subject: "Sending over your bio & headshot?",
    body:
      "Hi {{firstName}},\n\nWhenever you get a minute, could you send over a short speaker bio (2–3 sentences) and a high-res headshot? We'll use them on the site and in promo.\n\nMuch appreciated!",
  },
  follow_up: {
    label: "Follow-up — no reply",
    subject: "Circling back, {{firstName}}",
    body:
      "Hi {{firstName}},\n\nJust circling back on my last note — happy to jump on a quick call if easier, otherwise a quick reply here works too. Would love to lock this in.\n\nThanks!",
  },
};

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
  initialTemplate,
  eventId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  speakers: Speaker[];
  initialTemplate?: TemplateKey;
  eventId?: string | null;
}) {
  const [templateKey, setTemplateKey] = useState<TemplateKey>(initialTemplate ?? "custom");
  const [subject, setSubject] = useState(TEMPLATES[initialTemplate ?? "custom"].subject);
  const [body, setBody] = useState(TEMPLATES[initialTemplate ?? "custom"].body);
  const [confirmOne, setConfirmOne] = useState<
    (ConfirmDraft & { id: string }) | null
  >(null);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [status, setStatus] = useState<Record<string, SendStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [optedIn, setOptedIn] = useState<Record<string, boolean>>({});
  const [sendingAll, setSendingAll] = useState(false);
  const logSend = useServerFn(logEmailSend);
  const qcInvalidate = useQueryClient();

  useEffect(() => {
    if (open && initialTemplate) {
      setTemplateKey(initialTemplate);
      setSubject(TEMPLATES[initialTemplate].subject);
      setBody(TEMPLATES[initialTemplate].body);
    }
  }, [open, initialTemplate]);

  // Every time the recipient list changes (dialog reopens with a new selection),
  // default every recipient with an email to opted-in.
  useEffect(() => {
    if (!open) return;
    setOptedIn((prev) => {
      const next: Record<string, boolean> = {};
      for (const s of speakers) {
        if (!s.email) continue;
        next[s.id] = prev[s.id] ?? true;
      }
      return next;
    });
  }, [open, speakers]);


  function applyTemplate(k: TemplateKey) {
    setTemplateKey(k);
    setSubject(TEMPLATES[k].subject);
    setBody(TEMPLATES[k].body);
  }

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
  const activeRecipients = sendable.filter((r) => optedIn[r.id]);
  const optedOutCount = sendable.length - activeRecipients.length;

  async function performSend(
    r: (typeof rows)[number],
    override?: { subject: string; body: string },
  ) {
    if (!r.email) {
      setStatus((s) => ({ ...s, [r.id]: "skipped" }));
      return;
    }
    setStatus((s) => ({ ...s, [r.id]: "sending" }));
    try {
      await send({
        data: {
          to: r.email,
          subject: override?.subject ?? r.rSubject,
          body: override?.body ?? r.rBody,
        },
      });
      setStatus((s) => ({ ...s, [r.id]: "sent" }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setErrors((x) => ({ ...x, [r.id]: msg }));
      setStatus((s) => ({ ...s, [r.id]: "failed" }));
    }
  }

  function requestSendOne(r: (typeof rows)[number]) {
    if (!r.email) return;
    setConfirmOne({
      id: r.id,
      to: r.email,
      subject: r.rSubject,
      body: r.rBody,
      recipientName: r.name,
      templateType: templateKey,
      eventId: eventId ?? null,
      speakerId: r.id,
    });
  }

  async function performSendAll() {
    setSendingAll(true);
    const toSend = activeRecipients;
    for (const r of toSend) {
      if (status[r.id] === "sent") continue;
      // eslint-disable-next-line no-await-in-loop
      await performSend(r);
    }
    setSendingAll(false);
    // After the loop, gather everyone from this batch currently marked sent
    // and log one batch.
    setStatus((currentStatus) => {
      const sentRecipients = toSend
        .filter((r) => currentStatus[r.id] === "sent")
        .map((r) => ({ id: r.id, name: r.name, email: r.email! }));
      if (sentRecipients.length > 0) {
        logSend({
          data: {
            event_id: eventId ?? null,
            template_type: templateKey,
            subject,
            body,
            recipients: sentRecipients.map((r) => ({
              speaker_id: r.id,
              email: r.email,
              name: r.name,
            })),
          },
        })
          .then(() => {
            qcInvalidate.invalidateQueries({ queryKey: ["emailSends"] });
            qcInvalidate.invalidateQueries({ queryKey: ["speakerActivity"] });
          })
          .catch((e) => console.error("Failed to log batch email send:", e));
      }
      return currentStatus;
    });
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

          <div className="space-y-1.5">
            <Label className="text-xs">Template</Label>
            <Select value={templateKey} onValueChange={(v) => applyTemplate(v as TemplateKey)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TEMPLATES) as TemplateKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{TEMPLATES[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Picking a template pre-fills subject & body. Edits below stay local until you switch templates again.
            </p>
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

          {sendable.length === 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50/70 px-3 py-2.5 text-sm text-rose-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Current filters match 0 recipients.</div>
                <div className="text-xs opacity-90">Adjust your selection above before sending.</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-900">
              <span className="font-semibold tabular-nums">{activeRecipients.length}</span>
              of {sendable.length} recipient{sendable.length === 1 ? "" : "s"} will receive this email
              {optedOutCount > 0 && (
                <span className="text-slate-600">
                  {" "}
                  · {optedOutCount} unticked
                </span>
              )}
              {missingEmail > 0 && (
                <span className="text-amber-800">
                  {" "}
                  · {missingEmail} skipped (no email)
                </span>
              )}
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
                const isOptedIn = !!r.email && !!optedIn[r.id];
                const borderCls =
                  st === "sent"
                    ? "border-emerald-300 bg-emerald-50/50"
                    : st === "failed"
                      ? "border-red-300 bg-red-50/50"
                      : st === "sending"
                        ? "border-primary/50 bg-primary/5"
                        : !isOptedIn && r.email
                          ? "border-slate-200 bg-slate-50/60 opacity-60"
                          : "border-border bg-card hover:border-primary/40";
                return (
                  <div
                    key={r.id}
                    className={`rounded-lg border p-3 transition-colors ${borderCls}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5 shrink-0">
                        <Checkbox
                          checked={isOptedIn}
                          disabled={!r.email || st === "sending"}
                          onCheckedChange={(v) =>
                            setOptedIn((prev) => ({ ...prev, [r.id]: !!v }))
                          }
                          aria-label={`Include ${r.name} in send-all`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{r.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.email ?? (
                            <span className="text-amber-700">No email on file</span>
                          )}
                          {r.email && !isOptedIn && (
                            <span className="ml-2 text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                              Excluded
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-xs font-medium truncate">{r.rSubject}</div>
                        <div className="mt-1 text-xs text-muted-foreground whitespace-pre-line line-clamp-3">
                          {r.rBody}
                        </div>
                        {st === "failed" && errors[r.id] && (
                          <div className="mt-2 text-xs text-red-700">{errors[r.id]}</div>
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
                          onClick={() => requestSendOne(r)}
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
            onClick={() => setConfirmAllOpen(true)}
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
                Review &amp; send all ({sendable.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ConfirmSendEmailDialog
        open={!!confirmOne}
        onOpenChange={(o) => !o && setConfirmOne(null)}
        draft={confirmOne}
        onConfirm={async ({ subject: subj, body: bd }) => {
          if (!confirmOne) return;
          const row = rows.find((x) => x.id === confirmOne.id);
          if (!row) return;
          await performSend(row, { subject: subj, body: bd });
          setConfirmOne(null);
        }}
      />

      <BulkConfirmSendDialog
        open={confirmAllOpen}
        onOpenChange={setConfirmAllOpen}
        rows={sendable
          .filter((r) => status[r.id] !== "sent")
          .map((r) => ({
            id: r.id,
            name: r.name,
            to: r.email!,
            subject: r.rSubject,
            body: r.rBody,
          }))}
        onConfirm={performSendAll}
      />
    </Dialog>
  );
}
