import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, X, Pencil, Mail } from "lucide-react";
import { RichTextEmailEditor } from "@/components/RichTextEmailEditor";
import { toEmailHtml } from "@/lib/email-format";
import {
  listDraftsForEvent,
  updateSpeakerDraft,
  discardSpeakerDraft,
  markSpeakerDraftSent,
} from "@/lib/speaker-drafts.functions";
import { sendGmailEmail } from "@/lib/email.functions";
import { logEmailSend } from "@/lib/email-sends.functions";
import { userSettingsQuery } from "@/lib/queries";

export function ConfirmationDraftsSection({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const settings = useQuery(userSettingsQuery);
  const drafts = useQuery({
    queryKey: ["speakerDrafts", eventId],
    queryFn: () => listDraftsForEvent({ data: { event_id: eventId } }),
  });
  const send = useServerFn(sendGmailEmail);
  const log = useServerFn(logEmailSend);
  const mark = useServerFn(markSpeakerDraftSent);
  const update = useServerFn(updateSpeakerDraft);
  const discard = useServerFn(discardSpeakerDraft);
  const [editing, setEditing] = useState<Record<string, { subject: string; body: string }>>({});

  const rows = drafts.data ?? [];
  if (!rows.length) return null;

  const signatureHtml = (settings.data?.email_signature_html ?? "").trim();

  async function handleSend(d: (typeof rows)[number]) {
    const local = editing[d.id];
    const subject = local?.subject ?? d.subject;
    const body = local?.body ?? d.body;
    const to = d.speakers.email;
    if (!to) return toast.error("Speaker has no email address");
    try {
      // Coerce plain-text drafts (with `\n` and `**bold**`) into real HTML
      // so Gmail renders line breaks and bold instead of running the whole
      // message together on one line.
      const bodyHtml = toEmailHtml(body);
      const withSig = signatureHtml
        ? `${bodyHtml}<br/><br/>${signatureHtml}`
        : bodyHtml;
      await send({ data: { to, subject, body: withSig, isHtml: true } });
      const res = await log({
        data: {
          event_id: eventId,
          template_type: "confirmation",
          subject,
          body: withSig,
          recipients: [{ speaker_id: d.speaker_id, email: to, name: d.speakers.name }],
        },
      });
      await mark({ data: { id: d.id, email_send_id: res.id } });
      toast.success(`Confirmation sent to ${d.speakers.name}`);
      await qc.invalidateQueries({ queryKey: ["speakerDrafts", eventId] });
      await qc.invalidateQueries({ queryKey: ["emailSends"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    }
  }

  async function handleDiscard(d: (typeof rows)[number]) {
    if (!confirm(`Discard confirmation draft for ${d.speakers.name}?`)) return;
    await discard({ data: { id: d.id } });
    await qc.invalidateQueries({ queryKey: ["speakerDrafts", eventId] });
  }

  async function handleSave(d: (typeof rows)[number]) {
    const local = editing[d.id];
    if (!local) return;
    await update({ data: { id: d.id, patch: local } });
    setEditing((s) => {
      const next = { ...s };
      delete next[d.id];
      return next;
    });
    await qc.invalidateQueries({ queryKey: ["speakerDrafts", eventId] });
    toast.success("Draft saved");
  }

  return (
    <Card className="p-5 border-amber-200 bg-amber-50/40">
      <div className="flex items-center gap-2 mb-3">
        <Mail className="h-4 w-4 text-amber-700" />
        <h3 className="font-semibold text-amber-900">
          Confirmation drafts ready to send ({rows.length})
        </h3>
      </div>
      <p className="text-xs text-amber-800/80 mb-4">
        These drafts were auto-generated when a speaker's status flipped to Confirmed. Review, edit
        if needed, then send manually — nothing goes out automatically.
      </p>
      <div className="space-y-3">
        {rows.map((d) => {
          const isEditing = !!editing[d.id];
          const subject = editing[d.id]?.subject ?? d.subject;
          const body = editing[d.id]?.body ?? d.body;
          const bodyForEditor = toEmailHtml(body);
          return (
            <div key={d.id} className="rounded-lg bg-white border border-amber-200 p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">
                    {d.speakers.name}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      &lt;{d.speakers.email ?? "no email"}&gt;
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {isEditing ? (
                    <Button size="sm" variant="outline" onClick={() => handleSave(d)}>
                      Save
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setEditing((s) => ({ ...s, [d.id]: { subject: d.subject, body: d.body } }))
                      }
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleSend(d)}
                    disabled={!d.speakers.email}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Send className="h-3.5 w-3.5 mr-1" />
                    Send
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDiscard(d)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {isEditing ? (
                <>
                  <Input
                    className="mb-2 text-sm"
                    value={subject}
                    onChange={(e) =>
                      setEditing((s) => ({ ...s, [d.id]: { subject: e.target.value, body } }))
                    }
                  />
                  <RichTextEmailEditor
                    value={bodyForEditor}
                    onChange={(html) =>
                      setEditing((s) => ({ ...s, [d.id]: { subject, body: html } }))
                    }
                    minRows={10}
                  />
                </>
              ) : (
                <>
                  <div className="text-sm font-medium text-slate-700 mb-1">{subject}</div>
                  <div
                    className="text-xs text-slate-600 max-h-64 overflow-y-auto [&_a]:text-primary [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: bodyForEditor }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
