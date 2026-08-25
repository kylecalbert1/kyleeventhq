import { useEffect, useMemo, useState } from "react";
import { Mail, AlertTriangle, CheckCircle2, XCircle, Loader2, Send, ExternalLink, Settings2 } from "lucide-react";
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
import { RichTextEmailEditor } from "@/components/RichTextEmailEditor";
import { toEmailHtml } from "@/lib/email-format";
import { logEmailSend, type TemplateType } from "@/lib/email-sends.functions";
import { emailTemplatesQuery, userSettingsQuery, eventTitoLinksQuery, eventQuery } from "@/lib/queries";
import { EmailTemplateManagerDialog } from "@/components/EmailTemplateManagerDialog";

// Sentinel for the "start from a blank slate" option, since real template
// IDs are UUIDs and won't collide with this value.
const CUSTOM_TEMPLATE_ID = "__custom__";

const CUSTOM_DEFAULT_SUBJECT = "Quick ask for {{firstName}} - event assets";
const CUSTOM_DEFAULT_BODY =
  "Hi {{firstName}},<br/><br/>Hope you're doing well! Could you send over your logo, headshot and short bio when you get a moment? It helps us finalise everything for the event.<br/><br/>Thanks so much!";


type Speaker = {
  id: string;
  name: string;
  email?: string | null;
  company?: string | null;
  title?: string | null;
  session_title?: string | null;
};

type SendStatus = "idle" | "sending" | "sent" | "failed" | "skipped";

/**
 * `initialTemplate` was historically one of a small hardcoded set of keys
 * (custom / confirmation / banner_reminder / ...). Now that templates live
 * in the `email_templates` table, it can also be a template slug from the
 * DB. We still accept a string for backward compatibility with call sites
 * that pass legacy keys.
 */
