import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, CalendarDays, Users, Ticket } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listTitoEventsWithStats } from "@/lib/tito.functions";
import { cn } from "@/lib/utils";
import { fuzzyMatch } from "@/lib/fuzzy-search";

export const Route = createFileRoute("/_authenticated/tito/")({
  component: TitoArchive,
});

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

const MONTHS =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;

/**
 * Tito events carry no venue/city column (the sync never persisted one and the
 * event payload has no location field), so we derive the city from the title,
 * which consistently follows "X Summit | City Year".
 */
function cityFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  let tail = title.includes("|") ? title.split("|").pop()! : title;
  tail = tail
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(MONTHS, " ")
    .replace(/[|:,–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!title.includes("|")) {
    // "Controller Summit New York 2027" → take words after Summit/Festival/etc.
    const m = tail.match(
      /\b(summit|festival|conference|forum|awards|week|day|days)\b\s+(.*)$/i,
    );
    tail = m ? m[2].trim() : "";
  }
  if (!tail || tail.length > 30) return null;
  return tail
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function TitoArchive() {
  const { data, isLoading } = useQuery({
    queryKey: ["tito-events-with-stats"],
    queryFn: () => listTitoEventsWithStats(),
  });
  const [q, setQ] = useState("");
  const [year, setYear] = useState("all");
  const [location, setLocation] = useState("all");

  const events = data ?? [];

  const decorated = useMemo(
    () =>
      events.map((e: any) => ({
        ...e,
        _city: cityFromTitle(e.title),
        _year: e.start_date ? String(new Date(e.start_date).getFullYear()) : null,
      })),
    [events],
  );

  const years = useMemo(() => {
    const s = new Set<string>();
    for (const e of decorated) if (e._year) s.add(e._year);
    return Array.from(s).sort((a, b) => Number(b) - Number(a));
  }, [decorated]);

  const locations = useMemo(() => {
    const s = new Set<string>();
    for (const e of decorated) if (e._city) s.add(e._city);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [decorated]);

  const filtered = useMemo(() => {
    const rows = decorated.filter((e: any) => {
      if (year !== "all" && e._year !== year) return false;
      if (location !== "all" && e._city !== location) return false;
      return fuzzyMatch(q, e.title, e.slug, e._city, String(e._year ?? ""));
    });
    return [...rows].sort((a, b) => {
      const ta = a.start_date ? new Date(a.start_date).getTime() : -Infinity;
      const tb = b.start_date ? new Date(b.start_date).getTime() : -Infinity;
      return tb - ta;
    });
  }, [decorated, q, year, location]);

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
            {filtered.length.toLocaleString()} of {events.length.toLocaleString()} events
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9 h-10 bg-card border-slate-200 shadow-sm"
              placeholder="Search events by name, city, year…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="h-10 w-[140px] bg-card border-slate-200 shadow-sm">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All years</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger className="h-10 w-[180px] bg-card border-slate-200 shadow-sm">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All locations</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="surface-card p-12 text-center text-sm text-slate-500">
            Loading Tito events…
          </div>
        ) : filtered.length === 0 ? (
          <div className="surface-card p-12 text-center text-sm text-slate-500">
            No Tito events match your filters.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((e: any) => (
              <TitoEventCard key={e.slug} e={e} />
            ))}
          </div>
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
