import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import { speakersQuery, sponsorsQuery, eventsQuery } from "@/lib/queries";
import { updateSpeaker } from "@/lib/speakers.functions";
import { updateSponsor } from "@/lib/sponsors.functions";
import { BANNER_STATUSES, labels, pillClass } from "@/lib/status";
import { toast } from "sonner";

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
  banner_status: string;
  dropbox_link: string | null;
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

  const eventById = useMemo(() => Object.fromEntries((events.data ?? []).map((e) => [e.id, e])), [events.data]);

  const rows: Row[] = [
    ...(speakers.data ?? []).map((s: any) => ({
      kind: "speaker" as const, id: s.id, event_id: s.event_id, name: s.name,
      banner_status: s.banner_status, dropbox_link: s.dropbox_link, linkedin_post_confirmed: s.linkedin_post_confirmed,
    })),
    ...(sponsors.data ?? []).map((s: any) => ({
      kind: "sponsor" as const, id: s.id, event_id: s.event_id, name: s.name,
      banner_status: s.banner_status, dropbox_link: s.dropbox_link, linkedin_post_confirmed: s.linkedin_post_confirmed,
    })),
  ].filter((r) => eventFilter === "all" || r.event_id === eventFilter);

  const patch = useMutation({
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

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Banner tracker</h1>
          <p className="text-sm text-muted-foreground">Every banner in production, across all events.</p>
        </div>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {(events.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Dropbox link</TableHead>
              <TableHead>LinkedIn post</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const ev = eventById[r.event_id];
              return (
                <TableRow key={`${r.kind}-${r.id}`}>
                  <TableCell>{ev ? <span className="font-mono text-xs">{ev.code}</span> : "—"}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground capitalize">{r.kind}</TableCell>
                  <TableCell>
                    <Select value={r.banner_status} onValueChange={(v) => patch.mutate({ row: r, patch: { banner_status: v } })}>
                      <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BANNER_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            <StatusPill className={pillClass.banner[s]}>{labels.banner[s]}</StatusPill>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      placeholder="Paste Dropbox URL"
                      defaultValue={r.dropbox_link ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (r.dropbox_link ?? "")) patch.mutate({ row: r, patch: { dropbox_link: v || null } });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={r.linkedin_post_confirmed}
                      onCheckedChange={(v) => patch.mutate({ row: r, patch: { linkedin_post_confirmed: !!v } })}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No banners.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
