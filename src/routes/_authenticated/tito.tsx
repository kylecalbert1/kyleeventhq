import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listTitoEventsWithStats } from "@/lib/tito.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X, Users, CalendarDays, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tito")({
  component: TitoEventsBrowse,
});

type SortKey = "recent" | "upcoming" | "attendees";
type StatusFilter = "all" | "upcoming" | "past";
type BrandFilter = "all" | "AIAI" | "CSC" | "Other";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "No date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No date";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function relativeSynced(iso: string | null | undefined): string {
  if (!iso) return "Never synced";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never synced";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Synced just now";
  if (mins < 60) return `Synced ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Synced ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `Synced ${days}d ago`;
}

function TitoEventsBrowse() {
  const { data, isLoading } = useQuery({
    queryKey: ["tito-events-with-stats"],
    queryFn: () => listTitoEventsWithStats(),
  });

  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [brandFilter, setBrandFilter] = useState<BrandFilter>("all");

  const events = data ?? [];

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return events.filter((e) => {
      if (brandFilter !== "all" && e.brand !== brandFilter) return false;
      if (statusFilter === "upcoming" && e.is_past) return false;
      if (statusFilter === "past" && !e.is_past) return false;
      if (term) {
        const hay = `${e.title ?? ""} ${e.slug ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [events, q, statusFilter, brandFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sortKey === "attendees") return b.registered_count - a.registered_count;
      const da = a.start_date ? new Date(a.start_date).getTime() : 0;
      const db = b.start_date ? new Date(b.start_date).getTime() : 0;
      if (sortKey === "upcoming") {
        // upcoming first (ascending future), then past descending
        const now = Date.now();
        const aFuture = da >= now;
        const bFuture = db >= now;
        if (aFuture && !bFuture) return -1;
        if (!aFuture && bFuture) return 1;
        return aFuture ? da - db : db - da;
      }
      return db - da; // recent
    });
    return arr;
  }, [filtered, sortKey]);

  const hasFilters =
    q.trim() !== "" || statusFilter !== "all" || brandFilter !== "all";

  return (
    <div className="p-6 md:p-8 animate-fade-in space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tito events</h1>
          <p className="text-sm text-muted-foreground">
            Browse synced Tito events. Click a card to view attendees.
          </p>
        </div>
        <Link to="/speaker-sourcing">
          <Button variant="outline">
            <Search className="h-4 w-4 mr-1.5" /> Cross-event search
          </Button>
        </Link>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight">All Tito events</h2>
          <div className="text-xs text-muted-foreground tabular-nums">
            {sorted.length} of {events.length}
          </div>
        </div>

        <Card className="p-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-9"
                placeholder="Search event name or slug"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="w-52 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most recent</SelectItem>
                <SelectItem value="upcoming">Upcoming first</SelectItem>
                <SelectItem value="attendees">Registered (desc)</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="past">Past</SelectItem>
              </SelectContent>
            </Select>
            <Select value={brandFilter} onValueChange={(v) => setBrandFilter(v as BrandFilter)}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                <SelectItem value="AIAI">AIAI</SelectItem>
                <SelectItem value="CSC">CSC</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQ("");
                  setStatusFilter("all");
                  setBrandFilter("all");
                }}
                className="h-8"
              >
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
        </Card>

        {isLoading ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : sorted.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            No Tito events match these filters.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((e) => (
              <Link
                key={e.slug}
                to="/tito/$slug"
                params={{ slug: e.slug }}
                className="group block"
              >
                <Card className="relative overflow-hidden bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.05)] transition-all duration-200 group-hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_10px_28px_rgba(15,23,42,0.08)] group-hover:-translate-y-0.5 h-full">
                  <span
                    className={cn(
                      "absolute left-0 top-0 bottom-0 w-1",
                      e.brand === "AIAI"
                        ? "bg-violet-500"
                        : e.brand === "CSC"
                          ? "bg-sky-500"
                          : "bg-slate-300",
                    )}
                  />
                  <div className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={cn(
                          "font-medium",
                          e.brand === "AIAI"
                            ? "bg-violet-100 text-violet-800 hover:bg-violet-100"
                            : e.brand === "CSC"
                              ? "bg-sky-100 text-sky-800 hover:bg-sky-100"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-100",
                        )}
                      >
                        {e.brand}
                      </Badge>
                      {e.is_past ? (
                        <Badge variant="outline" className="text-slate-500">
                          Past
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">
                          Upcoming
                        </Badge>
                      )}
                    </div>
                    <div className="font-semibold text-base leading-tight group-hover:text-primary transition-colors">
                      {e.title}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(e.start_date)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {e.registered_count.toLocaleString()} registered
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1 border-t">
                      <RefreshCw className="h-3 w-3" />
                      {relativeSynced(e.last_synced_at)}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
