import { SearchableSelect } from "@/components/ui/searchable-select";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTitoEventDetail, tagAsSpeakerCandidates, generateOutreachDrafts } from "@/lib/tito.functions";
import { listEvents } from "@/lib/events.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Search, X, Users, CalendarDays, Loader2, Sparkles, Mail } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TitoAttendeeCard, type TitoAttendee } from "@/components/tito/TitoAttendeeCard";
import { TitoAttendeeDetailDialog } from "@/components/tito/TitoAttendeeDetailDialog";
import { BulkEmailDialog } from "@/components/BulkEmailDialog";
import { useContactHistory, useTrackedByEmails } from "@/hooks/use-contact-history";


export const Route = createFileRoute("/_authenticated/tito/$slug")({
  component: TitoEventDetail,
});

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

function TitoEventDetail() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["tito-event-detail", slug],
    queryFn: () => getTitoEventDetail({ data: { slug } }),
  });
  const upcomingEvents = useQuery({ queryKey: ["events"], queryFn: () => listEvents() });

  const [q, setQ] = useState("");
  const [releaseFilter, setReleaseFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<"all" | "tagged" | "untagged">("all");
  const [contactFilter, setContactFilter] = useState<"all" | "never" | "contacted">("all");
  const [hideTracked, setHideTracked] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailAttendee, setDetailAttendee] = useState<TitoAttendee | null>(null);


  const event = data?.event;
  const tickets = data?.tickets ?? [];

  const releaseTitles = useMemo(() => {
    const s = new Set<string>();
    for (const t of tickets) if (t.release_title) s.add(t.release_title);
    return Array.from(s).sort();
  }, [tickets]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return tickets.filter((t) => {
      if (releaseFilter !== "all" && t.release_title !== releaseFilter) return false;
      const isTagged = ((t as TitoAttendee).tagged_events ?? []).length > 0;
      if (tagFilter === "tagged" && !isTagged) return false;
      if (tagFilter === "untagged" && isTagged) return false;
      if (!term) return true;
      const hay = `${t.name ?? ""} ${t.email ?? ""} ${t.company_name ?? ""} ${t.job_title ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [tickets, q, releaseFilter, tagFilter]);

  const attendeeEmails = useMemo(
    () => tickets.map((t) => t.email as string | null),
    [tickets],
  );
  const { lookup: lookupHistory } = useContactHistory(attendeeEmails);
  const { lookup: lookupTracked } = useTrackedByEmails(attendeeEmails);


  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  function toggle(id: string, v: boolean) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  const hasFilters = q.trim() !== "" || releaseFilter !== "all";

  return (
    <div className="p-6 md:p-8 animate-fade-in space-y-6">
      <div>
        <Link
          to="/speaker-sourcing"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Speaker Prospecting
        </Link>
      </div>

      {isLoading || !event ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : (
        <>
          <Card className="relative overflow-hidden">
            <span
              className={cn(
                "absolute left-0 top-0 bottom-0 w-1",
                event.brand === "AIAI"
                  ? "bg-violet-500"
                  : event.brand === "CSC"
                    ? "bg-sky-500"
                    : "bg-slate-300",
              )}
            />
            <div className="p-6 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  className={cn(
                    "font-medium",
                    event.brand === "AIAI"
                      ? "bg-violet-100 text-violet-800 hover:bg-violet-100"
                      : event.brand === "CSC"
                        ? "bg-sky-100 text-sky-800 hover:bg-sky-100"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-100",
                  )}
                >
                  {event.brand}
                </Badge>
                {event.is_past ? (
                  <Badge variant="outline" className="text-slate-500">Past</Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">
                    Upcoming
                  </Badge>
                )}
                <span className="font-mono text-[11px] text-muted-foreground">{event.slug}</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
              <div className="flex items-center gap-6 text-sm text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  {formatDate(event.start_date)}
                  {event.end_date && event.end_date !== event.start_date
                    ? ` – ${formatDate(event.end_date)}`
                    : ""}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-slate-400" />
                  {tickets.length.toLocaleString()} registered
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-9"
                  placeholder="Search name, email, company, job title"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <Select value={releaseFilter} onValueChange={setReleaseFilter}>
                <SelectTrigger className="w-56 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ticket types</SelectItem>
                  {releaseTitles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQ("");
                    setReleaseFilter("all");
                  }}
                  className="h-8"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              )}
            </div>
          </Card>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => {
                    if (v) setSelected(new Set(filtered.map((r) => r.id)));
                    else setSelected(new Set());
                  }}
                />
                Select all visible
              </label>
              <div className="inline-flex rounded-md border bg-white p-0.5 text-xs">
                {(["all", "tagged", "untagged"] as const).map((k) => {
                  const label = k === "all" ? "All" : k === "tagged" ? "Tagged" : "Not tagged yet";
                  const count =
                    k === "all"
                      ? tickets.length
                      : k === "tagged"
                        ? tickets.filter((t) => ((t as TitoAttendee).tagged_events ?? []).length > 0).length
                        : tickets.filter((t) => ((t as TitoAttendee).tagged_events ?? []).length === 0).length;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setTagFilter(k)}
                      className={cn(
                        "px-2.5 py-1 rounded font-medium transition-colors",
                        tagFilter === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100",
                      )}
                    >
                      {label} <span className="tabular-nums opacity-80">({count})</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-sm text-muted-foreground tabular-nums">
                {filtered.length} of {tickets.length}
                {selected.size > 0 ? ` · ${selected.size} selected` : ""}
              </div>
            </div>
            <div className="flex gap-2">
              <TagButton
                disabled={selected.size === 0}
                ticketIds={Array.from(selected)}
                events={(upcomingEvents.data ?? []).map((e) => ({ id: e.id, title: e.name }))}
                onDone={() => {
                  setSelected(new Set());
                  qc.invalidateQueries({ queryKey: ["tito-event-detail", slug] });
                  qc.invalidateQueries({ queryKey: ["tito-events-with-stats"] });
                  qc.invalidateQueries({ queryKey: ["speakers"] });
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
                tickets={filtered as TitoAttendee[]}
              />
            </div>
          </div>


          {filtered.length === 0 ? (
            <Card className="p-12 text-center text-sm text-muted-foreground">
              No attendees match these filters.
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map((t) => (
                <TitoAttendeeCard
                  key={t.id}
                  a={t as TitoAttendee}
                  selected={selected.has(t.id)}
                  onToggle={(v) => toggle(t.id, v)}
                  onOpenDetail={() => setDetailAttendee(t as TitoAttendee)}
                  onEmail={() => {
                    if (t.email) window.location.href = `mailto:${t.email}`;
                  }}
                  onAddNote={() => setDetailAttendee(t as TitoAttendee)}
                  showEvent={false}
                  history={lookupHistory(t.email)}
                  trackedIn={lookupTracked(t.email)}
                />
              ))}
            </div>
          )}

          <TitoAttendeeDetailDialog
            attendee={detailAttendee}
            open={!!detailAttendee}
            onOpenChange={(v) => { if (!v) setDetailAttendee(null); }}
          />

          <BulkEmailDialog
            open={composeOpen}
            onOpenChange={setComposeOpen}
            speakers={filtered
              .filter((t) => selected.has(t.id))
              .map((t) => ({
                id: t.id,
                name: t.name ?? "Unknown",
                email: t.email ?? null,
                company: t.company_name ?? null,
              }))}
            initialTemplate="custom"
          />
        </>
      )}
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
            <SearchableSelect
              triggerClassName="w-full"
              placeholder="Choose event…"
              searchPlaceholder="Search events…"
              value={eventId}
              onValueChange={setEventId}
              options={events.map((e) => ({ value: e.id, label: e.title }))}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
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
  tickets,
}: {
  disabled: boolean;
  ticketIds: string[];
  tickets: TitoAttendee[];
}) {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState("");
  const [angle, setAngle] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }> | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const cappedIds = useMemo(() => ticketIds.slice(0, 25), [ticketIds]);

  const speakers = useMemo(() => {
    const idSet = new Set(cappedIds);
    return tickets
      .filter((t) => idSet.has(t.id))
      .map((t) => ({
        id: t.id,
        name: t.name ?? "Unknown",
        email: t.email ?? null,
        company: t.company_name ?? null,
      }));
  }, [cappedIds, tickets]);

  const mut = useMutation({
    mutationFn: () =>
      generateOutreachDrafts({
        data: { ticket_ids: cappedIds, event_context: ctx, angle: angle || undefined },
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
      <Button disabled={disabled} onClick={() => setOpen(true)}>
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
              <Input value={angle} onChange={(e) => setAngle(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              We&apos;ll generate one personalized draft per selected attendee, then
              open the send dialog so you can review and send each through your
              connected Gmail.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!ctx || mut.isPending} onClick={() => mut.mutate()}>
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
