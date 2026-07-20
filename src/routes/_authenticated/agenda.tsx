import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { eventsQuery, agendaItemsQuery } from "@/lib/queries";
import { AgendaTab } from "@/components/agenda/AgendaTab";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateEvent } from "@/lib/events.functions";
import { toast } from "sonner";
import {
  ListChecks,
  Search,
  ExternalLink,
  CalendarDays,
  MapPin,
  ArrowLeft,
  Save,
  Link2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agenda")({
  loader: ({ context }) => context.queryClient.ensureQueryData(eventsQuery),
  component: AgendaPage,
});

function formatShortDate(iso?: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBD";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

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
  const [browseQ, setBrowseQ] = useState("");

  const selected = sorted.find((e: any) => e.id === eventId);

  const filteredForBrowse = useMemo(() => {
    const q = browseQ.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((e: any) => {
      const hay = `${e.name ?? ""} ${e.code ?? ""} ${e.venue_name ?? ""} ${e.city ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, browseQ]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl p-6 md:p-8 space-y-6">
        <div>
          <div className="accent-bar mb-3" />
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-primary" />
            Agenda
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build running orders or link to an externally hosted agenda. Pick an event to load its
            agenda, or browse below.
          </p>
        </div>

        {/* Picker row */}
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
          {selected && (
            <Button variant="ghost" size="sm" onClick={() => setEventId("")}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to browse
            </Button>
          )}
        </div>

        {eventId && selected ? (
          <SelectedEventAgenda event={selected} />
        ) : (
          <BrowseGrid
            events={filteredForBrowse}
            total={sorted.length}
            query={browseQ}
            onQueryChange={setBrowseQ}
            onPick={(id) => setEventId(id)}
          />
        )}
      </div>
    </div>
  );
}

function SelectedEventAgenda({ event }: { event: any }) {
  const qc = useQueryClient();
  const [urlInput, setUrlInput] = useState<string>(event.external_agenda_url ?? "");
  useEffect(() => {
    setUrlInput(event.external_agenda_url ?? "");
  }, [event.id, event.external_agenda_url]);

  const save = useMutation({
    mutationFn: () =>
      updateEvent({
        data: {
          id: event.id,
          patch: { external_agenda_url: urlInput.trim() || null },
        },
      }),
    onSuccess: () => {
      toast.success("External agenda link saved");
      qc.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const trimmed = urlInput.trim();
  const dirty = trimmed !== (event.external_agenda_url ?? "").trim();
  const openHref = trimmed
    ? trimmed.startsWith("http")
      ? trimmed
      : `https://${trimmed}`
    : null;

  return (
    <div className="space-y-4">
      <div className="surface-card p-4 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {event.code ?? "Event"}
            </div>
            <div className="text-lg font-semibold truncate">{event.name}</div>
            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatShortDate(event.event_date)}
              </span>
              {(event.venue_name || event.city) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {[event.venue_name, event.city].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="border-t pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Link2 className="h-3 w-3" />
            External agenda link
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[260px]">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://docs.google.com/… or https://…"
                className="h-9"
              />
            </div>
            <Button
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
              size="sm"
              variant={dirty ? "default" : "outline"}
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1.5" />
              )}
              Save
            </Button>
            {openHref && (
              <a href={openHref} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open
                </Button>
              </a>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Paste a Google Doc, Sheets, or any external link. Editable here — no need to open Edit Event.
          </p>
        </div>
      </div>

      <AgendaTab eventId={event.id} eventFormat={event.format ?? "in_person"} />
    </div>
  );
}

function BrowseGrid({
  events,
  total,
  query,
  onQueryChange,
  onPick,
}: {
  events: any[];
  total: number;
  query: string;
  onQueryChange: (v: string) => void;
  onPick: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="surface-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Browse by event</div>
            <div className="text-xs text-muted-foreground">
              {events.length} of {total} events
            </div>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search event name, code, venue…"
              className="pl-9 h-10"
            />
          </div>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          No events match.
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <EventBrowseCard key={e.id} event={e} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventBrowseCard({ event, onPick }: { event: any; onPick: (id: string) => void }) {
  const items = useQuery(agendaItemsQuery(event.id));
  const count = items.data?.length ?? 0;
  const hasExternal = !!(event.external_agenda_url ?? "").trim();

  return (
    <button
      type="button"
      onClick={() => onPick(event.id)}
      className={cn(
        "text-left surface-card p-4 hover:shadow-md hover:border-primary/40 transition-all",
        "focus:outline-none focus:ring-2 focus:ring-primary/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {event.code ?? "Event"}
          </div>
          <div className="text-sm font-semibold truncate">{event.name}</div>
        </div>
        {hasExternal && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 inline-flex items-center gap-1"
            title="Has external agenda link"
          >
            <ExternalLink className="h-3 w-3" />
            Link
          </span>
        )}
      </div>
      <div className="mt-2 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatShortDate(event.event_date)}
        </span>
        {(event.venue_name || event.city) && (
          <span className="inline-flex items-center gap-1 truncate">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {[event.venue_name, event.city].filter(Boolean).join(" · ")}
            </span>
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px]">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 font-medium ring-1 ring-inset",
            count > 0
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : "bg-slate-50 text-slate-500 ring-slate-200",
          )}
        >
          {count > 0 ? `${count} sessions` : "No agenda yet"}
        </span>
      </div>
    </button>
  );
}


