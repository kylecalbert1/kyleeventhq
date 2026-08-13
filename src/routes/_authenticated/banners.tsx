import { PageHelp } from "@/components/PageHelp";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { speakersQuery, sponsorsQuery, eventsQuery } from "@/lib/queries";
import { updateSpeaker } from "@/lib/speakers.functions";
import { updateSponsor } from "@/lib/sponsors.functions";
import { updateEvent } from "@/lib/events.functions";
import { toast } from "sonner";
import {
  EventBannerGroup,
  type BannerRow,
} from "@/components/banners/EventBannerGroup";

export const Route = createFileRoute("/_authenticated/banners")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(speakersQuery()),
      context.queryClient.ensureQueryData(sponsorsQuery()),
      context.queryClient.ensureQueryData(eventsQuery),
    ]),
  component: Banners,
});

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
    const all: BannerRow[] = [
      ...(speakers.data ?? []).map((s: any) => ({
        kind: "speaker" as const,
        id: s.id,
        event_id: s.event_id,
        name: s.name,
        banner_status: s.banner_status,
        linkedin_post_confirmed: s.linkedin_post_confirmed,
      })),
      ...(sponsors.data ?? []).map((s: any) => ({
        kind: "sponsor" as const,
        id: s.id,
        event_id: s.event_id,
        name: s.name,
        banner_status: s.banner_status,
        linkedin_post_confirmed: s.linkedin_post_confirmed,
      })),
    ];
    const map = new Map<string, BannerRow[]>();
    for (const r of all) {
      if (eventFilter !== "all" && r.event_id !== eventFilter) continue;
      if (!map.has(r.event_id)) map.set(r.event_id, []);
      map.get(r.event_id)!.push(r);
    }
    return map;
  }, [speakers.data, sponsors.data, eventFilter]);

  const patchRow = useMutation({
    mutationFn: async ({ row, patch }: { row: BannerRow; patch: any }) => {
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
            Every banner in production, grouped by event. Status here is the single source of
            truth - it also drives the Speaker Kanban and the Sync banner check.
          </p>
        </div>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {(events.data ?? []).map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.code} - {e.name}
              </SelectItem>
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