export function BulkEmailDialog({
  open,
  onOpenChange,
  speakers,
  initialTemplate,
  eventId,
  perRecipientDrafts,
  excludedRecipients,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  speakers: Speaker[];
  initialTemplate?: string;
  eventId?: string | null;
  /**
   * Optional per-recipient AI-generated overrides keyed by speaker id.
   * When present, the recipient's rSubject/rBody use these instead of the
   * shared template - used by the Tito "Draft outreach" flow so each person
   * gets a personalized draft that can still be reviewed & sent through the
   * app's Gmail integration.
   */
  perRecipientDrafts?: Record<string, { subject: string; body: string }>;
  /**
   * People the caller dropped from the selection before opening the dialog
   * (e.g. Tito ticket-type exclusions). Surfaced as an expandable notice so
   * the removal is never invisible, but never blocks the send.
   */
  excludedRecipients?: { id: string; name: string; email: string | null; reason?: string | null }[];
}) {

  const templatesQ = useQuery(emailTemplatesQuery);
  const settingsQ = useQuery(userSettingsQuery);
  const signatureHtml = (settingsQ.data?.email_signature_html ?? "").trim();
  const templates = templatesQ.data ?? [];

  const [templateId, setTemplateId] = useState<string>(CUSTOM_TEMPLATE_ID);
  const [subject, setSubject] = useState(CUSTOM_DEFAULT_SUBJECT);
  const [body, setBody] = useState(CUSTOM_DEFAULT_BODY);
  const [confirmOne, setConfirmOne] = useState<
    (ConfirmDraft & { id: string }) | null
  >(null);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [status, setStatus] = useState<Record<string, SendStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [optedIn, setOptedIn] = useState<Record<string, boolean>>({});
  const [sendingAll, setSendingAll] = useState(false);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const logSend = useServerFn(logEmailSend);
  const qcInvalidate = useQueryClient();

  // Seed subject/body when the dialog opens or the templates list arrives.
  // `initialTemplate` may be either a legacy key or a DB slug; match on slug
  // first, then fall back to the blank/custom state.
  useEffect(() => {
    if (!open || !templates.length) return;
    if (initialTemplate) {
      const match = templates.find((t) => t.slug === initialTemplate);
      if (match) {
        applyTemplate(match.id);
        return;
      }
    }
    if (templateId === CUSTOM_TEMPLATE_ID) {
      // Nothing to do - keep whatever the user is editing.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTemplate, templates.length]);

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


  function applyTemplate(id: string) {
    if (id === CUSTOM_TEMPLATE_ID) {
      setTemplateId(CUSTOM_TEMPLATE_ID);
      setSubject(CUSTOM_DEFAULT_SUBJECT);
      setBody(CUSTOM_DEFAULT_BODY);
      return;
    }
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTemplateId(id);
    setSubject(t.subject);
    // Coerce stored plain-text (with `\n` and `**bold**`) into HTML so the
    // rich-text editor and the eventual Gmail send both render correctly.
    setBody(toEmailHtml(t.body));
  }

  // Log-friendly slug: DB slug when available, otherwise "custom".
  const activeTemplateSlug: TemplateType = (() => {
    const t = templates.find((x) => x.id === templateId);
    return (t?.slug ?? "custom") as TemplateType;
  })();

  const send = useServerFn(sendGmailEmail);
  const checkConn = useServerFn(checkGmailConnected);
  const connQuery = useQuery({
    queryKey: ["gmail-connected"],
    queryFn: () => checkConn(),
  });
  const connected = connQuery.data?.connected ?? false;

  // Load Tito registration links so templates can reference {{speaker_pass_link}}
  // and {{guest_pass_link}} without the user hunting them down manually.
  const titoLinksQ = useQuery({
    ...eventTitoLinksQuery(eventId ?? ""),
    enabled: !!eventId,
  });
  const speakerPassLink = titoLinksQ.data?.speaker_pass_link ?? "";
  const guestPassLink = titoLinksQ.data?.guest_pass_link ?? "";

  // Event details so DB templates' {{event_name}} / {{event_date}} / {{venue}}
  // resolve exactly like they do in SendMessageDialog.
  const evQ = useQuery({ ...eventQuery(eventId ?? ""), enabled: !!eventId });
  const eventName = evQ.data?.name ?? "";
  const eventDate = evQ.data?.event_date
    ? new Date(evQ.data.event_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  const venue = evQ.data?.venue ?? "";
  const salesContactName = evQ.data?.sales_contact_name ?? "";
  const salesContactEmail = evQ.data?.sales_contact_email ?? "";
  const salesContactBookingLink = evQ.data?.sales_contact_booking_link ?? "";

  const rows = useMemo(() => {
    return speakers.map((s) => {
      const firstName = firstNameOf(s.name, s.email);
      const vars = {
        // camelCase kept for the built-in Custom / blank template
        firstName,
        name: s.name,
        // snake_case keys used by saved DB templates
        first_name: firstName,
        job_title: s.title ?? "",
        session_title: s.session_title ?? "",
        event_name: eventName,
        event_date: eventDate,
        venue,
        company: s.company ?? "",
        speaker_pass_link: speakerPassLink,
        guest_pass_link: guestPassLink,
        sales_contact_name: salesContactName,
        sales_contact_email: salesContactEmail,
        sales_contact_booking_link: salesContactBookingLink,
      };
      const override = perRecipientDrafts?.[s.id];
      return {
        ...s,
        firstName,
        rSubject: override?.subject ?? renderTemplate(subject, vars),
        rBody: override?.body ?? renderTemplate(body, vars),
        hasCustomDraft: !!override,
      };
    });
  }, [speakers, subject, body, perRecipientDrafts, speakerPassLink, guestPassLink, eventName, eventDate, venue, salesContactName, salesContactEmail, salesContactBookingLink]);

  const missingEmail = rows.filter((r) => !r.email).length;
  const sendable = rows.filter((r) => r.email);
  const activeRecipients = sendable.filter((r) => optedIn[r.id]);
  const optedOutCount = sendable.length - activeRecipients.length;

  type SendResult = {
    id: string;
    name: string;
    email: string;
    subject: string;
    body: string;
  } | null;

  async function performSend(
    r: (typeof rows)[number],
    override?: { subject: string; body: string },
    logIndividually = false,
  ): Promise<SendResult> {
    if (!r.email) {
      setStatus((s) => ({ ...s, [r.id]: "skipped" }));
      return null;
    }

    setStatus((s) => ({ ...s, [r.id]: "sending" }));
    try {
      // Every outbound message goes as HTML with `\n` → `<br/>` and any
      // stray `**bold**` promoted to real `<strong>` tags, plus the user's
      // saved signature. Without this, Gmail collapses the whole body to a
      // single paragraph and shows literal asterisks.
      const rawBody = override?.body ?? r.rBody;
      const bodyHtml = toEmailHtml(rawBody);
      const withSig = signatureHtml
        ? `${bodyHtml}<br/><br/>${signatureHtml}`
        : bodyHtml;
      const finalSubject = override?.subject ?? r.rSubject;
      await send({
        data: {
          to: r.email,
          subject: finalSubject,
          body: withSig,
          isHtml: true,
        },
      });
      setStatus((s) => ({ ...s, [r.id]: "sent" }));
      if (logIndividually) {
        // Single-recipient sends must land in email_sends too, otherwise
        // Send history only ever reflects "Review & send all" batches.
        try {
          await logSend({
            data: {
              event_id: eventId ?? null,
              template_type: activeTemplateSlug,
              subject: finalSubject,
              body: withSig,
              recipients: [{ speaker_id: r.id, email: r.email, name: r.name }],
            },
          });
          qcInvalidate.invalidateQueries({ queryKey: ["emailSends"] });
          qcInvalidate.invalidateQueries({ queryKey: ["speakerActivity"] });
        } catch (e) {
          console.error("Failed to log individual email send:", e);
        }
      }
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
      // No templateType here on purpose: ConfirmSendEmailDialog would log a
      // second row. performSend does the logging for this path.
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
            template_type: activeTemplateSlug,
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
  const excluded = excludedRecipients ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email {speakers.length} speaker{speakers.length === 1 ? "" : "s"}
          </DialogTitle>
        </DialogHeader>

        {excluded.length > 0 && (
          <details className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <summary className="cursor-pointer font-medium">
              {excluded.length} recipient{excluded.length === 1 ? "" : "s"} excluded by
              ticket type
            </summary>
            <ul className="mt-2 space-y-1">
              {excluded.map((r) => (
                <li key={r.id} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{r.name}</span>
                  {r.email && <span className="opacity-70">{r.email}</span>}
                  {r.reason && <span className="opacity-70">· {r.reason}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}

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

          {perRecipientDrafts ? (
            <div className="rounded-md border border-indigo-200 bg-indigo-50/60 p-3 text-xs text-indigo-900">
              Each recipient has an AI-generated personalized draft below. Review
              or edit any message via <b>Send</b> before it goes out. The shared
              template picker is disabled for this batch.
            </div>
          ) : (
            <>
              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                Use <code className="bg-background px-1 py-0.5 rounded">{`{{firstName}}`}</code>{" "}
                as a merge tag. Each speaker gets a personalized email sent through your
                connected Gmail account.
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Template</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setTemplateManagerOpen(true)}
                  >
                    <Settings2 className="h-3.5 w-3.5 mr-1" />
                    Manage templates
                  </Button>
                </div>
                <Select value={templateId} onValueChange={(v) => applyTemplate(v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Choose a template" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CUSTOM_TEMPLATE_ID}>Custom / blank</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Create, edit or delete saved templates with <b>Manage templates</b> - changes show up here straight away.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Subject template</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Body template</Label>
                  <RichTextEmailEditor value={body} onChange={setBody} minRows={10} />
                  <p className="text-[11px] text-muted-foreground">
                    Bold, italic and links are preserved when the email is sent. Use{" "}
                    <code className="bg-background px-1 py-0.5 rounded">{`{{firstName}}`}</code>{" "}
                    as a merge tag.
                  </p>
                </div>
              </div>
            </>
          )}

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
                        <div
                          className="mt-1 text-xs text-muted-foreground line-clamp-3 [&_a]:text-primary [&_a]:underline"
                          dangerouslySetInnerHTML={{ __html: toEmailHtml(r.rBody) }}
                        />
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
            disabled={!connected || sendingAll || activeRecipients.length === 0}
          >
            {sendingAll ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1.5" />
                Review &amp; send all ({activeRecipients.length})
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
          await performSend(row, { subject: subj, body: bd }, true);
          setConfirmOne(null);
        }}
      />

      <BulkConfirmSendDialog
        open={confirmAllOpen}
        onOpenChange={setConfirmAllOpen}
        rows={activeRecipients
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

      <EmailTemplateManagerDialog
        open={templateManagerOpen}
        onOpenChange={setTemplateManagerOpen}
      />
    </Dialog>
  );
}
