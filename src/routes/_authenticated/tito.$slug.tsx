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
import { Textarea } from "@/components/ui/textarea";
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
import { ArrowLeft, Search, X, Users, CalendarDays, Loader2, Sparkles, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TitoAttendeeCard, type TitoAttendee } from "@/components/tito/TitoAttendeeCard";
import { TitoAttendeeDetailDialog } from "@/components/tito/TitoAttendeeDetailDialog";


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
      if (!term) return true;
      const hay = `${t.name ?? ""} ${t.email ?? ""} ${t.company_name ?? ""} ${t.job_title ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [tickets, q, releaseFilter]);

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
          to="/tito"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All Tito events
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

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
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
                  qc.invalidateQueries({ queryKey: ["speakers"] });
                }}
              />
              <DraftButton
                disabled={selected.size === 0}
                ticketIds={Array.from(selected)}
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
                />
              ))}
            </div>
          )}

          <TitoAttendeeDetailDialog
            attendee={detailAttendee}
            open={!!detailAttendee}
            onOpenChange={(v) => { if (!v) setDetailAttendee(null); }}
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
              <Label>Event context</Label>
              <Input value={ctx} onChange={(e) => setCtx(e.target.value)} />
            </div>
            <div>
              <Label>Angle (optional)</Label>
              <Input value={angle} onChange={(e) => setAngle(e.target.value)} />
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
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
