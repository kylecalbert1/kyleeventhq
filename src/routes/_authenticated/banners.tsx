import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import { speakersQuery, sponsorsQuery, eventsQuery } from "@/lib/queries";
import { updateSpeaker } from "@/lib/speakers.functions";
import { updateSponsor } from "@/lib/sponsors.functions";
import { updateEvent } from "@/lib/events.functions";
import { BANNER_STATUSES, labels, pillClass, type BannerStatusVal } from "@/lib/status";
import { toast } from "sonner";
import { ExternalLink, FolderOpen, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/banners")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(speakersQuery()),
      context.queryClient.ensureQueryData(sponsorsQuery()),
      context.queryClient.ensureQueryData(eventsQuery),
    ]),
  component: Banners,
});

type Row = {
  kind: "speaker" | "sponsor";
  id: string;
  event_id: string;
  name: string;
  banner_status: BannerStatusVal;
  linkedin_post_confirmed: boolean;
};

function Banners() {
  const qc = useQueryClient();
  const speakers = useQuery(speakersQuery());
  const sponsors = useQuery(sponsorsQuery());
  const events = useQuery(eventsQuery);
  const [eventFilter, setEventFilter] = useState("all");

  const upSpeaker = useServerFn(updateSpeaker);
  const upSponsor = useServerFn(updateSponsor);
  const upEvent = useServerFn(updateEvent);

  const rowsByEvent = useMemo(() => {
    const all: Row[] = [
      ...(speakers.data ?? []).map((s: any) => ({
        kind: "speaker" as const, id: s.id, event_id: s.event_id, name: s.name,
        banner_status: s.banner_status, linkedin_post_confirmed: s.linkedin_post_confirmed,
      })),
      ...(sponsors.data ?? []).map((s: any) => ({
        kind: "sponsor" as const, id: s.id, event_id: s.event_id, name: s.name,
        banner_status: s.banner_status, linkedin_post_confirmed: s.linkedin_post_confirmed,
      })),
    ];
    const map = new Map<string, Row[]>();
    for (const r of all) {
      if (eventFilter !== "all" && r.event_id !== eventFilter) continue;
      if (!map.has(r.event_id)) map.set(r.event_id, []);
      map.get(r.event_id)!.push(r);
    }
    return map;
  }, [speakers.data, sponsors.data, eventFilter]);

  const patchRow = useMutation({
    mutationFn: async ({ row, patch }: { row: Row; patch: any }) => {
      if (row.kind === "speaker") return upSpeaker({ data: { id: row.id, patch } });
      return upSponsor({ data: { id: row.id, patch } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["speakers"] });
      qc.invalidateQueries({ queryKey: ["sponsors"] });
      qc.invalidateQueries({ queryKey: ["eventSummaries"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const patchEvent = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) =>
      upEvent({ data: { id, patch } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["eventSummaries"] });
      toast.success("Event Dropbox link saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const orderedEvents = (events.data ?? []).filter(
    (e) => eventFilter === "all" || e.id === eventFilter,
  );

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Banner tracker</h1>
          <p className="text-sm text-muted-foreground">
            Every banner in production, grouped by event. Status here is the single source of truth — it also drives the Speaker Kanban and the Sync banner check.
          </p>
        </div>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {(events.data ?? []).map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {orderedEvents.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No events.</Card>
      )}

      <div className="space-y-8">
        {orderedEvents.map((ev) => {
          const rows = rowsByEvent.get(ev.id) ?? [];
          return (
            <EventBannerGroup
              key={ev.id}
              event={ev}
              rows={rows}
              onPatchRow={(row, patch) => patchRow.mutate({ row, patch })}
              onPatchEvent={(patch) => patchEvent.mutate({ id: ev.id, patch })}
            />
          );
        })}
      </div>
    </div>
  );
}

function EventBannerGroup({
  event,
  rows,
  onPatchRow,
  onPatchEvent,
}: {
  event: any;
  rows: Row[];
  onPatchRow: (r: Row, patch: any) => void;
  onPatchEvent: (patch: any) => void;
}) {
  const [linkDraft, setLinkDraft] = useState<string>(event.banner_dropbox_link ?? "");
  const dirty = linkDraft.trim() !== (event.banner_dropbox_link ?? "");

  const counts = BANNER_STATUSES.reduce<Record<BannerStatusVal, Row[]>>(
    (acc, s) => ({ ...acc, [s]: rows.filter((r) => r.banner_status === s) }),
    {} as any,
  );

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{event.code}</span>
            <h2 className="text-lg font-semibold tracking-tight">{event.name}</h2>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <ProgressBar sent={counts.sent.length + counts.confirmed_live.length} total={rows.length} />
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {counts.sent.length + counts.confirmed_live.length}/{rows.length} sent
            </span>
          </div>
        </div>

        <div className="flex items-end gap-2 min-w-[320px]">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
              <FolderOpen className="h-3.5 w-3.5" /> Shared Dropbox folder (all banners for this event)
            </label>
            <div className="flex gap-2">
              <Input
                className="h-9"
                placeholder="Paste one Dropbox folder URL for this event"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
              />
              {event.banner_dropbox_link && (
                <Button asChild variant="outline" size="sm" className="h-9">
                  <a href={event.banner_dropbox_link} target="_blank" rel="noreferrer">
                    Open <ExternalLink className="h-3.5 w-3.5 ml-1" />
                  </a>
                </Button>
              )}
              {dirty && (
                <Button
                  size="sm"
                  className="h-9"
                  onClick={() => onPatchEvent({ banner_dropbox_link: linkDraft.trim() || null })}
                >
                  Save
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-md">
          No speakers or sponsors yet for this event.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BANNER_STATUSES.map((status) => (
            <BannerColumn
              key={status}
              status={status}
              rows={counts[status]}
              onPatchRow={onPatchRow}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function BannerColumn({
  status,
  rows,
  onPatchRow,
}: {
  status: BannerStatusVal;
  rows: Row[];
  onPatchRow: (r: Row, patch: any) => void;
}) {
  return (
    <div className="bg-muted/40 rounded-lg p-3 min-h-[120px]">
      <div className="flex items-center justify-between mb-3">
        <StatusPill className={pillClass.banner[status]}>{labels.banner[status]}</StatusPill>
        <span className="text-xs text-muted-foreground font-medium">{rows.length}</span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <BannerCard key={`${r.kind}-${r.id}`} row={r} onPatch={(patch) => onPatchRow(r, patch)} />
        ))}
        {rows.length === 0 && (
          <div className="text-[11px] text-muted-foreground/70 italic px-1">—</div>
        )}
      </div>
    </div>
  );
}

function BannerCard({ row, onPatch }: { row: Row; onPatch: (patch: any) => void }) {
  const Icon = row.kind === "speaker" ? User : Building2;
  return (
    <div className="bg-background border rounded-md p-2.5 shadow-sm hover:shadow transition-shadow">
      <div className="flex items-start gap-2">
        <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", row.kind === "speaker" ? "text-sky-600" : "text-violet-600")} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{row.name}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{row.kind}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Select value={row.banner_status} onValueChange={(v) => onPatch({ banner_status: v })}>
          <SelectTrigger className="h-7 text-xs px-2 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {BANNER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{labels.banner[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
        <Checkbox
          className="h-3.5 w-3.5"
          checked={row.linkedin_post_confirmed}
          onCheckedChange={(v) => onPatch({ linkedin_post_confirmed: !!v })}
        />
        LinkedIn post
      </label>
    </div>
  );
}
