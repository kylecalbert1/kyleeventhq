import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, CalendarDays, Users, Ticket } from "lucide-react";
import { Input } from "@/components/ui/input";
import { listTitoEventsWithStats } from "@/lib/tito.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tito/")({
  component: TitoArchive,
});

const PAGE = 60;

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function TitoArchive() {
  const { data, isLoading } = useQuery({
    queryKey: ["tito-events-with-stats"],
    queryFn: () => listTitoEventsWithStats(),
  });
  const [q, setQ] = useState("");
  const [visible, setVisible] = useState(PAGE);

  const events = data ?? [];

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = term
      ? events.filter((e) =>
          `${e.title ?? ""} ${e.slug ?? ""}`.toLowerCase().includes(term),
        )
      : events;
    return [...rows].sort((a, b) => {
      const ta = a.start_date ? new Date(a.start_date).getTime() : -Infinity;
      const tb = b.start_date ? new Date(b.start_date).getTime() : -Infinity;
      return tb - ta;
    });
  }, [events, q]);

  const shown = filtered.slice(0, visible);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-8 md:py-10 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              All Tito events
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Every event ever run on Tito — browse, search and message anyone who
              registered, whether or not it's tracked here.
            </p>
          </div>
          <div className="text-sm text-slate-500 tabular-nums">
            {events.length.toLocaleString()} events
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            className="pl-9 h-10 bg-card border-slate-200 shadow-sm"
            placeholder="Search events by name, city, venue…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setVisible(PAGE);
            }}
          />
        </div>

        {isLoading ? (
          <div className="surface-card p-12 text-center text-sm text-slate-500">
            Loading Tito events…
          </div>
        ) : shown.length === 0 ? (
          <div className="surface-card p-12 text-center text-sm text-slate-500">
            No Tito events match “{q}”.
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {shown.map((e) => (
                <TitoEventCard key={e.slug} e={e} />
              ))}
            </div>
            {filtered.length > shown.length && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setVisible((v) => v + PAGE)}
                  className="rounded-full border-2 border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Show more ({filtered.length - shown.length} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TitoEventCard({ e }: { e: any }) {
  const date = formatDate(e.start_date);
  const brand = e.brand as string;
  return (
    <Link to="/tito/$slug" params={{ slug: e.slug }} className="group block">
      <div className="surface-card p-5 md:p-6 transition-all hover:shadow-[var(--shadow-soft-hover)] hover:-translate-y-0.5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-lg text-slate-900 leading-tight truncate group-hover:text-slate-700">
                {e.title}
              </h3>
              <span
                className={cn(
                  "pill",
                  brand === "AIAI"
                    ? "pill-purple"
                    : brand === "CSC"
                      ? "pill-blue"
                      : "pill-slate",
                )}
              >
                {brand}
              </span>
              {e.is_past ? (
                <span className="pill pill-slate text-[10px]">Ended</span>
              ) : (
                <span className="pill bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 text-[10px]">
                  Upcoming
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-4 text-sm text-slate-600 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                {date ?? "No date"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                {(e.registered_count ?? 0).toLocaleString()} tickets
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                <Ticket className="h-3.5 w-3.5" />
                {e.slug}
              </span>
            </div>
          </div>
          {e.tagged_count > 0 && (
            <span className="pill bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">
              {e.tagged_count} tagged
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
