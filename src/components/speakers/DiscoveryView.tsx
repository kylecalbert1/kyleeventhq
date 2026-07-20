import { Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  syncTito,
  syncTitoByUrl,
  titoConnectionStatus,
  listTitoEvents,
  listTitoEventsWithStats,
  listTitoEventYears,
  listReleaseTitles,
  searchTitoTickets,
  suggestTitoTickets,
  listExcludedCompanies,
  addExcludedCompany,
  deleteExcludedCompany,
  tagAsSpeakerCandidates,
  generateOutreachDrafts,
  listTitoEventFilters,
  addTitoEventFilter,
  deleteTitoEventFilter,
  previewTitoEventClassification,
  speakerSourcingStats,
} from "@/lib/tito.functions";
import { listEvents } from "@/lib/events.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  Trash2,
  Sparkles,
  X,
  Search,
  ChevronDown,
  Link2,
  CalendarDays,
  Users,
  CheckCircle2,
  UserPlus,
  Upload,
  FileSpreadsheet,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TitoAttendeeCard, type TitoAttendee } from "@/components/tito/TitoAttendeeCard";
import { TitoAttendeeDetailDialog } from "@/components/tito/TitoAttendeeDetailDialog";
import { BulkEmailDialog } from "@/components/BulkEmailDialog";
import { useContactHistory, useTrackedByEmails } from "@/hooks/use-contact-history";
import { JobTitleFilter, parseKeywordList, matchesJobTitleFilters } from "@/components/tito/JobTitleFilter";

// Rendered as an embedded view inside /speakers when "Find new candidates" mode is on.

type Brand = "all" | "AIAI" | "CSC" | "Other";

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

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "slate" | "amber" | "green" | "purple" | "red" | "blue";
}) {
  const toneMap: Record<typeof tone, string> = {
    slate: "text-slate-700",
    amber: "text-amber-600",
    green: "text-emerald-600",
    purple: "text-violet-600",
    red: "text-rose-600",
    blue: "text-indigo-600",
  };
  return (
    <div className="rounded-xl bg-white border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-4">
      <div className={cn("text-2xl font-semibold tabular-nums tracking-tight", toneMap[tone])}>
        {value}
      </div>
      <div className="text-[11px] mt-1 uppercase tracking-wide font-medium text-slate-500">
        {label}
      </div>
    </div>
  );
}

