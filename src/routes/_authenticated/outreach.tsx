import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Megaphone, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { eventsQuery } from "@/lib/queries";
import { OutreachKitCard } from "@/components/outreach/OutreachKitCard";

export const Route = createFileRoute("/_authenticated/outreach")({
  loader: ({ context }) => context.queryClient.ensureQueryData(eventsQuery),
  component: OutreachPage,
});

function OutreachPage() {
  const events = useQuery(eventsQuery);
  const [q, setQ] = useState("");

  const sorted = useMemo(() => {
    const list = [...(events.data ?? [])].sort((a: any, b: any) => {
      const da = a.event_date ? new Date(a.event_date).getTime() : 0;
      const db = b.event_date ? new Date(b.event_date).getTime() : 0;
      return db - da;
    });
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter((e: any) =>
      `${e.code ?? ""} ${e.name ?? ""}`.toLowerCase().includes(needle),
    );
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
          Expand a kit to edit templates or copy links.
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

      {sorted.length === 0 ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          {events.data?.length ? "No events match your search." : "No events yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((e: any) => (
            <div key={e.id} className="space-y-1.5">
              <div className="flex items-baseline gap-2 px-1">
                <span className="text-sm font-semibold text-foreground">
                  {e.code ? `${e.code} — ` : ""}
                  {e.name}
                </span>
                {e.event_date && (
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(e.event_date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
              <OutreachKitCard eventId={e.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
