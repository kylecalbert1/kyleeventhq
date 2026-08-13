import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Megaphone, Search, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { eventsQuery } from "@/lib/queries";
import { OutreachKitCard } from "@/components/outreach/OutreachKitCard";
import { isPastEvent } from "@/lib/event-lifecycle";
import { fuzzyFilter } from "@/lib/fuzzy-search";
import { PageHelp } from "@/components/PageHelp";

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
    const filtered = fuzzyFilter(sorted, q, (e: any) => [e.code, e.name]);
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
    <div className="p-6 md:p-8 space-y-7 max-w-5xl">
      <div>
        <div className="accent-bar mb-3" />
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-primary" />
              Outreach
            </h1>
            <PageHelp
              title="Outreach"
              what="A per-event library of the LinkedIn copy and Sales Navigator searches you use to find and approach speakers. Nothing here sends anything — it's text you copy and paste."
              steps={[
                "Find the event you're sourcing for (past events are collapsed at the bottom).",
                "Open its Outreach kit to edit the InMail subject/message, connection note and colleague-outreach templates.",
                "Save Sales Navigator search URLs so you can jump straight back to the same lists.",
              ]}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          LinkedIn templates and saved Sales Navigator searches for every event.
          Upcoming events only by default — past events are collapsed at the bottom.
        </p>
      </div>

      <div className="surface-card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-11 text-[13px]"
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
            <div className="space-y-5">
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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2.5 px-1">
        <span className="text-base font-semibold text-foreground">
          {event.name}
        </span>
        {event.code && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
            {event.code}
          </span>
        )}
        {event.event_date && (
          <span className="text-xs text-muted-foreground">
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

