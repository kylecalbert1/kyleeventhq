import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { eventsQuery } from "@/lib/queries";
import { AgendaTab } from "@/components/agenda/AgendaTab";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ListChecks } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agenda")({
  loader: ({ context }) => context.queryClient.ensureQueryData(eventsQuery),
  component: AgendaPage,
});

function AgendaPage() {
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

  const selected = sorted.find((e: any) => e.id === eventId);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl">
      <div>
        <div className="accent-bar mb-3" />
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ListChecks className="h-6 w-6 text-primary" />
          Agenda
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Build and view running orders. Pick an event to load its agenda.
        </p>
      </div>

      <div className="surface-card p-4 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Event
        </span>
        <SearchableSelect
          triggerClassName="w-[420px] max-w-full h-10"
          placeholder="Choose an event…"
          searchPlaceholder="Search events…"
          value={eventId}
          onValueChange={setEventId}
          options={sorted.map((e: any) => ({
            value: e.id,
            label: `${e.code ? `${e.code} — ` : ""}${e.name}`,
          }))}
        />

      </div>

      {eventId && selected ? (
        <AgendaTab eventId={eventId} eventFormat={(selected as any).format ?? "in_person"} />
      ) : (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          No events available.
        </div>
      )}
    </div>
  );
}
