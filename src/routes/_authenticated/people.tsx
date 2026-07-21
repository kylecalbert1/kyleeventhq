import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Users, Search, X, Settings2, Sparkles, ExternalLink } from "lucide-react";
import {
  listPeople,
  tagPersonForEvent,
  listTitoEventsAdmin,
  updateTitoEventBusinessLine,
  type PersonRow,
} from "@/lib/people.functions";
import { eventsQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  q: z.string().optional(),
  bl: z.enum(["any", "AIAI", "CSC", "other"]).optional(),
  yr: z.string().optional(),
  status: z.enum(["any", "past_speaker", "confirmed", "in_tracker", "not_in_tracker"]).optional(),
  release: z.enum(["any", "speaker", "attendee"]).optional(),
  other: z.enum(["1"]).optional(),
});

export const peopleQuery = (includeOther: boolean) =>
  queryOptions({
    queryKey: ["people", includeOther],
    queryFn: () => listPeople({ data: { include_other: includeOther } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/_authenticated/people")({
  validateSearch: searchSchema,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(eventsQuery),
      context.queryClient.ensureQueryData(peopleQuery(false)),
    ]),
  component: PeoplePage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8 text-sm">No people found.</div>,
});

function PeoplePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const includeOther = search.other === "1";
  const people = useQuery(peopleQuery(includeOther));
  const events = useQuery(eventsQuery);

  const q = (search.q ?? "").trim();
  const bl = search.bl ?? "any";
  const yr = search.yr ?? "any";
  const statusF = search.status ?? "any";
  const releaseF = search.release ?? "any";

  const [profile, setProfile] = useState<PersonRow | null>(null);
  const [tagTarget, setTagTarget] = useState<PersonRow[] | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const rows = people.data ?? [];

  const years = useMemo(() => {
    const s = new Set<string>();
    for (const p of rows) {
      for (const a of p.appearances) {
        if (a.event_start) s.add(new Date(a.event_start).getUTCFullYear().toString());
      }
    }
    return Array.from(s).sort((a, b) => Number(b) - Number(a));
  }, [rows]);

  // Terms → AND search across name/company/email.
  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const yearNum = yr !== "any" ? Number(yr) : null;
    return rows.filter((p) => {
      if (bl !== "any" && !p.appearances.some((a) => a.business_line === bl)) return false;
      if (yearNum) {
        const hasYear = p.appearances.some(
          (a) =>
            a.event_start && new Date(a.event_start).getUTCFullYear() === yearNum,
        );
        if (!hasYear) return false;
      }
      if (releaseF === "speaker") {
        const has = p.appearances.some(
          (a) =>
            (a.release_title ?? "").toLowerCase().includes("speaker") ||
            a.tracker_status === "confirmed",
        );
        if (!has) return false;
      }
      if (releaseF === "attendee") {
        const has = p.appearances.some(
          (a) =>
            a.kind === "tito" &&
            !(a.release_title ?? "").toLowerCase().includes("speaker"),
        );
        if (!has) return false;
      }
      if (statusF === "past_speaker" && !p.is_past_speaker) return false;
      if (statusF === "confirmed" && !p.is_confirmed_anywhere) return false;
      if (statusF === "in_tracker" && !p.appearances.some((a) => a.kind === "tracker"))
        return false;
      if (statusF === "not_in_tracker" && p.appearances.some((a) => a.kind === "tracker"))
        return false;
      if (terms.length) {
        const hay = `${p.name} ${p.companies.join(" ")} ${p.emails.join(" ")} ${p.job_titles.join(" ")}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [rows, q, bl, yr, statusF, releaseF]);

  // Counts per filter option — computed against the *other* filters so each
  // dropdown shows the count you'd see if you flipped just that one.
  const counts = useMemo(() => {
    const c = {
      status: { any: 0, past_speaker: 0, confirmed: 0, in_tracker: 0, not_in_tracker: 0 } as Record<string, number>,
      release: { any: 0, speaker: 0, attendee: 0 } as Record<string, number>,
      bl: { any: 0, AIAI: 0, CSC: 0, other: 0 } as Record<string, number>,
      year: {} as Record<string, number>,
    };
    for (const p of filtered) {
      c.status.any++;
      if (p.is_past_speaker) c.status.past_speaker++;
      if (p.is_confirmed_anywhere) c.status.confirmed++;
      if (p.appearances.some((a) => a.kind === "tracker")) c.status.in_tracker++;
      else c.status.not_in_tracker++;
      c.release.any++;
      if (p.appearances.some((a) => (a.release_title ?? "").toLowerCase().includes("speaker") || a.tracker_status === "confirmed")) c.release.speaker++;
      if (p.appearances.some((a) => a.kind === "tito" && !(a.release_title ?? "").toLowerCase().includes("speaker"))) c.release.attendee++;
      c.bl.any++;
      const lines = new Set(p.appearances.map((a) => a.business_line));
      if (lines.has("AIAI")) c.bl.AIAI++;
      if (lines.has("CSC")) c.bl.CSC++;
      if (lines.has("other")) c.bl.other++;
      const ys = new Set(
        p.appearances
          .map((a) => (a.event_start ? new Date(a.event_start).getUTCFullYear().toString() : null))
          .filter((x): x is string => !!x),
      );
      for (const y of ys) c.year[y] = (c.year[y] ?? 0) + 1;
    }
    return c;
  }, [filtered]);

  const activeFilterCount =
    (q ? 1 : 0) +
    (bl !== "any" ? 1 : 0) +
    (yr !== "any" ? 1 : 0) +
    (statusF !== "any" ? 1 : 0) +
    (releaseF !== "any" ? 1 : 0);

  const patch = (k: string, v: string | null) => {
    navigate({
      search: (prev) => {
        const next = { ...prev } as any;
        if (!v) delete next[k];
        else next[k] = v;
        return next;
      },
    });
  };

  const clearAll = () => navigate({ search: {} });

  const selectedRows = filtered.filter((p) => selected[p.key]);

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 animate-fade-in">
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="accent-bar mb-3" />
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            People
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everyone we've ever seen — merged across the speaker tracker and every synced Tito event.
            Search once, filter once.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setAdminOpen(true)}>
            <Settings2 className="h-4 w-4 mr-1.5" />
            Manage event tags
          </Button>
        </div>
      </div>

      {/* Single search + one filter row. Hard rule for the whole app. */}
      <div className="mb-4 relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          className="pl-10 h-11 rounded-xl bg-white border-slate-200 shadow-sm"
          placeholder="Search name, company or email…"
          value={q}
          onChange={(e) => patch("q", e.target.value || null)}
        />
      </div>

      <Card className="p-3 mb-6 rounded-xl border-slate-200/70 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusF} onValueChange={(v) => patch("status", v === "any" ? null : v)}>
            <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All statuses ({counts.status.any})</SelectItem>
              <SelectItem value="past_speaker">Past speaker ({counts.status.past_speaker})</SelectItem>
              <SelectItem value="confirmed">Confirmed anywhere ({counts.status.confirmed})</SelectItem>
              <SelectItem value="in_tracker">In tracker ({counts.status.in_tracker})</SelectItem>
              <SelectItem value="not_in_tracker">Not in tracker ({counts.status.not_in_tracker})</SelectItem>
            </SelectContent>
          </Select>

          <Select value={releaseF} onValueChange={(v) => patch("release", v === "any" ? null : v)}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All pass types ({counts.release.any})</SelectItem>
              <SelectItem value="speaker">Speaker pass / confirmed ({counts.release.speaker})</SelectItem>
              <SelectItem value="attendee">Attendee pass ({counts.release.attendee})</SelectItem>
            </SelectContent>
          </Select>

          <Select value={bl} onValueChange={(v) => patch("bl", v === "any" ? null : v)}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All lines ({counts.bl.any})</SelectItem>
              <SelectItem value="AIAI">AIAI ({counts.bl.AIAI})</SelectItem>
              <SelectItem value="CSC">CSC ({counts.bl.CSC})</SelectItem>
              {includeOther && <SelectItem value="other">Other ({counts.bl.other})</SelectItem>}
            </SelectContent>
          </Select>

          <Select value={yr} onValueChange={(v) => patch("yr", v === "any" ? null : v)}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any year</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y}>{y} ({counts.year[y] ?? 0})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer px-1">
            <Checkbox
              checked={includeOther}
              onCheckedChange={(v) => patch("other", v ? "1" : null)}
            />
            Include non-AIAI/CSC events
          </label>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="h-8">
              <X className="h-3.5 w-3.5 mr-1" /> Clear ({activeFilterCount})
            </Button>
          )}
          <div className="ml-auto text-xs text-muted-foreground tabular-nums">
            {filtered.length.toLocaleString()} people
          </div>
        </div>
      </Card>

      {/* Selection bar */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-out",
          selectedRows.length > 0 ? "max-h-24 opacity-100 mb-4" : "max-h-0 opacity-0 mb-0",
        )}
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 shadow-sm">
          <div className="text-sm font-medium">
            {selectedRows.length} selected
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelected({})}>Clear</Button>
            <Button size="sm" onClick={() => setTagTarget(selectedRows)}>
              <Sparkles className="h-4 w-4 mr-1.5" />
              Tag for future event
            </Button>
          </div>
        </div>
      </div>

      {people.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading directory…</div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground rounded-2xl">
          Nobody matches these filters.
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 500).map((p) => (
            <PersonRowCard
              key={p.key}
              p={p}
              selected={!!selected[p.key]}
              onToggle={(v) => setSelected({ ...selected, [p.key]: v })}
              onOpen={() => setProfile(p)}
              onTag={() => setTagTarget([p])}
            />
          ))}
          {filtered.length > 500 && (
            <div className="text-center text-xs text-muted-foreground py-3">
              Showing first 500 of {filtered.length}. Narrow filters to see more.
            </div>
          )}
        </div>
      )}

      <ProfileDialog
        person={profile}
        onOpenChange={(o) => !o && setProfile(null)}
        onTag={(p) => {
          setProfile(null);
          setTagTarget([p]);
        }}
      />
      <TagDialog
        people={tagTarget}
        onOpenChange={(o) => !o && setTagTarget(null)}
        events={events.data ?? []}
      />
      <TitoEventAdminDialog
        open={adminOpen}
        onOpenChange={setAdminOpen}
      />
    </div>
  );
}

/* ────────────────────────── Row card ────────────────────────── */

function PersonRowCard({
  p,
  selected,
  onToggle,
  onOpen,
  onTag,
}: {
  p: PersonRow;
  selected: boolean;
  onToggle: (v: boolean) => void;
  onOpen: () => void;
  onTag: () => void;
}) {
  const otherEvents = Math.max(0, p.event_count - 1);
  return (
    <Card
      className={cn(
        "px-4 py-3 rounded-xl border-slate-200/70 hover:shadow-md transition-shadow cursor-pointer flex items-center gap-3",
        selected && "ring-2 ring-primary/40 bg-primary/5",
      )}
      onClick={onOpen}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={(v) => onToggle(!!v)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm font-semibold truncate">{p.name}</div>
          {p.is_past_speaker && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
              Past speaker
            </span>
          )}
          {p.is_confirmed_anywhere && !p.is_past_speaker && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">
              Confirmed
            </span>
          )}
          {p.possibleDuplicateOfKey && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded" title="Same name found under a different email">
              Possible duplicate
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {[p.primary_job_title, p.primary_company].filter(Boolean).join(" · ") || "—"}
          {p.primary_email && <> · {p.primary_email}</>}
        </div>
      </div>
      <div className="hidden sm:flex flex-col items-end gap-1 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {p.event_count} event{p.event_count === 1 ? "" : "s"}
          {otherEvents > 0 && p.event_count > 1 && (
            <span className="ml-1 text-[10px] text-slate-500">({otherEvents} other)</span>
          )}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={(e) => {
          e.stopPropagation();
          onTag();
        }}
      >
        Tag for event
      </Button>
    </Card>
  );
}

/* ────────────────────────── Profile ────────────────────────── */

function ProfileDialog({
  person,
  onOpenChange,
  onTag,
}: {
  person: PersonRow | null;
  onOpenChange: (o: boolean) => void;
  onTag: (p: PersonRow) => void;
}) {
  if (!person) return null;
  return (
    <Dialog open={!!person} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{person.name}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground space-y-1">
          {person.primary_job_title && <div>{person.primary_job_title}</div>}
          {person.companies.length > 0 && (
            <div>{person.companies.join(" · ")}</div>
          )}
          {person.emails.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {person.emails.map((e) => (
                <a key={e} href={`mailto:${e}`} className="text-primary hover:underline">
                  {e}
                </a>
              ))}
            </div>
          )}
          {person.possibleDuplicateOfKey && (
            <div className="mt-1 text-amber-700">
              We found another person with the same name under a different email — check if they should be merged.
            </div>
          )}
        </div>
        <div className="overflow-y-auto flex-1 mt-3 pr-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Event history ({person.event_count})
          </div>
          <div className="space-y-2">
            {person.appearances.map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-3 border border-slate-200/70 rounded-lg px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.event_title}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                    {a.event_start && <span>{new Date(a.event_start).toLocaleDateString()}</span>}
                    {a.business_line && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">{a.business_line}</span>
                    )}
                    {a.release_title && (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5",
                          a.release_title.toLowerCase().includes("speaker")
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100",
                        )}
                      >
                        {a.release_title}
                      </span>
                    )}
                    {a.tracker_status && (
                      <span className="rounded bg-sky-100 text-sky-800 px-1.5 py-0.5">
                        Tracker: {a.tracker_status}
                      </span>
                    )}
                    {a.is_past && <span className="text-slate-400">past</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => onTag(person)}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            Tag for future event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────── Tag dialog ────────────────────────── */

function TagDialog({
  people,
  events,
  onOpenChange,
}: {
  people: PersonRow[] | null;
  events: any[];
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [target, setTarget] = useState("");
  const tagFn = useServerFn(tagPersonForEvent);
  const mut = useMutation({
    mutationFn: async () => {
      if (!people || !target) throw new Error("Pick an event");
      const results = await Promise.all(
        people.map((p) =>
          tagFn({
            data: {
              target_event_id: target,
              name: p.name,
              email: p.primary_email,
              company: p.primary_company,
              title: p.primary_job_title,
              source_note: p.is_past_speaker
                ? `Past speaker at ${
                    people[0].appearances.find((a) => a.is_past && (a.release_title ?? "").toLowerCase().includes("speaker") || a.tracker_status === "confirmed")?.event_title ?? "a prior event"
                  }`
                : null,
            },
          }),
        ),
      );
      return results;
    },
    onSuccess: (results) => {
      const added = results.filter((r) => !r.existing).length;
      const skipped = results.length - added;
      toast.success(
        `Tagged ${added} as prospects${skipped > 0 ? ` (${skipped} already on this event)` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["speakers"] });
      qc.invalidateQueries({ queryKey: ["eventSummaries"] });
      onOpenChange(false);
      setTarget("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => !e.event_date || e.event_date >= today);

  if (!people) return null;
  return (
    <Dialog open={!!people} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Tag {people.length === 1 ? people[0].name : `${people.length} people`} for an event
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Creates prospective speaker records on the selected event. Source will be set to "directory".
          </p>
          <SearchableSelect
            triggerClassName="w-full h-10"
            placeholder="Pick a future event…"
            searchPlaceholder="Search events…"
            value={target}
            onValueChange={setTarget}
            options={upcoming.map((e) => ({
              value: e.id,
              label: `${e.code} — ${e.name}`,
              keywords: e.name,
            }))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!target || mut.isPending}>
            {mut.isPending ? "Tagging…" : "Tag as prospect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────── Tito event admin ────────────────────────── */

function TitoEventAdminDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["titoEventsAdmin"],
    queryFn: () => listTitoEventsAdmin(),
    enabled: open,
  });
  const updateFn = useServerFn(updateTitoEventBusinessLine);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const rows = useMemo(() => {
    const term = q.toLowerCase();
    return (list.data ?? []).filter((r) =>
      !term || r.title.toLowerCase().includes(term) || r.slug.toLowerCase().includes(term),
    );
  }, [list.data, q]);

  async function change(id: string, v: "AIAI" | "CSC" | "other") {
    setSaving(id);
    try {
      await updateFn({ data: { id, business_line: v } });
      qc.invalidateQueries({ queryKey: ["titoEventsAdmin"] });
      qc.invalidateQueries({ queryKey: ["people"] });
      toast.success("Updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Tito event tags</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Auto-tagged from event title. Fix any misclassified events here.
        </p>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            className="pl-10 h-10"
            placeholder="Search Tito events…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="overflow-y-auto flex-1 divide-y">
          {list.isLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    {r.title}
                    <a
                      href={`https://ti.to/sequel-media/${r.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground hover:text-primary"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.slug}
                    {r.start_date && <> · {new Date(r.start_date).toLocaleDateString()}</>}
                  </div>
                </div>
                <Select
                  value={r.business_line}
                  onValueChange={(v) => change(r.id, v as any)}
                  disabled={saving === r.id}
                >
                  <SelectTrigger className="w-32 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AIAI">AIAI</SelectItem>
                    <SelectItem value="CSC">CSC</SelectItem>
                    <SelectItem value="other">other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