export function DiscoveryView() {
  const qc = useQueryClient();
  const conn = useQuery({ queryKey: ["tito-conn"], queryFn: () => titoConnectionStatus() });
  const titoEvents = useQuery({ queryKey: ["tito-events"], queryFn: () => listTitoEvents() });
  const titoEventsStats = useQuery({
    queryKey: ["tito-events-with-stats"],
    queryFn: () => listTitoEventsWithStats(),
  });
  const releaseTitles = useQuery({ queryKey: ["tito-releases"], queryFn: () => listReleaseTitles() });
  const excluded = useQuery({ queryKey: ["excluded-companies"], queryFn: () => listExcludedCompanies() });
  const years = useQuery({ queryKey: ["tito-event-years"], queryFn: () => listTitoEventYears() });
  const upcomingEvents = useQuery({ queryKey: ["events"], queryFn: () => listEvents() });
  const stats = useQuery({
    queryKey: ["speaker-sourcing-stats"],
    queryFn: () => speakerSourcingStats(),
  });

  const [q, setQ] = useState("");
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [brandFilter, setBrandFilter] = useState<Brand>("all");
  const [selectedEventSlugs, setSelectedEventSlugs] = useState<string[]>([]);
  const [includeReleases, setIncludeReleases] = useState<string[]>([]);
  const [excludeReleases, setExcludeReleases] = useState<string[]>([]);
  const [applyExclude, setApplyExclude] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [forceFullSync, setForceFullSync] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [detailAttendee, setDetailAttendee] = useState<TitoAttendee | null>(null);
  const [pasteUrl, setPasteUrl] = useState("");
  const [lastPasteResult, setLastPasteResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [eventSearch, setEventSearch] = useState("");
  const [companiesInclude, setCompaniesInclude] = useState<string[]>([]);
  const [companiesIncludeFile, setCompaniesIncludeFile] = useState<string | null>(null);
  const [companiesExclude, setCompaniesExclude] = useState<string[]>([]);
  const [companiesExcludeFile, setCompaniesExcludeFile] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [hideTracked, setHideTracked] = useState(false);
  const [contactedFilter, setContactedFilter] = useState<"all" | "never" | "before">("all");
  const [jobTitleInclude, setJobTitleInclude] = useState("");
  const [jobTitleExclude, setJobTitleExclude] = useState("");

  // Autocomplete
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const suggestions = useQuery({
    queryKey: ["tito-suggest", debouncedQ],
    queryFn: () => suggestTitoTickets({ data: { q: debouncedQ } }),
    enabled: debouncedQ.length >= 2,
    staleTime: 30_000,
  });

  // Build brand-scoped slug allowlist (default: only AIAI/CSC — Kyle's own).
  const scopedSlugsAll = useMemo(() => {
    const rows = titoEventsStats.data ?? [];
    return rows
      .filter((e) => brandFilter === "all" ? e.brand !== "Other" : e.brand === brandFilter)
      .map((e) => e.slug);
  }, [titoEventsStats.data, brandFilter]);

  const search = useMutation({
    mutationFn: () => {
      // If user picked specific events, use those; otherwise scope to brand-filtered slugs.
      const eventSlugs = selectedEventSlugs.length
        ? selectedEventSlugs
        : scopedSlugsAll.length ? scopedSlugsAll : undefined;
      return searchTitoTickets({
        data: {
          q: q.trim() || undefined,
          event_slugs: eventSlugs,
          release_titles_include: includeReleases.length ? includeReleases : undefined,
          release_titles_exclude: excludeReleases.length ? excludeReleases : undefined,
          years: selectedYears.length ? selectedYears : undefined,
          apply_exclude_list: applyExclude,
          companies_include: companiesInclude.length ? companiesInclude : undefined,
          companies_exclude: companiesExclude.length ? companiesExclude : undefined,
          limit: 1000,
        },
      });
    },
  });

  const sync = useMutation({
    mutationFn: (force: boolean) => syncTito({ data: { force } }),
    onSuccess: (r) => {
      toast.success(
        `Synced ${r.events} events, ${r.tickets} tickets${r.forced ? " · full re-sync" : ""}`,
      );
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncByUrl = useMutation({
    mutationFn: () => syncTitoByUrl({ data: { url: pasteUrl.trim() } }),
    onSuccess: (r) => {
      setLastPasteResult({
        ok: true,
        message: `${r.event_title}: ${r.new} new, ${r.updated} updated`,
      });
      setPasteUrl("");
      qc.invalidateQueries({ queryKey: ["tito-events"] });
      qc.invalidateQueries({ queryKey: ["tito-events-with-stats"] });
      qc.invalidateQueries({ queryKey: ["speaker-sourcing-stats"] });
    },
    onError: (e: Error) =>
      setLastPasteResult({ ok: false, message: e.message }),
  });

  const results = search.data ?? [];

  const resultEmails = useMemo(
    () => results.map((r) => r.email as string | null),
    [results],
  );
  const { lookup: lookupHistory } = useContactHistory(resultEmails);
  const { lookup: lookupTracked } = useTrackedByEmails(resultEmails);

  const visibleResults = useMemo(() => {
    const inc = parseKeywordList(jobTitleInclude);
    const exc = parseKeywordList(jobTitleExclude);
    return results.filter((r) => {
      const tracked = lookupTracked(r.email);
      if (hideTracked && tracked) return false;
      if (contactedFilter !== "all") {
        const h = lookupHistory(r.email);
        const contacted = !!h && h.count > 0;
        if (contactedFilter === "never" && contacted) return false;
        if (contactedFilter === "before" && !contacted) return false;
      }
      if (!matchesJobTitleFilters((r as any).job_title, inc, exc)) return false;
      return true;
    });
  }, [results, hideTracked, contactedFilter, jobTitleInclude, jobTitleExclude, lookupTracked, lookupHistory]);


  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleYear(y: number) {
    setSelectedYears((prev) => (prev.includes(y) ? prev.filter((v) => v !== y) : [...prev, y]));
  }

  function runSearch() {
    setSuggestOpen(false);
    search.mutate();
  }

  // Filter event cards for the browse section.
  const visibleEvents = useMemo(() => {
    const term = eventSearch.trim().toLowerCase();
    const rows = titoEventsStats.data ?? [];
    return rows.filter((e) => {
      if (brandFilter !== "all" && e.brand !== brandFilter) return false;
      if (brandFilter === "all" && e.brand === "Other") return false;
      if (selectedYears.length) {
        const y = e.start_date ? new Date(e.start_date).getUTCFullYear() : null;
        if (!y || !selectedYears.includes(y)) return false;
      }
      if (term) {
        const hay = `${e.title ?? ""} ${e.slug ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [titoEventsStats.data, eventSearch, brandFilter, selectedYears]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Speaker Prospecting</h1>
            <p className="text-sm text-slate-500 mt-1">
              Find past attendees to invite as speakers. Scoped to AIAI &amp; CSC events by default.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {conn.data && !conn.data.connected ? (
              <Badge variant="destructive">TITO_API_TOKEN missing</Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">
                Connected
              </Badge>
            )}
            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
              <Checkbox
                checked={forceFullSync}
                onCheckedChange={(v) => setForceFullSync(Boolean(v))}
              />
              Force full re-sync
            </label>
            <Button
              onClick={() => sync.mutate(forceFullSync)}
              disabled={sync.isPending || !conn.data?.connected}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {sync.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync all events
            </Button>
          </div>
        </div>

        {/* Stat bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Unified Events" value={stats.data?.unified_events ?? "—"} tone="blue" />
          <StatCard label="Synced Attendees" value={(stats.data?.synced_attendees ?? 0).toLocaleString()} tone="slate" />
          <StatCard label="New Profiles" value={stats.data?.new_profiles ?? "—"} tone="amber" />
          <StatCard label="Confirmed Speakers" value={stats.data?.confirmed_speakers ?? "—"} tone="green" />
          <StatCard label="Waitlisted Speakers" value={stats.data?.waitlisted_speakers ?? "—"} tone="purple" />
          <StatCard label="Declined Profiles" value={stats.data?.declined_profiles ?? "—"} tone="red" />
        </div>

        {!conn.data?.connected && (
          <div className="rounded-lg border bg-amber-50 text-amber-900 p-4 text-sm">
            Add <code>TITO_API_TOKEN</code> in Project Settings → Secrets, then click{" "}
            <b>Sync all events</b>.
          </div>
        )}

        {/* Paste-URL sync */}
        <div className="rounded-xl bg-white border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Link2 className="h-4 w-4 text-indigo-600" />
            Add a Tito event by URL
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[280px]">
              <Input
                value={pasteUrl}
                onChange={(e) => setPasteUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && pasteUrl.trim() && !syncByUrl.isPending) {
                    syncByUrl.mutate();
                  }
                }}
                placeholder="https://ti.to/sequel-media/some-event-slug"
                className="h-10"
              />
            </div>
            <Button
              onClick={() => syncByUrl.mutate()}
              disabled={!pasteUrl.trim() || syncByUrl.isPending || !conn.data?.connected}
              className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {syncByUrl.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Data
            </Button>
          </div>
          {lastPasteResult && (
            <div
              className={cn(
                "text-xs flex items-center gap-1.5 pt-1",
                lastPasteResult.ok ? "text-emerald-700" : "text-rose-700",
              )}
            >
              {lastPasteResult.ok && <CheckCircle2 className="h-3.5 w-3.5" />}
              Synced: {lastPasteResult.message}
            </div>
          )}
        </div>

        {/* Search + chips */}
        <div className="rounded-xl bg-white border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-4 space-y-3">
          <div className="flex gap-2 items-start">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSuggestOpen(true);
                }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
                placeholder="Search event names, speakers, or company profiles…"
                className="pl-9 h-11 text-[15px]"
              />
              {suggestOpen && debouncedQ.length >= 2 && (suggestions.data?.length ?? 0) > 0 && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-80 overflow-y-auto rounded-md border bg-popover shadow-md">
                  {suggestions.data!.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setQ(s.name ?? s.email ?? s.company_name ?? "");
                        setSuggestOpen(false);
                        setTimeout(() => search.mutate(), 0);
                      }}
                    >
                      <div className="font-medium">{s.name ?? s.email ?? "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[s.job_title, s.company_name].filter(Boolean).join(" · ")}
                        {s.event_title ? ` — ${s.event_title}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              onClick={runSearch}
              disabled={search.isPending}
              className="h-11 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {search.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Search
            </Button>
          </div>

          {/* Brand chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500 mr-1">
              Brand
            </span>
            {(["all", "AIAI", "CSC"] as const).map((b) => {
              const on = brandFilter === b;
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBrandFilter(b)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                    on
                      ? b === "AIAI"
                        ? "bg-violet-100 text-violet-800 border-violet-200"
                        : b === "CSC"
                          ? "bg-sky-100 text-sky-800 border-sky-200"
                          : "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white hover:bg-slate-50 text-slate-600 border-slate-200",
                  )}
                >
                  {b === "all" ? "All (AIAI + CSC)" : b}
                </button>
              );
            })}
          </div>

          {/* Year chips */}
          {(years.data?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500 mr-1">
                Year
              </span>
              {years.data!.map((y) => {
                const on = selectedYears.includes(y);
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => toggleYear(y)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                      on
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white hover:bg-slate-50 text-slate-600 border-slate-200",
                    )}
                  >
                    {y}
                  </button>
                );
              })}
              {selectedYears.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedYears([])}
                  className="text-xs text-slate-500 hover:text-slate-700 underline ml-1"
                >
                  clear
                </button>
              )}
            </div>
          )}

          {/* Optional event chips (via more filters) */}
          <div>
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showMore && "rotate-180")} />
              More filters (events, ticket types, company CSV, job titles)
              {(selectedEventSlugs.length > 0 || includeReleases.length > 0 || excludeReleases.length > 0 || !applyExclude || companiesInclude.length > 0 || companiesExclude.length > 0 || parseKeywordList(jobTitleInclude).length > 0 || parseKeywordList(jobTitleExclude).length > 0) && (
                <span className="ml-1 rounded-full bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5">
                  {selectedEventSlugs.length + includeReleases.length + excludeReleases.length + (!applyExclude ? 1 : 0) + (companiesInclude.length ? 1 : 0) + (companiesExclude.length ? 1 : 0) + (parseKeywordList(jobTitleInclude).length ? 1 : 0) + (parseKeywordList(jobTitleExclude).length ? 1 : 0)}
                </span>
              )}
            </button>
            {showMore && (
              <div className="mt-3 space-y-3 border-t pt-3">
                <EventTypeahead
                  label="Events (Tito)"
                  options={(titoEvents.data ?? []).map((e) => ({ value: e.slug, label: e.title }))}
                  selected={selectedEventSlugs}
                  onChange={setSelectedEventSlugs}
                  placeholder="Type to search events…"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <MultiSelect
                    label="Include ticket types"
                    options={(releaseTitles.data ?? []).map((r) => ({ value: r, label: r }))}
                    selected={includeReleases}
                    onChange={setIncludeReleases}
                    placeholder="Any"
                  />
                  <MultiSelect
                    label="Exclude ticket types (e.g. Speaker Pass, Sponsor)"
                    options={(releaseTitles.data ?? []).map((r) => ({ value: r, label: r }))}
                    selected={excludeReleases}
                    onChange={setExcludeReleases}
                    placeholder="None"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={applyExclude}
                    onCheckedChange={(v) => setApplyExclude(Boolean(v))}
                  />
                  Apply sponsor/competitor exclude list ({excluded.data?.length ?? 0} companies)
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <CompaniesCsvSlot
                    title="Only these companies"
                    accent="emerald"
                    list={companiesInclude}
                    fileName={companiesIncludeFile}
                    onLoad={(names, name) => { setCompaniesInclude(names); setCompaniesIncludeFile(name); }}
                    onClear={() => { setCompaniesInclude([]); setCompaniesIncludeFile(null); }}
                  />
                  <CompaniesCsvSlot
                    title="Exclude these companies"
                    accent="rose"
                    list={companiesExclude}
                    fileName={companiesExcludeFile}
                    onLoad={(names, name) => { setCompaniesExclude(names); setCompaniesExcludeFile(name); }}
                    onClear={() => { setCompaniesExclude([]); setCompaniesExcludeFile(null); }}
                  />
                </div>

                <JobTitleFilter
                  includeText={jobTitleInclude}
                  excludeText={jobTitleExclude}
                  onIncludeChange={setJobTitleInclude}
                  onExcludeChange={setJobTitleExclude}
                />
              </div>
            )}
          </div>
        </div>

        {/* Search results */}
        {(search.data !== undefined || search.isPending) && (
          <div className="rounded-xl bg-white border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b bg-slate-50/50 gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-sm font-medium text-slate-700">
                  {visibleResults.length}
                  {visibleResults.length !== results.length ? ` of ${results.length}` : ""}
                  {" "}search result{results.length === 1 ? "" : "s"}
                  {selected.size > 0 ? ` · ${selected.size} selected` : ""}
                </div>
                <div className="flex items-center gap-1.5">
                  {(["all", "never", "before"] as const).map((v) => {
                    const on = contactedFilter === v;
                    const label =
                      v === "all"
                        ? "All"
                        : v === "never"
                          ? "Never contacted"
                          : "Contacted before";
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setContactedFilter(v)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                          on
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white hover:bg-slate-50 text-slate-600 border-slate-200",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <Checkbox
                    checked={hideTracked}
                    onCheckedChange={(v) => setHideTracked(Boolean(v))}
                  />
                  Hide people already in my database
                </label>
              </div>
              <div className="flex gap-2">
                <TagButton
                  disabled={selected.size === 0}
                  ticketIds={Array.from(selected)}
                  events={(upcomingEvents.data ?? []).map((e) => ({ id: e.id, title: e.name }))}
                  onDone={() => {
                    toast.success("Tagged as speaker candidates");
                    setSelected(new Set());
                    qc.invalidateQueries({ queryKey: ["speakers"] });
                    qc.invalidateQueries({ queryKey: ["speaker-sourcing-stats"] });
                    qc.invalidateQueries({ queryKey: ["tito-events-with-stats"] });
                  }}
                />
                <Button
                  variant="outline"
                  disabled={selected.size === 0}
                  onClick={() => setComposeOpen(true)}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Compose email
                </Button>
                <DraftButton
                  disabled={selected.size === 0}
                  ticketIds={Array.from(selected)}
                  results={results as TitoAttendee[]}
                />
              </div>
            </div>
            <div className="p-3 max-h-[70vh] overflow-y-auto">
              {visibleResults.length === 0 && !search.isPending ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  {results.length === 0
                    ? "No attendees matched. Try broadening your search or clearing filters."
                    : "All results were hidden by the contact/tracked filters above."}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {visibleResults.map((r) => (
                    <TitoAttendeeCard
                      key={r.id}
                      a={r as TitoAttendee}
                      selected={selected.has(r.id)}
                      onToggle={() => toggle(r.id)}
                      onOpenDetail={() => setDetailAttendee(r as TitoAttendee)}
                      onEmail={() => {
                        if (r.email) window.location.href = `mailto:${r.email}`;
                      }}
                      onAddNote={() => setDetailAttendee(r as TitoAttendee)}
                      history={lookupHistory(r.email)}
                      trackedIn={lookupTracked(r.email)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Browse events */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                Or browse by event
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Click an event to open its attendee list. Filtered by brand &amp; year chips above.
              </p>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                className="pl-8 h-9"
                placeholder="Filter events…"
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
              />
            </div>
          </div>

          {titoEventsStats.isLoading ? (
            <div className="rounded-xl bg-white border border-slate-200/70 p-12 text-center text-sm text-slate-500">
              Loading events…
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="rounded-xl bg-white border border-slate-200/70 p-12 text-center text-sm text-slate-500">
              No events match. Try clearing brand/year filters, or paste a Tito URL above.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleEvents.map((e) => (
                <Link
                  key={e.slug}
                  to="/tito/$slug"
                  params={{ slug: e.slug }}
                  className="group block"
                >
                  <div className="relative overflow-hidden bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.05)] transition-all duration-200 group-hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_10px_28px_rgba(15,23,42,0.08)] group-hover:-translate-y-0.5 h-full">
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5",
                            e.brand === "AIAI"
                              ? "bg-violet-100 text-violet-800"
                              : e.brand === "CSC"
                                ? "bg-sky-100 text-sky-800"
                                : "bg-slate-100 text-slate-700",
                          )}
                        >
                          {e.brand}
                        </span>
                        {e.is_past ? (
                          <span className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">
                            Past
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700">
                            Upcoming
                          </span>
                        )}
                        <span className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-indigo-50 text-indigo-700">
                          Tito
                        </span>
                      </div>
                      <div className="font-semibold text-base leading-tight text-slate-900 group-hover:text-indigo-700 transition-colors">
                        {e.title}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatDate(e.start_date)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          {e.registered_count.toLocaleString()} registered
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                        {e.tagged_count > 0 && (
                          <span className="rounded-full px-2 py-0.5 bg-indigo-50 text-indigo-700 font-medium">
                            {e.tagged_count} tagged
                          </span>
                        )}
                        {e.confirmed_count > 0 && (
                          <span className="rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 font-medium">
                            {e.confirmed_count} confirmed
                          </span>
                        )}
                        {e.waitlisted_count > 0 && (
                          <span className="rounded-full px-2 py-0.5 bg-violet-50 text-violet-700 font-medium">
                            {e.waitlisted_count} waitlisted
                          </span>
                        )}
                        {e.declined_count > 0 && (
                          <span className="rounded-full px-2 py-0.5 bg-rose-50 text-rose-700 font-medium">
                            {e.declined_count} declined
                          </span>
                        )}
                        {e.tagged_count === 0 && (
                          <span className="text-slate-400 italic">No candidates tagged yet</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                          <RefreshCw className="h-3 w-3" />
                          {relativeSynced(e.last_synced_at)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 group-hover:text-indigo-700">
                          View attendees →
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Advanced settings */}
        <div className="rounded-xl bg-white border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between p-4 text-sm font-medium text-slate-700 hover:bg-slate-50/60"
          >
            <span className="flex items-center gap-2">
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")}
              />
              Advanced settings
            </span>
            <span className="text-xs text-slate-500">
              Exclude list · Event filter overrides
            </span>
          </button>
          {showAdvanced && (
            <div className="p-4 border-t space-y-4">
              <ExcludeListPanel
                rows={excluded.data ?? []}
                onAdd={async (name) => {
                  await addExcludedCompany({ data: { company_name: name } });
                  qc.invalidateQueries({ queryKey: ["excluded-companies"] });
                }}
                onDelete={async (id) => {
                  await deleteExcludedCompany({ data: { id } });
                  qc.invalidateQueries({ queryKey: ["excluded-companies"] });
                }}
              />
              <EventFilterPanel />
            </div>
          )}
        </div>

        <TitoAttendeeDetailDialog
          attendee={detailAttendee}
          open={!!detailAttendee}
          onOpenChange={(v) => {
            if (!v) setDetailAttendee(null);
          }}
        />

        <BulkEmailDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          speakers={results
            .filter((r) => selected.has(r.id))
            .map((r) => ({
              id: r.id,
              name: r.name ?? "Unknown",
              email: r.email ?? null,
              company: r.company_name ?? null,
            }))}
          initialTemplate="custom"
        />
      </div>
    </div>
  );
}

// ============ Helper components ============

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const remaining = useMemo(
    () => options.filter((o) => !selected.includes(o.value)),
    [options, selected],
  );
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1 min-h-9 border rounded-md px-2 py-1.5 bg-background">
        {selected.map((v) => {
          const opt = options.find((o) => o.value === v);
          return (
            <Badge key={v} variant="secondary" className="gap-1">
              {opt?.label ?? v}
              <button
                type="button"
                onClick={() => onChange(selected.filter((s) => s !== v))}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
        <Select value="" onValueChange={(v) => v && onChange([...selected, v])}>
          <SelectTrigger className="border-0 h-7 shadow-none px-1 w-auto text-muted-foreground">
            <SelectValue placeholder={selected.length ? "Add…" : placeholder ?? "Select…"} />
          </SelectTrigger>
          <SelectContent>
            {remaining.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function EventTypeahead({
  label,
  options,
  selected,
  onChange,
  placeholder,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return options
      .filter(
        (o) =>
          !selected.includes(o.value) &&
          (o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [options, query, selected]);

  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1 min-h-9 border rounded-md px-2 py-1.5 bg-background">
        {selected.map((v) => {
          const opt = options.find((o) => o.value === v);
          return (
            <Badge key={v} variant="secondary" className="gap-1">
              {opt?.label ?? v}
              <button
                type="button"
                onClick={() => onChange(selected.filter((s) => s !== v))}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
        <div className="relative flex-1 min-w-[200px]">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={selected.length ? "Add another…" : placeholder ?? "Type to search…"}
            className="border-0 shadow-none h-7 px-1 focus-visible:ring-0"
          />
          {open && suggestions.length > 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md">
              {suggestions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange([...selected, o.value]);
                    setQuery("");
                  }}
                >
                  {o.label}
                  <div className="text-xs text-muted-foreground font-mono">{o.value}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExcludeListPanel({
  rows,
  onAdd,
  onDelete,
}: {
  rows: Array<{ id: string; company_name: string }>;
  onAdd: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  return (
    <div className="rounded-lg border bg-slate-50/60 p-4">
      <div className="text-sm font-medium mb-2">
        Sponsor / competitor exclude list ({rows.length})
      </div>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Company name"
        />
        <Button
          variant="outline"
          onClick={async () => {
            if (!name.trim()) return;
            await onAdd(name.trim());
            setName("");
          }}
        >
          Add
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {rows.map((r) => (
          <Badge key={r.id} variant="secondary" className="gap-1">
            {r.company_name}
            <button
              type="button"
              onClick={() => onDelete(r.id)}
              className="hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

function TagButton({
  disabled,
  ticketIds,
  events,
  onDone,
}: {
  disabled: boolean;
  ticketIds: string[];
  events: { id: string; title: string }[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      tagAsSpeakerCandidates({ data: { event_id: eventId, ticket_ids: ticketIds } }),
    onSuccess: (r) => {
      toast.success(`Added ${r.added} candidate(s), skipped ${r.skipped} duplicate(s)`);
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <Button variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4 mr-2" />
        Tag as speaker candidate
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tag {ticketIds.length} candidate(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Event</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose event…" />
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              These will appear in the Speakers pipeline with status <b>contacted</b> and source{" "}
              <b>tito_candidate</b>. No email is sent.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!eventId || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DraftButton({
  disabled,
  ticketIds,
  results,
}: {
  disabled: boolean;
  ticketIds: string[];
  results: TitoAttendee[];
}) {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState("");
  const [angle, setAngle] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }> | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const cappedIds = useMemo(() => ticketIds.slice(0, 25), [ticketIds]);

  const speakers = useMemo(() => {
    const idSet = new Set(cappedIds);
    return results
      .filter((r) => idSet.has(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name ?? "Unknown",
        email: r.email ?? null,
        company: r.company_name ?? null,
      }));
  }, [cappedIds, results]);

  const mut = useMutation({
    mutationFn: () =>
      generateOutreachDrafts({
        data: {
          ticket_ids: cappedIds,
          event_context: ctx,
          angle: angle || undefined,
        },
      }),
    onSuccess: (r) => {
      const map: Record<string, { subject: string; body: string }> = {};
      for (const d of r.drafts ?? []) {
        map[d.ticket_id] = { subject: d.subject, body: d.body };
      }
      setDrafts(map);
      setOpen(false);
      setBulkOpen(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Button
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="bg-indigo-600 hover:bg-indigo-700 text-white"
      >
        <Sparkles className="h-4 w-4 mr-2" />
        Draft outreach
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Draft outreach for {Math.min(ticketIds.length, 25)} attendee
              {Math.min(ticketIds.length, 25) === 1 ? "" : "s"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Event context (what you're inviting them to)</Label>
              <Input
                value={ctx}
                onChange={(e) => setCtx(e.target.value)}
                placeholder="e.g. AI for Customer Support Summit, London, Mar 2027"
              />
            </div>
            <div>
              <Label>Angle (optional)</Label>
              <Input
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
                placeholder="e.g. how they scaled CS with AI in past 12 months"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              We&apos;ll generate one personalized draft per selected attendee, then
              open the send dialog so you can review and send each through your
              connected Gmail.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!ctx || mut.isPending}
              onClick={() => mut.mutate()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Generate drafts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkEmailDialog
        open={bulkOpen}
        onOpenChange={(o) => {
          setBulkOpen(o);
          if (!o) setDrafts(null);
        }}
        speakers={speakers}
        perRecipientDrafts={drafts ?? undefined}
        initialTemplate="custom"
      />
    </>
  );
}

function CompaniesCsvSlot({
  title,
  accent,
  list,
  fileName,
  onLoad,
  onClear,
}: {
  title: string;
  accent: "emerald" | "rose";
  list: string[];
  fileName: string | null;
  onLoad: (names: string[], fileName: string) => void;
  onClear: () => void;
}) {
  const inputId = `companies-csv-${accent}`;
  const accentBar =
    accent === "emerald"
      ? "bg-emerald-500"
      : "bg-rose-500";
  const accentText =
    accent === "emerald" ? "text-emerald-700" : "text-rose-700";

  async function handleFile(f: File) {
    const text = await f.text();
    const names = Array.from(
      new Set(
        text
          .split(/[\n,]/)
          .map((s) => s.trim().replace(/^"|"$/g, "").replace(/^"|"$/g, ""))
          .filter(Boolean)
          .filter(
            (v, i) => !(i === 0 && /^(company|company_?name|name)$/i.test(v)),
          ),
      ),
    );
    onLoad(names, f.name);
  }
  return (
    <div className="rounded-md border bg-slate-50/70 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", accentBar)} />
        <div className={cn("text-xs font-semibold uppercase tracking-wide", accentText)}>
          {title}
        </div>
        {list.length > 0 && (
          <span className="ml-auto text-[11px] text-slate-500">
            {list.length} companies{fileName ? ` · ${fileName}` : ""}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.currentTarget.value = "";
          }}
        />
        <Button asChild variant="outline" size="sm">
          <label htmlFor={inputId} className="cursor-pointer">
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {list.length ? "Replace CSV" : "Upload CSV"}
          </label>
        </Button>
        {list.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>
      <p className="text-[11px] text-slate-500">
        Plain CSV or single-column list. Header row (&quot;company&quot;) auto-skipped.
        Matches company_name case-insensitively.
      </p>
    </div>
  );
}

function EventFilterPanel() {
  const qc = useQueryClient();
  const filters = useQuery({
    queryKey: ["tito-event-filters"],
    queryFn: () => listTitoEventFilters(),
  });
  const preview = useQuery({
    queryKey: ["tito-event-preview"],
    queryFn: () => previewTitoEventClassification(),
    enabled: false,
  });
  const [slug, setSlug] = useState("");
  const [mode, setMode] = useState<"include" | "exclude">("include");
  const [notes, setNotes] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  async function add() {
    if (!slug.trim()) return;
    try {
      await addTitoEventFilter({
        data: { event_slug: slug.trim(), mode, notes: notes || undefined },
      });
      setSlug("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["tito-event-filters"] });
      qc.invalidateQueries({ queryKey: ["tito-event-preview"] });
      toast.success(`Added ${mode} rule for ${slug.trim()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add filter");
    }
  }

  async function remove(id: string) {
    try {
      await deleteTitoEventFilter({ data: { id } });
      qc.invalidateQueries({ queryKey: ["tito-event-filters"] });
      qc.invalidateQueries({ queryKey: ["tito-event-preview"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  const rows = filters.data ?? [];
  const includes = rows.filter((r) => r.mode === "include");
  const excludes = rows.filter((r) => r.mode === "exclude");

  return (
    <div className="rounded-lg border bg-slate-50/60 p-4">
      <div className="text-sm font-medium mb-2">
        Tito event filters — AIAI/CSC keyword rule + manual overrides
      </div>
      <div className="space-y-3 text-sm">
        <div className="rounded-md bg-white p-3 text-xs text-muted-foreground border">
          Default rule: only sync events whose title contains one of the AIAI/CSC keywords.
          Use the overrides below to force-include or force-exclude specific slugs when the
          keyword rule misses or wrongly catches an event.
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <Label>Event slug</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. generative-ai-summit-boston-2027"
            />
          </div>
          <div>
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "include" | "exclude")}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="include">Force include</SelectItem>
                <SelectItem value="exclude">Force exclude</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label>Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. rebranded, keyword misses it"
            />
          </div>
          <Button variant="outline" onClick={add}>Add rule</Button>
        </div>

        {(includes.length > 0 || excludes.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-1.5">
                Force include ({includes.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {includes.map((r) => (
                  <Badge key={r.id} variant="secondary" className="gap-1 bg-emerald-100 text-emerald-800">
                    {r.event_slug}
                    <button type="button" onClick={() => remove(r.id)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-rose-700 mb-1.5">
                Force exclude ({excludes.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {excludes.map((r) => (
                  <Badge key={r.id} variant="secondary" className="gap-1 bg-rose-100 text-rose-800">
                    {r.event_slug}
                    <button type="button" onClick={() => remove(r.id)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowPreview(true);
              preview.refetch();
            }}
            disabled={preview.isFetching}
          >
            {preview.isFetching && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Preview which events will sync
          </Button>
        </div>

        {showPreview && preview.data && (
          <div className="rounded-md border max-h-72 overflow-y-auto bg-white">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-1.5 text-left">Will sync</th>
                  <th className="p-1.5 text-left">Title</th>
                  <th className="p-1.5 text-left">Slug</th>
                  <th className="p-1.5 text-left">Why</th>
                </tr>
              </thead>
              <tbody>
                {preview.data.map((e) => (
                  <tr key={e.slug} className="border-t">
                    <td className="p-1.5">
                      {e.will_sync ? (
                        <Badge className="bg-emerald-600 text-white text-[10px]">Yes</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">No</Badge>
                      )}
                    </td>
                    <td className="p-1.5">{e.title}</td>
                    <td className="p-1.5 font-mono text-[10px] text-muted-foreground">
                      {e.slug}
                    </td>
                    <td className="p-1.5 text-muted-foreground">
                      {e.manual_exclude
                        ? "manual exclude"
                        : e.manual_include
                          ? "manual include"
                          : e.keyword_match
                            ? "keyword match"
                            : "not AIAI/CSC"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
