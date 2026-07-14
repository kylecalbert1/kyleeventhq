import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  syncTito,
  titoConnectionStatus,
  listTitoEvents,
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
} from "@/lib/tito.functions";
import { listEvents } from "@/lib/events.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, RefreshCw, Trash2, Sparkles, Copy, X, Search, ChevronDown } from "lucide-react";
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



export const Route = createFileRoute("/_authenticated/speaker-sourcing")({
  component: SpeakerSourcingPage,
});

function SpeakerSourcingPage() {
  const qc = useQueryClient();
  const conn = useQuery({ queryKey: ["tito-conn"], queryFn: () => titoConnectionStatus() });
  const titoEvents = useQuery({ queryKey: ["tito-events"], queryFn: () => listTitoEvents() });
  const releaseTitles = useQuery({ queryKey: ["tito-releases"], queryFn: () => listReleaseTitles() });
  const excluded = useQuery({ queryKey: ["excluded-companies"], queryFn: () => listExcludedCompanies() });
  const years = useQuery({ queryKey: ["tito-event-years"], queryFn: () => listTitoEventYears() });
  const upcomingEvents = useQuery({ queryKey: ["events"], queryFn: () => listEvents() });

  const [q, setQ] = useState("");
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [selectedEventSlugs, setSelectedEventSlugs] = useState<string[]>([]);
  const [includeReleases, setIncludeReleases] = useState<string[]>([]);
  const [excludeReleases, setExcludeReleases] = useState<string[]>([]);
  const [applyExclude, setApplyExclude] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [forceFullSync, setForceFullSync] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [detailAttendee, setDetailAttendee] = useState<TitoAttendee | null>(null);


  // Autocomplete suggestions for the unified search box
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

  const search = useMutation({
    mutationFn: () =>
      searchTitoTickets({
        data: {
          q: q.trim() || undefined,
          event_slugs: selectedEventSlugs.length ? selectedEventSlugs : undefined,
          release_titles_include: includeReleases.length ? includeReleases : undefined,
          release_titles_exclude: excludeReleases.length ? excludeReleases : undefined,
          years: selectedYears.length ? selectedYears : undefined,
          apply_exclude_list: applyExclude,
          limit: 1000,
        },
      }),
  });

  const sync = useMutation({
    mutationFn: (force: boolean) => syncTito({ data: { force } }),
    onSuccess: (r) => {
      toast.success(
        `Synced ${r.events} AIAI/CSC events (skipped ${r.events_skipped} other-brand${r.events_ticket_fetch_skipped ? `, ${r.events_ticket_fetch_skipped} past events unchanged` : ""}), ${r.tickets} tickets, ${r.answers} answers${r.forced ? " · full re-sync" : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["tito-events"] });
      qc.invalidateQueries({ queryKey: ["tito-releases"] });
      qc.invalidateQueries({ queryKey: ["tito-event-years"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const results = search.data ?? [];
  const allSelected = results.length > 0 && results.every((r) => selected.has(r.id));

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

  return (
    <div className="mx-auto max-w-[1400px] p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Speaker sourcing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search past &amp; future Tito attendees to find speaker candidates.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {conn.data && !conn.data.connected ? (
            <Badge variant="destructive">TITO_API_TOKEN missing</Badge>
          ) : (
            <Badge variant="outline">Connected</Badge>
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <Checkbox
              checked={forceFullSync}
              onCheckedChange={(v) => setForceFullSync(Boolean(v))}
            />
            Force full re-sync
          </label>
          <Button onClick={() => sync.mutate(forceFullSync)} disabled={sync.isPending || !conn.data?.connected}>
            {sync.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sync now
          </Button>
        </div>
      </div>

      {!conn.data?.connected && (
        <div className="rounded-lg border bg-amber-50 text-amber-900 p-4 text-sm">
          Add <code>TITO_API_TOKEN</code> in Project Settings → Secrets, then click <b>Sync now</b>.
        </div>
      )}

      {/* Compact filter bar */}
      <div className="rounded-lg border bg-background p-3 space-y-3">
        {/* Unified search + autocomplete */}
        <div className="flex gap-2 items-start">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
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
              placeholder="Search name, email, company, or job title…"
              className="pl-9 h-10"
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
          <Button onClick={runSearch} disabled={search.isPending} className="h-10">
            {search.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Search
          </Button>
        </div>

        {/* Year chips */}
        {(years.data?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">Year</span>
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
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted text-muted-foreground border-border",
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
                className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
              >
                clear
              </button>
            )}
          </div>
        )}

        {/* More filters (collapsed) */}
        <div>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showMore && "rotate-180")} />
            More filters
            {(selectedEventSlugs.length > 0 || includeReleases.length > 0 || excludeReleases.length > 0 || !applyExclude) && (
              <span className="ml-1 rounded-full bg-primary/10 text-primary text-[10px] px-1.5 py-0.5">
                {selectedEventSlugs.length + includeReleases.length + excludeReleases.length + (!applyExclude ? 1 : 0)}
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
            </div>
          )}
        </div>
      </div>

      {/* Exclude list manager */}
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

      {/* Event filter overrides */}
      <EventFilterPanel />

      {/* Results */}
      <div className="rounded-lg border bg-background overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-medium">
            {results.length} results{selected.size > 0 ? ` · ${selected.size} selected` : ""}
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
              }}
            />
            <DraftButton
              disabled={selected.size === 0}
              ticketIds={Array.from(selected)}
            />
          </div>
        </div>
        <div className="p-3 max-h-[70vh] overflow-y-auto">
          {results.length === 0 && !search.isPending ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {search.data === undefined
                ? `Ready to search ${(titoEvents.data ?? []).length.toLocaleString()} synced events. Type a name / company / job title above and hit Search.`
                : "No attendees matched these filters. Try broadening your search or clearing year filters."}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {results.map((r) => (
                <TitoAttendeeCard
                  key={r.id}
                  a={r}
                  selected={selected.has(r.id)}
                  onToggle={() => toggle(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


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
        <Select
          value=""
          onValueChange={(v) => v && onChange([...selected, v])}
        >
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
          {open && query.trim() && suggestions.length === 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-md border bg-popover shadow-md px-3 py-2 text-xs text-muted-foreground">
              No matches
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
    <details className="rounded-lg border bg-background p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Sponsor / competitor exclude list ({rows.length})
      </summary>
      <div className="mt-3 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Company name"
        />
        <Button
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
    </details>
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
    mutationFn: () => tagAsSpeakerCandidates({ data: { event_id: eventId, ticket_ids: ticketIds } }),
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
              These will appear in the Speakers pipeline with status <b>contacted</b> and source
              <b> tito_candidate</b>. No email is sent.
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

function DraftButton({ disabled, ticketIds }: { disabled: boolean; ticketIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState("");
  const [angle, setAngle] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      generateOutreachDrafts({
        data: { ticket_ids: ticketIds.slice(0, 25), event_context: ctx, angle: angle || undefined },
      }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <Button disabled={disabled} onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4 mr-2" />
        Draft outreach
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate outreach drafts ({Math.min(ticketIds.length, 25)})</DialogTitle>
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
            <div className="flex justify-end">
              <Button disabled={!ctx || mut.isPending} onClick={() => mut.mutate()}>
                {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Generate
              </Button>
            </div>
            {mut.data?.drafts?.map((d) => (
              <div key={d.ticket_id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {d.name} <span className="text-muted-foreground">· {d.company ?? ""}</span>
                    <div className="text-xs text-muted-foreground">{d.email ?? "no email on file"}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(`Subject: ${d.subject}\n\n${d.body}`);
                      toast.success("Copied");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                </div>
                <div className="text-xs font-medium">Subject: {d.subject}</div>
                <Textarea defaultValue={d.body} rows={6} />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Drafts only. Copy and send yourself — nothing is emailed from this app.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
    <details className="rounded-lg border bg-background p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Tito event filters — AIAI/CSC keyword rule + manual overrides
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
          Default rule: only sync events whose title contains one of the AIAI/CSC
          keywords (case-insensitive substring): "Generative AI Summit",
          "Agentic AI", "Chief AI Officer Summit", "Customer Success Summit",
          "Chief Customer Officer Summit", "Customer Support Summit". Use the
          overrides below to force-include or force-exclude specific slugs when
          the keyword rule misses or wrongly catches an event.
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
          <Button onClick={add}>Add rule</Button>
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
                {includes.length === 0 && (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
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
                {excludes.length === 0 && (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
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
          <div className="rounded-md border max-h-72 overflow-y-auto">
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
    </details>
  );
}

