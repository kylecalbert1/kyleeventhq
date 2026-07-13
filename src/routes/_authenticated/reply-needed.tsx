import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { z } from "zod";
import {
  Reply,
  Clock,
  MessageSquare,
  Mail,
  Eye,
  Inbox as InboxIcon,
  CheckCircle2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import { SpeakerDetailDialog } from "@/components/dialogs/SpeakerDetailDialog";
import {
  ConfirmSendEmailDialog,
  type ConfirmDraft,
} from "@/components/ConfirmSendEmailDialog";
import { speakersQuery, eventsQuery } from "@/lib/queries";
import { sendGmailEmail } from "@/lib/email.functions";
import { markSpeakerReplied } from "@/lib/speakers.functions";
import { firstNameOf, initialsOf, gmailThreadUrl, openGmailThread } from "@/lib/gmail";
import { daysBetween, pillClass, labels, type SpeakerStatus } from "@/lib/status";
import { outreachAlert, avatarGradient, columnFor } from "@/components/speakers/SpeakerListCard";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  filter: z.enum(["reply", "follow_up", "both"]).optional(),
  event: z.string().optional(),
  line: z.enum(["all", "AIAI", "CSC"]).optional(),
});

export const Route = createFileRoute("/_authenticated/reply-needed")({
  validateSearch: searchSchema,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(speakersQuery()),
      context.queryClient.ensureQueryData(eventsQuery),
    ]),
  component: ReplyNeededPage,
});

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ReplyNeededPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const speakers = useQuery(speakersQuery());
  const events = useQuery(eventsQuery);
  const sendEmail = useServerFn(sendGmailEmail);
  const markReplied = useServerFn(markSpeakerReplied);
  const qc = useQueryClient();
  const markMutation = useMutation({
    mutationFn: (id: string) => markReplied({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["speakers"] });
      qc.invalidateQueries({ queryKey: ["eventSummaries"] });
      toast.success("Marked as replied");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [filter, setFilter] = useState<"reply" | "follow_up" | "both">(
    search.filter ?? "both",
  );
  const [eventFilter, setEventFilter] = useState<string>(search.event ?? "all");
  const [lineFilter, setLineFilter] = useState<"all" | "AIAI" | "CSC">(
    search.line ?? "all",
  );
  const [detailSpeaker, setDetailSpeaker] = useState<any | null>(null);
  const [confirmEmail, setConfirmEmail] = useState<ConfirmDraft | null>(null);

  const eventById = useMemo(
    () => Object.fromEntries((events.data ?? []).map((e: any) => [e.id, e])),
    [events.data],
  );

  const rows = useMemo(() => {
    const all = (speakers.data ?? []) as any[];
    const now = new Date();
    const withAlert = all
      .map((s) => ({ s, a: outreachAlert(s) }))
      .filter(({ a }) => a && (a.type === "reply" || a.type === "follow_up"));

    const filtered = withAlert.filter(({ s, a }) => {
      if (filter !== "both" && a!.type !== filter) return false;
      if (eventFilter !== "all" && s.event_id !== eventFilter) return false;
      if (lineFilter !== "all") {
        const ev = eventById[s.event_id];
        if (ev?.business_line !== lineFilter) return false;
      }
      return true;
    });

    filtered.sort((x, y) => {
      const tx = x.s.last_message_at ? new Date(x.s.last_message_at).getTime() : 0;
      const ty = y.s.last_message_at ? new Date(y.s.last_message_at).getTime() : 0;
      return tx - ty; // stalest first
    });
    return filtered.map(({ s, a }) => ({
      s,
      a: a!,
      days: s.last_message_at
        ? daysBetween(new Date(s.last_message_at), now)
        : null,
    }));
  }, [speakers.data, filter, eventFilter, lineFilter, eventById]);

  const counts = useMemo(() => {
    const all = (speakers.data ?? []) as any[];
    let reply = 0,
      follow = 0;
    for (const s of all) {
      const a = outreachAlert(s);
      if (!a) continue;
      if (a.type === "reply") reply++;
      else if (a.type === "follow_up") follow++;
    }
    return { reply, follow, both: reply + follow };
  }, [speakers.data]);

  function updateFilter(next: "reply" | "follow_up" | "both") {
    setFilter(next);
    navigate({
      to: "/reply-needed",
      search: {
        ...(next === "both" ? {} : { filter: next }),
        ...(eventFilter !== "all" ? { event: eventFilter } : {}),
        ...(lineFilter !== "all" ? { line: lineFilter } : {}),
      },
      replace: true,
    });
  }

  function emailOne(s: any) {
    if (!s.email) {
      toast.error("No email on file");
      return;
    }
    const ev = eventById[s.event_id];
    const firstName = firstNameOf(s.name);
    const code = ev?.code ?? "our upcoming event";
    setConfirmEmail({
      to: s.email,
      recipientName: firstName,
      subject: `${code} — quick check-in`,
      body: `Hi ${firstName},\n\nJust following up on your session for ${code}. Let me know if you need anything from us — happy to help move things forward.\n\nThanks!`,
      templateType: "custom",
      eventId: s.event_id ?? null,
      speakerId: s.id,
    });
  }

  async function performSendConfirmed(edited: { subject: string; body: string }) {
    if (!confirmEmail) return;
    const t = toast.loading(
      `Sending email to ${confirmEmail.recipientName ?? confirmEmail.to}…`,
    );
    try {
      await sendEmail({
        data: { to: confirmEmail.to, subject: edited.subject, body: edited.body },
      });
      toast.success(`Sent to ${confirmEmail.recipientName ?? confirmEmail.to}`, {
        id: t,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send", { id: t });
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <InboxIcon className="h-6 w-6 text-indigo-600" />
            Reply Needed
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Speakers awaiting a reply or follow-up, stalest first. Same data as
            the dashboard SLA cards.
          </p>
        </div>
      </header>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <Button
            size="sm"
            variant={filter === "both" ? "default" : "ghost"}
            onClick={() => updateFilter("both")}
          >
            Both ({counts.both})
          </Button>
          <Button
            size="sm"
            variant={filter === "reply" ? "default" : "ghost"}
            onClick={() => updateFilter("reply")}
            className={filter === "reply" ? "" : "text-rose-700"}
          >
            <Reply className="h-3.5 w-3.5 mr-1.5" />
            Reply needed ({counts.reply})
          </Button>
          <Button
            size="sm"
            variant={filter === "follow_up" ? "default" : "ghost"}
            onClick={() => updateFilter("follow_up")}
            className={filter === "follow_up" ? "" : "text-amber-800"}
          >
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            Follow-up ({counts.follow})
          </Button>
        </div>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {(events.data ?? []).map((e: any) => (
              <SelectItem key={e.id} value={e.id}>
                {e.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={lineFilter}
          onValueChange={(v) => setLineFilter(v as "all" | "AIAI" | "CSC")}
        >
          <SelectTrigger className="w-32 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lines</SelectItem>
            <SelectItem value="AIAI">AIAI</SelectItem>
            <SelectItem value="CSC">CSC</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-emerald-500" />
          <p className="text-sm text-muted-foreground">
            You're all caught up — no speakers need a reply or follow-up.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map(({ s, a, days }) => {
            const ev = eventById[s.event_id];
            const colKey = columnFor(s);
            const statusLabel =
              labels.speaker[s.status as SpeakerStatus] ?? s.status;
            return (
              <Card key={s.id} className="p-4">
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[13px] font-bold text-white shadow-sm bg-gradient-to-br",
                      avatarGradient[colKey],
                    )}
                  >
                    {initialsOf(s.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setDetailSpeaker(s)}
                          className="text-left text-base font-semibold text-slate-900 hover:text-indigo-700 transition-colors"
                        >
                          {s.name}
                        </button>
                        {s.company && (
                          <div className="text-sm text-slate-500 truncate">
                            {s.company}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ev?.code && (
                          <StatusPill className="bg-indigo-50 text-indigo-700 ring-indigo-200 text-[11px]">
                            {ev.code}
                          </StatusPill>
                        )}
                        <StatusPill
                          className={cn(
                            pillClass.speaker[s.status as SpeakerStatus],
                            "text-[11px]",
                          )}
                        >
                          {statusLabel}
                        </StatusPill>
                        <StatusPill
                          className={cn(a.cls, "text-[11px] font-semibold")}
                        >
                          {a.icon && <a.icon className="h-3 w-3" />}
                          {a.label}
                        </StatusPill>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-500">
                      Last outreach: {fmt(s.last_message_at)}
                      {s.last_message_direction
                        ? ` (${s.last_message_direction})`
                        : ""}
                      {days !== null && (
                        <span className="ml-1 text-slate-400">
                          · {days}d ago
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {s.gmail_thread_id && (
                        <a
                          href={gmailThreadUrl(s.gmail_thread_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openGmailThread(s.gmail_thread_id);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 ring-1 ring-rose-200 transition-colors"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Open thread
                        </a>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => emailOne(s)}
                        disabled={!s.email}
                      >
                        <Mail className="h-3.5 w-3.5 mr-1.5" />
                        Send email
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDetailSpeaker(s)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        View details
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <SpeakerDetailDialog
        open={!!detailSpeaker}
        onOpenChange={(o) => !o && setDetailSpeaker(null)}
        speaker={detailSpeaker}
        event={detailSpeaker ? eventById[detailSpeaker.event_id] : null}
        onEdit={() => setDetailSpeaker(null)}
        onEmail={() => {
          const s = detailSpeaker;
          if (s) emailOne(s);
        }}
      />

      <ConfirmSendEmailDialog
        open={!!confirmEmail}
        draft={confirmEmail}
        onOpenChange={(o) => !o && setConfirmEmail(null)}
        onConfirm={performSendConfirmed}
      />
    </div>
  );
}
