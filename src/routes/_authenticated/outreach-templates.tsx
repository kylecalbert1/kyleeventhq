import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { eventsQuery } from "@/lib/queries";
import { OutreachHub } from "@/components/outreach/OutreachHub";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/outreach-templates")({
  loader: ({ context }) => context.queryClient.ensureQueryData(eventsQuery),
  component: OutreachTemplatesPage,
});

function OutreachTemplatesPage() {
  const events = useQuery(eventsQuery);
  const sorted = useMemo(() => {
    return [...(events.data ?? [])].sort((a: any, b: any) => {
      const da = a.event_date ? new Date(a.event_date).getTime() : 0;
      const db = b.event_date ? new Date(b.event_date).getTime() : 0;
      return db - da;
    });
  }, [events.data]);

  const [eventId, setEventId] = useState<string>("");
  useEffect(() => {
    if (!eventId && sorted.length) setEventId(sorted[0].id);
  }, [sorted, eventId]);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl">
      <div>
        <div className="accent-bar mb-3" />
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          Outreach
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          LinkedIn InMail and connection-request templates. Pick an event to view
          or edit its saved messages.
        </p>
      </div>

      <div className="surface-card p-4 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Event
        </span>
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="w-[420px] max-w-full h-10">
            <SelectValue placeholder="Choose an event…" />
          </SelectTrigger>
          <SelectContent>
            {sorted.map((e: any) => (
              <SelectItem key={e.id} value={e.id}>
                {e.code ? `${e.code} — ` : ""}{e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {eventId ? (
        <OutreachHub eventId={eventId} />
      ) : (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          No events available.
        </div>
      )}
    </div>
  );
}
