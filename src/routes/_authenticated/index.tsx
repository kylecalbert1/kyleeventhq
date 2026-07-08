import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, CheckCircle2, Circle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { EventFormDialog } from "@/components/dialogs/EventFormDialog";
import { eventSummariesQuery } from "@/lib/queries";
import { labels, pillClass, daysBetween } from "@/lib/status";

export const Route = createFileRoute("/_authenticated/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(eventSummariesQuery),
  component: EventsGrid,
});

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

      {summaries.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="text-sm text-muted-foreground">No events yet.</div>
          <Button variant="outline" className="mt-4" onClick={() => setCreating(true)}>Add your first event</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {summaries.map((s) => {
            const days = daysBetween(new Date(), s.event.launch_date ? new Date(s.event.launch_date) : null);
            return (
              <Link
                key={s.event.id}
                to="/events/$eventId"
                params={{ eventId: s.event.id }}
                className="group"
              >
                <Card className="p-5 h-full hover:shadow-md hover:border-foreground/20 transition-all group-hover:-translate-y-0.5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-muted-foreground">{s.event.code}</div>
                      <div className="font-semibold text-base leading-tight mt-0.5 truncate">{s.event.name}</div>
                    </div>
                    <StatusPill className={pillClass.businessLine[s.event.business_line]}>{s.event.business_line}</StatusPill>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                    <Calendar className="h-3.5 w-3.5" />
                    {s.event.launch_date ? (
                      days === null ? "—" : days < 0 ? `Launched ${Math.abs(days)}d ago` : days === 0 ? "Launches today" : `${days}d to launch`
                    ) : "No launch date"}
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <StatusPill className={pillClass.website[s.event.website_status]}>
                      {labels.website[s.event.website_status]}
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
