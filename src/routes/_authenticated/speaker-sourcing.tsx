import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  syncTito,
  titoConnectionStatus,
  listTitoEvents,
  listReleaseTitles,
  searchTitoTickets,
  listExcludedCompanies,
  addExcludedCompany,
  deleteExcludedCompany,
  tagAsSpeakerCandidates,
  generateOutreachDrafts,
} from "@/lib/tito.functions";
import { listEvents } from "@/lib/events.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, RefreshCw, Trash2, Sparkles, Copy, X } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/speaker-sourcing")({
  component: SpeakerSourcingPage,
});

function SpeakerSourcingPage() {
  const qc = useQueryClient();
  const conn = useQuery({ queryKey: ["tito-conn"], queryFn: () => titoConnectionStatus() });
  const titoEvents = useQuery({ queryKey: ["tito-events"], queryFn: () => listTitoEvents() });
  const releaseTitles = useQuery({ queryKey: ["tito-releases"], queryFn: () => listReleaseTitles() });
  const excluded = useQuery({ queryKey: ["excluded-companies"], queryFn: () => listExcludedCompanies() });
  const upcomingEvents = useQuery({ queryKey: ["events"], queryFn: () => listEvents() });

  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [selectedEventSlugs, setSelectedEventSlugs] = useState<string[]>([]);
  const [includeReleases, setIncludeReleases] = useState<string[]>([]);
  const [excludeReleases, setExcludeReleases] = useState<string[]>([]);
  const [applyExclude, setApplyExclude] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const search = useMutation({
    mutationFn: () =>
      searchTitoTickets({
        data: {
          job_title: jobTitle || undefined,
          company: company || undefined,
          event_slugs: selectedEventSlugs.length ? selectedEventSlugs : undefined,
          release_titles_include: includeReleases.length ? includeReleases : undefined,
          release_titles_exclude: excludeReleases.length ? excludeReleases : undefined,
          apply_exclude_list: applyExclude,
          limit: 1000,
        },
      }),
  });

  const sync = useMutation({
    mutationFn: () => syncTito(),
    onSuccess: (r) => {
      toast.success(`Synced ${r.events} events, ${r.tickets} tickets, ${r.answers} answers`);
      qc.invalidateQueries({ queryKey: ["tito-events"] });
      qc.invalidateQueries({ queryKey: ["tito-releases"] });
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

  return (
    <div className="mx-auto max-w-[1400px] p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Speaker sourcing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search past &amp; future Tito attendees to find speaker candidates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {conn.data && !conn.data.connected ? (
            <Badge variant="destructive">TITO_API_TOKEN missing</Badge>
          ) : (
            <Badge variant="outline">Connected</Badge>
          )}
          <Button onClick={() => sync.mutate()} disabled={sync.isPending || !conn.data?.connected}>
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

      {/* Filters */}
      <div className="rounded-lg border bg-background p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Job title contains</Label>
            <Input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Head of Customer Success"
            />
          </div>
          <div>
            <Label>Company contains</Label>
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Zendesk"
            />
          </div>
        </div>

        <MultiSelect
          label="Events (Tito)"
          options={(titoEvents.data ?? []).map((e) => ({ value: e.slug, label: e.title }))}
          selected={selectedEventSlugs}
          onChange={setSelectedEventSlugs}
          placeholder="All events"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={applyExclude}
              onCheckedChange={(v) => setApplyExclude(Boolean(v))}
            />
            Apply sponsor/competitor exclude list ({excluded.data?.length ?? 0} companies)
          </label>
          <Button onClick={() => search.mutate()} disabled={search.isPending}>
            {search.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Search
          </Button>
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
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground sticky top-0">
              <tr>
                <th className="p-2 w-8">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => {
                      if (v) setSelected(new Set(results.map((r) => r.id)));
                      else setSelected(new Set());
                    }}
                  />
                </th>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Email</th>
                <th className="p-2 text-left">Company</th>
                <th className="p-2 text-left">Job title</th>
                <th className="p-2 text-left">Ticket type</th>
                <th className="p-2 text-left">Event</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-2">
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="p-2 font-medium">{r.name ?? "—"}</td>
                  <td className="p-2 text-muted-foreground">{r.email ?? "—"}</td>
                  <td className="p-2">{r.company_name ?? "—"}</td>
                  <td className="p-2">{r.job_title ?? "—"}</td>
                  <td className="p-2">
                    <Badge variant="outline">{r.release_title ?? "—"}</Badge>
                  </td>
                  <td className="p-2 text-muted-foreground">{r.event_title ?? r.event_slug}</td>
                </tr>
              ))}
              {results.length === 0 && !search.isPending && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No results yet — set filters and click Search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
