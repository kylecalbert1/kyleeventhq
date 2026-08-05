import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Mail,
  Link2,
  ExternalLink,
  Pencil,
  Linkedin,
  CheckCircle2,
  AlertTriangle,
  Mic,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { SpeakerFormDialog } from "@/components/dialogs/SpeakerFormDialog";
import { ConfirmSendEmailDialog, type ConfirmDraft } from "@/components/ConfirmSendEmailDialog";
import { speakersQuery, eventsQuery } from "@/lib/queries";
import { labels, pillClass, type OutreachChannel } from "@/lib/status";
import { firstNameOf } from "@/lib/gmail";
import { sendGmailEmail } from "@/lib/email.functions";
import { logEmailSend } from "@/lib/email-sends.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/speakers/$speakerId")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(speakersQuery()),
      context.queryClient.ensureQueryData(eventsQuery),
    ]),
  component: SpeakerProfile,
});

function bhDone(s: any): boolean {
  if (typeof s?.bio_and_headshot_received === "boolean") return s.bio_and_headshot_received;
  return !!(s?.bio_received && s?.headshot_received);
}

function stageOf(s: any): { label: string; cls: string } {
  if (bhDone(s))
    return { label: "Bio/Headshot In", cls: "bg-teal-600 text-white ring-teal-600" };
  if (s.banner_status === "sent" || s.banner_status === "confirmed_live")
    return { label: "Banner Sent", cls: "bg-amber-500 text-white ring-amber-500" };
  if (s.status === "confirmed")
    return { label: "Confirmed", cls: "bg-emerald-600 text-white ring-emerald-600" };
  if (s.status === "responded")
    return {
      label: "Responded",
      cls: "border border-violet-400 text-violet-700 bg-violet-50/60",
    };
  return {
    label: "Contacted",
    cls: "border border-sky-400 text-sky-700 bg-sky-50/60",
  };
}

