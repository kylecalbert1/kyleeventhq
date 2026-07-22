import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Megaphone, Search, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { eventsQuery } from "@/lib/queries";
import { OutreachKitCard } from "@/components/outreach/OutreachKitCard";
import { isPastEvent } from "@/lib/event-lifecycle";

export const Route = createFileRoute("/_authenticated/outreach")({
  loader: ({ context }) => context.queryClient.ensureQueryData(eventsQuery),
  component: OutreachPage,
});

function OutreachPage() {
  const events = useQuery(eventsQuery);
  const [q, setQ] = useState("");
  const [pastOpen, setPastOpen] = useState(false);

  const { upcoming, past } = useMemo(() => {
    const sorted = [...(events.data ?? [])].sort((a: any, b: any) => {
      const da = a.event_date ? new Date(a.event_date).getTime() : 0;
      const db = b.event_date ? new Date(b.event_date).getTime() : 0;
      return db - da;
    });
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? sorted.filter((e: any) =>
          `${e.code ?? ""} ${e.name ?? ""}`.toLowerCase().includes(needle),
        )
      : sorted;
    const upcoming = filtered.filter((e: any) => !isPastEvent(e));
    const past = filtered.filter((e: any) => isPastEvent(e));
    // Upcoming: soonest first
    upcoming.sort((a: any, b: any) => {
      const da = a.event_date ? new Date(a.event_date).getTime() : Infinity;
      const db = b.event_date ? new Date(b.event_date).getTime() : Infinity;
      return da - db;
    });
    return { upcoming, past };
  }, [events.data, q]);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl">
      <div>
        <div className="accent-bar mb-3" />
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" />
          Outreach
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          LinkedIn templates and saved Sales Navigator searches for every event.
          Upcoming events only by default — past events are collapsed at the bottom.
        </p>
      </div>

      <div className="surface-card p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-10"
            placeholder="Search events by name or code"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {upcoming.length === 0 && past.length === 0 ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          {events.data?.length ? "No events match your search." : "No events yet."}
        </div>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <div className="space-y-3">
              {upcoming.map((e: any) => (
                <EventKit key={e.id} event={e} />
              ))}
            </div>
          ) : (
            <div className="surface-card p-8 text-center text-sm text-muted-foreground">
              No upcoming events. Past events are below.
            </div>
          )}

          {past.length > 0 && (
            <section className="pt-2">
              <button
                type="button"
                onClick={() => setPastOpen((v) => !v)}
                className="w-full flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
              >
                {pastOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-semibold text-slate-700">
                  Past events
                </span>
                <span className="text-xs text-muted-foreground">
                  {past.length} finished — outreach kits kept for reference
                </span>
              </button>
              {pastOpen && (
                <div className="mt-3 space-y-3 opacity-80">
                  {past.map((e: any) => (
                    <EventKit key={e.id} event={e} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function EventKit({ event }: { event: any }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2 px-1">
        <span className="text-sm font-semibold text-foreground">
          {event.code ? `${event.code} — ` : ""}
          {event.name}
        </span>
        {event.event_date && (
          <span className="text-[11px] text-muted-foreground">
            {new Date(event.event_date).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
      </div>
      <OutreachKitCard eventId={event.id} />
    </div>
  );
}
