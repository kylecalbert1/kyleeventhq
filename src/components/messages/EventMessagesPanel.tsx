import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  messageTemplatesQuery,
  messageSenderQuery,
  eventMessageSendsQuery,
} from "@/lib/queries";
import {
  deleteMessageSend,
  type MessageTemplate,
} from "@/lib/message-templates.functions";
import {
  STREAMS,
  streamMeta,
  currentWeeksOut,
  isTypicalNow,
  typicalWeeksLabel,
  type MessageEvent,
} from "@/lib/message-render";
import { GenerateMessageDialog } from "./GenerateMessageDialog";

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
  const [picking, setPicking] = useState(false);
  const [showAllSends, setShowAllSends] = useState(false);

  const unmark = useServerFn(deleteMessageSend);
  const undo = useMutation({
    mutationFn: (id: string) => unmark({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eventMessageSends", event.id] });
      toast.success("Removed from the log");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const applicable = useMemo(
    () =>
      (templates.data ?? []).filter(
        (t) =>
          (t.business_line === null || t.business_line === event.business_line) &&
          (t.event_format === null || t.event_format === event.format),
      ),
    [templates.data, event.business_line, event.format],
  );

  const nowWeeks = currentWeeksOut(event.event_date);
  const suggestions = useMemo(
    () => applicable.filter((t) => isTypicalNow(t.typical_weeks, nowWeeks)).slice(0, 3),
    [applicable, nowWeeks],
  );

  const templateName = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of templates.data ?? []) m.set(t.id, t.name);
    return m;
  }, [templates.data]);

  const allSends = sends.data ?? [];
  const visibleSends = showAllSends ? allSends : allSends.slice(0, 5);
  const firstName = sender.data?.firstName ?? "Team";

  return (
    <div className="surface-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Messages (Tito)</h2>
          <p className="text-xs text-muted-foreground">
            Generate the copy for any message type whenever you need it, paste it into Tito's
            Messages tab. Nothing is emailed from here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/message-templates">
              <Settings2 className="mr-1.5 h-4 w-4" />
              Edit templates
            </Link>
          </Button>
          <Button size="sm" onClick={() => setPicking(true)}>
            <Send className="mr-1.5 h-4 w-4" />
            Generate message
          </Button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Around now you'd usually send:{" "}
          {suggestions.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ", "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => setGenerating(t)}
              >
                {t.name}
              </button>
            </span>
          ))}
        </p>
      )}

      <div className="mt-5">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sent for this event
        </div>
        {allSends.length === 0 ? (
          <div className="rounded-xl border border-border px-4 py-5 text-center text-sm text-muted-foreground">
            Nothing logged yet.
          </div>
        ) : (
          <>
            <div className="divide-y divide-border rounded-xl border border-border">
              {visibleSends.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {s.template_id ? templateName.get(s.template_id) ?? "Message" : "Message"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(s.sent_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {s.recipient_count ? ` · ${s.recipient_count} recipients` : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-muted-foreground"
                    onClick={() => undo.mutate(s.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            {allSends.length > 5 && (
              <button
                type="button"
                className="mt-2 text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setShowAllSends((v) => !v)}
              >
                {showAllSends ? "Show less" : `Show all ${allSends.length}`}
              </button>
            )}
          </>
        )}
      </div>

      <TypePickerDialog
        open={picking}
        onOpenChange={setPicking}
        templates={applicable}
        onPick={(t) => {
          setPicking(false);
          setGenerating(t);
        }}
      />

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

function TypePickerDialog({
  open,
  onOpenChange,
  templates,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templates: MessageTemplate[];
  onPick: (t: MessageTemplate) => void;
}) {
  const grouped = STREAMS.map((stream) => ({
    stream,
    list: templates
      .filter((t) => t.stream === stream)
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
  })).filter((g) => g.list.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pick a message type</DialogTitle>
          <DialogDescription>
            Every type can be generated as many times as you need.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {grouped.map(({ stream, list }) => {
            const meta = streamMeta[stream];
            return (
              <section key={stream}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                  <h3 className="text-sm font-semibold text-foreground">{meta.label}</h3>
                </div>
                <div className="grid gap-2">
                  {list.map((t) => {
                    const typical = typicalWeeksLabel(t.typical_weeks);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onPick(t)}
                        className="rounded-xl border border-border px-4 py-3 text-left transition hover:border-foreground/20 hover:bg-muted/40"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{t.name}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.chip}`}
                          >
                            {meta.label}
                          </span>
                          {typical && (
                            <span className="text-[11px] text-muted-foreground">{typical}</span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {t.subject}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {grouped.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No templates match this event's business line and format.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
