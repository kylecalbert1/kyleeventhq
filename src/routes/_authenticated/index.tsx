import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, CheckCircle2, Circle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { EventFormDialog } from "@/components/dialogs/EventFormDialog";
import { WeeklyPrioritiesWidget } from "@/components/WeeklyPrioritiesWidget";
import { CapacityPanel } from "@/components/CapacityPanel";
import { eventSummariesQuery } from "@/lib/queries";
import {
  labels,
  pillClass,
  daysBetween,
  readinessTone,
  readinessClass,
  type SelfStatus,
} from "@/lib/status";

export const Route = createFileRoute("/_authenticated/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(eventSummariesQuery),
  component: EventsGrid,
});

const readinessLabel = { 1: "P1", 2: "P2", 3: "Sign-off" } as const;

function ReadinessBadge({
  n,
  due,
  done,
}: {
  n: 1 | 2 | 3;
  due: string | null | undefined;
  done: boolean;
}) {
  const tone = readinessTone(due, done);
  const cls = readinessClass[tone];
  const days = due ? daysBetween(new Date(), new Date(due)) : null;
  let right = "—";
  if (done) right = "✓";
  else if (days !== null) right = days < 0 ? `${Math.abs(days)}d late` : days === 0 ? "today" : `${days}d`;
  return (
    <div className={`flex items-center justify-between gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${cls}`}>
      <span>{readinessLabel[n]}</span>
      <span className="tabular-nums">{right}</span>
    </div>
  );
}

function EventsGrid() {
  const { data } = useQuery(eventSummariesQuery);
  const [creating, setCreating] = useState(false);
  const summaries = data ?? [];

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="text-sm text-muted-foreground">All live and upcoming events at a glance.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1.5" />New event</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-1"><WeeklyPrioritiesWidget /></div>
        <div className="lg:col-span-2"><CapacityPanel summaries={summaries} /></div>
      </div>

      {summaries.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="text-sm text-muted-foreground">No events yet.</div>
          <Button variant="outline" className="mt-4" onClick={() => setCreating(true)}>Add your first event</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {summaries.map((s) => {
            const ev = s.event as typeof s.event & {
              proof1_due?: string | null;
              proof2_due?: string | null;
              final_signoff_due?: string | null;
              proof1_done?: boolean;
              proof2_done?: boolean;
              signoff_done?: boolean;
              self_status?: SelfStatus;
            };
            const days = daysBetween(new Date(), ev.launch_date ? new Date(ev.launch_date) : null);
            const selfStatus = ev.self_status ?? "on_track";
            return (
              <Link
                key={ev.id}
                to="/events/$eventId"
                params={{ eventId: ev.id }}
                className="group"
              >
                <Card className="p-5 h-full hover:shadow-md hover:border-foreground/20 transition-all group-hover:-translate-y-0.5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-muted-foreground">{ev.code}</div>
                      <div className="font-semibold text-base leading-tight mt-0.5 truncate">{ev.name}</div>
                    </div>
                    <StatusPill className={pillClass.businessLine[ev.business_line]}>{ev.business_line}</StatusPill>
                  </div>

                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {ev.launch_date ? (
                        days === null ? "—" : days < 0 ? `Launched ${Math.abs(days)}d ago` : days === 0 ? "Launches today" : `${days}d to launch`
                      ) : "No launch date"}
                    </div>
                    <StatusPill className={pillClass.selfStatus[selfStatus]}>
                      {labels.selfStatus[selfStatus]}
                    </StatusPill>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    <ReadinessBadge n={1} due={ev.proof1_due} done={!!ev.proof1_done} />
                    <ReadinessBadge n={2} due={ev.proof2_due} done={!!ev.proof2_done} />
                    <ReadinessBadge n={3} due={ev.final_signoff_due} done={!!ev.signoff_done} />
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <StatusPill className={pillClass.website[ev.website_status]}>
                      {labels.website[ev.website_status]}
                    </StatusPill>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <Row icon={s.kickoffDone ? "done" : "pending"} label="Kickoff" value={s.kickoffExists ? (s.kickoffDone ? "Done" : "Pending") : "Not scheduled"} />
                    <Row icon={s.washupDone ? "done" : "pending"} label="Washup" value={s.washupExists ? (s.washupDone ? "Done" : "Pending") : "Not scheduled"} />
                    <div className="flex justify-between text-muted-foreground pt-1">
                      <span>Speakers</span>
                      <span className="font-medium text-foreground">{s.confirmedCount}/{s.speakerCount} confirmed</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Banners</span>
                      <span className="font-medium text-foreground">{s.bannersSent}/{s.bannerTotal} sent</span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <EventFormDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function Row({ icon, label, value }: { icon: "done" | "pending"; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon === "done" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Circle className="h-3.5 w-3.5" />}
      <span className="flex-1">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