function SpeakerProfile() {
  const { speakerId } = Route.useParams();
  const router = useRouter();
  const speakers = useQuery(speakersQuery());
  const events = useQuery(eventsQuery);
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState<ConfirmDraft | null>(null);
  const sendEmail = useServerFn(sendGmailEmail);
  const logSend = useServerFn(logEmailSend);

  const speaker = useMemo(
    () => (speakers.data ?? []).find((s: any) => s.id === speakerId),
    [speakers.data, speakerId],
  );
  const event = useMemo(
    () =>
      speaker
        ? (events.data ?? []).find((e) => e.id === speaker.event_id)
        : undefined,
    [events.data, speaker],
  );

  if (speakers.isLoading) {
    return (
      <div className="p-6 md:p-8 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-6" />
        <div className="h-48 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!speaker) {
    return (
      <div className="p-6 md:p-8">
        <div className="max-w-md mx-auto text-center py-16">
          <User className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h1 className="text-lg font-semibold">Speaker not found</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This speaker may have been removed.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/speakers">Back to pipeline</Link>
          </Button>
        </div>
      </div>
    );
  }

  const stage = stageOf(speaker);
  const firstName = firstNameOf(speaker.name, speaker.email);

  const initials = speaker.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p: string) => p[0])
    .join("")
    .toUpperCase();

  function emailSpeaker() {
    if (!speaker || !speaker.email) {
      toast.error("No email on file");
      return;
    }
    const code = event?.code ?? "our event";
    setConfirmEmail({
      to: speaker.email,
      recipientName: firstName,
      subject: `${code} - quick check-in`,
      body: `Hi ${firstName},\n\nJust following up on your session for ${code}. Let me know if you need anything from us - happy to help move things forward.\n\nThanks!`,
      // Logged explicitly in performSendConfirmed so failures aren't recorded.
      eventId: speaker.event_id ?? null,
      speakerId: speaker.id,
    });
  }

  async function performSendConfirmed(edited: { subject: string; body: string }) {
    if (!confirmEmail) return;
    const label = confirmEmail.recipientName ?? confirmEmail.to;
    const t = toast.loading(`Sending email to ${label}…`);
    setSending(true);
    try {
      await sendEmail({
        data: { to: confirmEmail.to, subject: edited.subject, body: edited.body },
      });
      toast.success(`Sent to ${label}`, { id: t });
      try {
        await logSend({
          data: {
            event_id: confirmEmail.eventId ?? null,
            template_type: "custom",
            subject: edited.subject,
            body: edited.body,
            recipients: [
              {
                speaker_id: confirmEmail.speakerId ?? null,
                email: confirmEmail.to,
                name: confirmEmail.recipientName ?? null,
              },
            ],
          },
        });
        qc.invalidateQueries({ queryKey: ["emailSends"] });
        qc.invalidateQueries({ queryKey: ["speakerActivity"] });
      } catch (err) {
        console.error("Failed to log email send:", err);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send", { id: t });
    } finally {
      setSending(false);
    }
  }

  async function copyLink() {
    if (!speaker) return;
    const url = speaker.dropbox_link || speaker.linkedin_url;
    if (!url) {
      toast.error("No link stored for this speaker");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy");
    }
  }

  return (
    <div className="p-6 md:p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.history.back()}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={emailSpeaker}>
            <Mail className="h-4 w-4 mr-1.5" />
            Email
          </Button>
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hero card */}
        <Card className="lg:col-span-2 p-6 md:p-8 overflow-hidden relative">
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-start gap-6">
            <div className="h-24 w-24 shrink-0 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-2 ring-background flex items-center justify-center text-2xl font-bold text-primary shadow-sm">
              {initials || <User className="h-10 w-10" />}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight">
                {speaker.name}
              </h1>
              {(speaker.title || speaker.company) && (
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                  {speaker.title && <span>{speaker.title}</span>}
                  {speaker.title && speaker.company && (
                    <span className="opacity-40">·</span>
                  )}
                  {speaker.company && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 opacity-70" />
                      {speaker.company}
                    </span>
                  )}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-4">
                <StatusPill className={stage.cls}>{stage.label}</StatusPill>
                {event && (
                  <StatusPill className="border border-slate-300 text-slate-700 bg-white">
                    {event.code}
                  </StatusPill>
                )}
                {speaker.outreach_channel && (
                  <StatusPill
                    className={
                      pillClass.outreachChannel[
                        speaker.outreach_channel as OutreachChannel
                      ]
                    }
                  >
                    {
                      labels.outreachChannel[
                        speaker.outreach_channel as OutreachChannel
                      ]
                    }
                  </StatusPill>
                )}
                {speaker.session_format && (
                  <StatusPill className="border border-indigo-300 text-indigo-700 bg-indigo-50/60">
                    <Mic className="h-3 w-3" />
                    {labels.sessionFormat[speaker.session_format as never]}
                  </StatusPill>
                )}
              </div>
            </div>
          </div>

          {speaker.session_title && (
            <div className="mt-8 pt-6 border-t">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                Session
              </div>
              <div className="text-lg font-medium leading-snug">
                {speaker.session_title}
              </div>
            </div>
          )}

          <div className="mt-6 pt-6 border-t">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Bio
            </div>
            {speaker.notes ? (
              <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                {speaker.notes}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No bio on file yet.
              </p>
            )}
          </div>
        </Card>

        {/* Side rail */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Assets
            </div>
            <div className="space-y-2">
              <AssetRow ok={bhDone(speaker)} label="Bio & headshot" />
              <AssetRow
                ok={speaker.linkedin_post_confirmed}
                label="LinkedIn post confirmed"
              />
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Contact & links
            </div>
            <div className="space-y-2 text-sm">
              {speaker.email ? (
                <button
                  type="button"
                  onClick={emailSpeaker}
                  disabled={sending}
                  className="flex items-center gap-2 w-full text-left rounded-md px-2 py-1.5 -mx-2 hover:bg-accent transition-colors group disabled:opacity-60"
                >
                  <Mail className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                  <span className="truncate flex-1">{speaker.email}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground opacity-0 group-hover:opacity-80 transition-opacity">
                    {sending ? "Sending…" : "Send"}
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground text-xs px-2 py-1.5 -mx-2">
                  <Mail className="h-4 w-4" />
                  No email on file
                </div>
              )}
              {speaker.linkedin_url && (
                <a
                  href={speaker.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-accent transition-colors group"
                >
                  <Linkedin className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                  <span className="truncate flex-1">LinkedIn profile</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                </a>
              )}
              {speaker.dropbox_link && (
                <a
                  href={speaker.dropbox_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-accent transition-colors group"
                >
                  <Link2 className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                  <span className="truncate flex-1">Dropbox / assets</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                </a>
              )}
              {(speaker.linkedin_url || speaker.dropbox_link) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={copyLink}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  Copy link
                </Button>
              )}
            </div>
          </Card>

          {event && (
            <Card className="p-5">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Event
              </div>
              <Link
                to="/events/$eventId"
                params={{ eventId: event.id }}
                className="block group"
              >
                <div className="font-semibold text-sm group-hover:text-primary transition-colors">
                  {event.code}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {event.name}
                </div>
              </Link>
            </Card>
          )}
        </div>
      </div>

      {editing && (
        <SpeakerFormDialog
          open={editing}
          onOpenChange={setEditing}
          speaker={speaker}
        />
      )}
      <ConfirmSendEmailDialog
        open={!!confirmEmail}
        onOpenChange={(o) => !o && setConfirmEmail(null)}
        draft={confirmEmail}
        onConfirm={performSendConfirmed}
      />
    </div>
  );
}

function AssetRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={`flex items-center gap-2 text-sm rounded-md px-2 py-1.5 -mx-2 ${
        ok ? "text-emerald-800" : "text-orange-800"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-orange-500" />
      )}
      <span className="flex-1">{label}</span>
      <span className="text-xs font-medium">
        {ok ? "Received" : "Missing"}
      </span>
    </div>
  );
}
