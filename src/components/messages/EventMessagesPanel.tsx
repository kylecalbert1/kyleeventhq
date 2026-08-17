import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Send, Settings2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  messageTemplatesQuery,
  messageSenderQuery,
  eventMessageSendsQuery,
} from "@/lib/queries";
import {
  markMessageSent,
  deleteMessageSend,
  type MessageTemplate,
} from "@/lib/message-templates.functions";
import {
  streamMeta,
  weeksSlotLabel,
  targetDateFor,
  statusFor,
  formatDateShort,
  type MessageEvent,
  type TimelineStatus,
} from "@/lib/message-render";
import { GenerateMessageDialog } from "./GenerateMessageDialog";

const statusChip: Record<TimelineStatus, { label: string; cls: string }> = {
  sent: { label: "Sent", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  due: { label: "Due now", cls: "bg-amber-100 text-amber-900 ring-amber-200" },
  overdue: { label: "Overdue", cls: "bg-red-100 text-red-800 ring-red-200" },
  upcoming: { label: "Upcoming", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  no_date: { label: "No event date", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
};

export function EventMessagesPanel({
  event,
  onEditEvent,
}: {
  event: MessageEvent;
  onEditEvent?: () => void;
}) {
  const qc = useQueryClient();
  const templates = useQuery(messageTemplatesQuery);
  const sender = useQuery(messageSenderQuery);
  const sends = useQuery(eventMessageSendsQuery(event.id));
  const [generating, setGenerating] = useState<MessageTemplate | null>(null);

  const markSent = useServerFn(markMessageSent);
  const unmark = useServerFn(deleteMessageSend);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["eventMessageSends", event.id] });

  const mark = useMutation({
    mutationFn: (v: { template_id: string; recipient_count: number | null }) =>
      markSent({ data: { event_id: event.id, ...v } }),
    onSuccess: () => {
      invalidate();
      toast.success("Logged as sent");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const undo = useMutation({
    mutationFn: (id: string) => unmark({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Send removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const sentByTemplate = useMemo(() => {
    const m = new Map<string, { id: string; sent_at: string; recipient_count: number | null }>();
    for (const s of sends.data ?? []) {
      if (!s.template_id) continue;
      const prev = m.get(s.template_id);
      if (!prev || new Date(s.sent_at) > new Date(prev.sent_at)) {
        m.set(s.template_id, {
          id: s.id,
          sent_at: s.sent_at,
          recipient_count: s.recipient_count,
        });
      }
    }
    return m;
  }, [sends.data]);

  const applicable = useMemo(() => {
    return (templates.data ?? []).filter(
      (t) =>
        (t.business_line === null || t.business_line === event.business_line) &&
        (t.event_format === null || t.event_format === event.format),
    );
  }, [templates.data, event.business_line, event.format]);

  const scheduled = useMemo(
    () =>
      applicable
        .filter((t) => t.weeks_out !== null)
        .sort(
          (a, b) =>
            (b.weeks_out ?? 0) - (a.weeks_out ?? 0) ||
            a.position - b.position ||
            a.name.localeCompare(b.name),
        ),
    [applicable],
  );
  const adhoc = useMemo(
    () => applicable.filter((t) => t.weeks_out === null),
    [applicable],
  );

  const firstName = sender.data?.firstName ?? "Team";

  return (
    <div className="surface-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Messages (Tito)</h2>
          <p className="text-xs text-muted-foreground">
            The full cadence for this event, with real dates. Generate the copy, paste it into
            Tito's Messages tab, then mark it as sent. Nothing is emailed from here.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/message-templates">
            <Settings2 className="mr-1.5 h-4 w-4" />
            Edit templates
          </Link>
        </Button>
      </div>

      {!event.event_date && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          Set an event date to see the schedule with real dates.
        </div>
      )}

      <div className="mt-4 divide-y divide-border rounded-xl border border-border">
        {scheduled.map((t) => {
          const target = targetDateFor(event.event_date, t.weeks_out);
          const sent = sentByTemplate.get(t.id) ?? null;
          const st = statusFor(target, sent?.sent_at ?? null);
          return (
            <Row
              key={t.id}
              template={t}
              target={target}
              status={st}
              sent={sent}
              onGenerate={() => setGenerating(t)}
              onMarkSent={(count) => mark.mutate({ template_id: t.id, recipient_count: count })}
              onUndo={() => sent && undo.mutate(sent.id)}
            />
          );
        })}
        {scheduled.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No scheduled templates match this event's business line and format.
          </div>
        )}
      </div>

      {adhoc.length > 0 && (
        <>
          <div className="mt-6 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Ad hoc / fire when needed
          </div>
          <div className="divide-y divide-border rounded-xl border border-border">
            {adhoc.map((t) => (
              <Row
                key={t.id}
                template={t}
                target={null}
                status={null}
                sent={sentByTemplate.get(t.id) ?? null}
                onGenerate={() => setGenerating(t)}
                onMarkSent={(count) => mark.mutate({ template_id: t.id, recipient_count: count })}
                onUndo={() => {
                  const s = sentByTemplate.get(t.id);
                  if (s) undo.mutate(s.id);
                }}
              />
            ))}
          </div>
        </>
      )}

      <GenerateMessageDialog
        open={Boolean(generating)}
        onOpenChange={(v) => !v && setGenerating(null)}
        template={generating}
        event={event}
        userFirstName={firstName}
        onEditEvent={onEditEvent}
      />
    </div>
  );
}

function Row({
  template,
  target,
  status,
  sent,
  onGenerate,
  onMarkSent,
  onUndo,
}: {
  template: MessageTemplate;
  target: Date | null;
  status: TimelineStatus | null;
  sent: { id: string; sent_at: string; recipient_count: number | null } | null;
  onGenerate: () => void;
  onMarkSent: (recipientCount: number | null) => void;
  onUndo: () => void;
}) {
  const [logging, setLogging] = useState(false);
  const [count, setCount] = useState("");
  const meta = streamMeta[template.stream];
  const chip = status ? statusChip[status] : null;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{template.name}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.chip}`}>
            {meta.label}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {weeksSlotLabel(template.weeks_out)}
          {target ? ` · ${formatDateShort(target)}` : ""}
          {sent
            ? ` · Sent ${new Date(sent.sent_at).toLocaleDateString("en-GB")}${
                sent.recipient_count ? ` to ${sent.recipient_count}` : ""
              }`
            : ""}
        </div>
      </div>

      {chip && (
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${chip.cls}`}
        >
          {chip.label}
        </span>
      )}

      {logging ? (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            type="number"
            min={0}
            placeholder="Recipients"
            className="h-8 w-28"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
          <Button
            size="sm"
            className="h-8"
            onClick={() => {
              onMarkSent(count ? Number(count) : null);
              setLogging(false);
              setCount("");
            }}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setLogging(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8" onClick={onGenerate}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Generate
          </Button>
          {sent ? (
            <Button size="sm" variant="ghost" className="h-8" onClick={onUndo}>
              <Undo2 className="mr-1.5 h-3.5 w-3.5" />
              Undo
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setLogging(true)}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Mark as sent
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
