import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import { SpeakerFormDialog } from "@/components/dialogs/SpeakerFormDialog";
import { speakersQuery, eventsQuery } from "@/lib/queries";
import { bulkMarkBannerSent } from "@/lib/speakers.functions";
import { labels, pillClass } from "@/lib/status";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/speakers")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(speakersQuery()),
      context.queryClient.ensureQueryData(eventsQuery),
    ]),
  component: SpeakerBoard,
});

const COLUMNS = [
  { key: "contacted", title: "Contacted" },
  { key: "responded", title: "Responded" },
  { key: "confirmed", title: "Confirmed" },
  { key: "banner_sent", title: "Banner Sent" },
  { key: "bio_headshot_in", title: "Bio/Headshot In" },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

function columnFor(s: any): ColKey {
  if (s.bio_received && s.headshot_received) return "bio_headshot_in";
  if (s.banner_status === "sent" || s.banner_status === "confirmed_live") return "banner_sent";
  if (s.status === "confirmed") return "confirmed";
  if (s.status === "responded") return "responded";
  return "contacted";
}

function SpeakerBoard() {
  const qc = useQueryClient();
  const events = useQuery(eventsQuery);
  const speakers = useQuery(speakersQuery());
  const bulk = useServerFn(bulkMarkBannerSent);

  const [eventFilter, setEventFilter] = useState<string>("all");
  const [lineFilter, setLineFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<null | { open: boolean; speaker?: any }>(null);

  const eventById = useMemo(() => Object.fromEntries((events.data ?? []).map((e) => [e.id, e])), [events.data]);

  const filtered = (speakers.data ?? []).filter((s: any) => {
    if (eventFilter !== "all" && s.event_id !== eventFilter) return false;
    if (lineFilter !== "all") {
      const ev = eventById[s.event_id];
      if (ev?.business_line !== lineFilter) return false;
    }
    return true;
  });

  const grouped: Record<ColKey, any[]> = { contacted: [], responded: [], confirmed: [], banner_sent: [], bio_headshot_in: [] };
  filtered.forEach((s: any) => grouped[columnFor(s)].push(s));

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  const bulkMutation = useMutation({
    mutationFn: () => bulk({ data: { ids: selectedIds } }),
    onSuccess: (r: any) => {
      toast.success(`Marked ${r.count} banners as sent`);
      setSelected({});
      qc.invalidateQueries({ queryKey: ["speakers"] });
      qc.invalidateQueries({ queryKey: ["eventSummaries"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Speaker pipeline</h1>
          <p className="text-sm text-muted-foreground">Track every speaker from first outreach to confirmed & ready.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {(events.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.code}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={lineFilter} onValueChange={setLineFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lines</SelectItem>
              <SelectItem value="AIAI">AIAI</SelectItem>
              <SelectItem value="CSC">CSC</SelectItem>
            </SelectContent>
          </Select>
          {selectedIds.length > 0 && (
            <Button size="sm" onClick={() => bulkMutation.mutate()} disabled={bulkMutation.isPending}>
              <Send className="h-4 w-4 mr-1.5" />Mark {selectedIds.length} banner{selectedIds.length > 1 ? "s" : ""} sent
            </Button>
          )}
          <Button onClick={() => setEditing({ open: true })}><Plus className="h-4 w-4 mr-1.5" />Add speaker</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {COLUMNS.map((col) => (
          <div key={col.key} className="min-w-0">
            <div className="flex items-center justify-between px-1 mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{col.title}</div>
              <div className="text-xs text-muted-foreground">{grouped[col.key].length}</div>
            </div>
            <div className="space-y-2 min-h-16">
              {grouped[col.key].map((s: any) => {
                const ev = eventById[s.event_id];
                return (
                  <Card
                    key={s.id}
                    className="p-3 hover:shadow-sm cursor-pointer"
                    onClick={() => setEditing({ open: true, speaker: s })}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={!!selected[s.id]}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={(v) => setSelected({ ...selected, [s.id]: !!v })}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{s.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{s.company}</div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {ev && <StatusPill className={pillClass.businessLine[ev.business_line]}>{ev.code}</StatusPill>}
                          <StatusPill className={pillClass.banner[s.banner_status as never]}>{labels.banner[s.banner_status as never]}</StatusPill>
                        </div>
                        <div className="flex gap-2 text-[10px] text-muted-foreground mt-1.5">
                          <span>{s.bio_received ? "Bio ✓" : "Bio —"}</span>
                          <span>{s.headshot_received ? "Headshot ✓" : "Headshot —"}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {editing && <SpeakerFormDialog open={editing.open} onOpenChange={(o) => setEditing(o ? editing : null)} speaker={editing.speaker} />}
    </div>
  );
}
