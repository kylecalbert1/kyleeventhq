import { PageHelp } from "@/components/PageHelp";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, ExternalLink, Pencil, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusPill } from "@/components/StatusPill";
import { MilestoneFormDialog } from "@/components/dialogs/MilestoneFormDialog";
import { milestonesQuery } from "@/lib/queries";
import { labels, pillClass } from "@/lib/status";

export const Route = createFileRoute("/_authenticated/milestones")({
  loader: ({ context }) => context.queryClient.ensureQueryData(milestonesQuery()),
  component: MilestonesList,
});

function MilestonesList() {
  const milestones = useQuery(milestonesQuery());
  const [editing, setEditing] = useState<null | { open: boolean; milestone?: any }>(null);

  const rows = milestones.data ?? [];
  const upcoming = rows.filter((m: any) => m.status !== "done");
  const done = rows.filter((m: any) => m.status === "done");

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl p-6 md:p-8 space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="accent-bar mb-3" />
            <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                <CalendarDays className="h-6 w-6 text-primary" />
                Kickoff & Washup
              </h1>
              <PageHelp
                title={"Kickoff & washup"}
                what={"Planning and retrospective sessions across every event, so you can see what’s scheduled and what’s overdue."}
                steps={[
                  "Add a milestone with its event and date.",
                  "Scan the list for sessions coming up.",
                  "Use it alongside the event pages when planning the week.",
                ]}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-1">Every planning and retrospective session across events.</p>
          </div>
          <Button onClick={() => setEditing({ open: true })}><Plus className="h-4 w-4 mr-1.5" />Add milestone</Button>
        </div>

        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="done">Done ({done.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="upcoming" className="mt-4"><List rows={upcoming} onEdit={(m) => setEditing({ open: true, milestone: m })} /></TabsContent>
          <TabsContent value="done" className="mt-4"><List rows={done} onEdit={(m) => setEditing({ open: true, milestone: m })} /></TabsContent>
        </Tabs>

        {editing && <MilestoneFormDialog open={editing.open} onOpenChange={(o) => setEditing(o ? editing : null)} milestone={editing.milestone} />}
      </div>
    </div>
  );
}


function List({ rows, onEdit }: { rows: any[]; onEdit: (m: any) => void }) {
  if (rows.length === 0) return <Card className="p-8 text-center text-sm text-muted-foreground">Nothing here yet.</Card>;
  return (
    <div className="space-y-2">
      {rows.map((m) => (
        <Card key={m.id} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {m.events && <span className="font-mono text-xs text-muted-foreground">{m.events.code}</span>}
                <span className="font-semibold text-sm">{m.events?.name}</span>
                <StatusPill className="bg-slate-100 text-slate-700 ring-slate-200">{labels.milestoneType[m.type as never]}</StatusPill>
                <StatusPill className={pillClass.milestoneStatus[m.status as never]}>{labels.milestoneStatus[m.status as never]}</StatusPill>
                <span className="text-xs text-muted-foreground">
                  {m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString() : "No date"}
                </span>
              </div>
              <div className="flex gap-3 text-xs mt-1">
                {m.doc_link && <a className="text-primary hover:underline inline-flex items-center gap-1" href={m.doc_link} target="_blank" rel="noreferrer">Doc <ExternalLink className="h-3 w-3" /></a>}
                {m.recap_link && <a className="text-primary hover:underline inline-flex items-center gap-1" href={m.recap_link} target="_blank" rel="noreferrer">Recap <ExternalLink className="h-3 w-3" /></a>}
              </div>
              {m.key_action_items && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{m.key_action_items}</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => onEdit(m)}><Pencil className="h-3.5 w-3.5" /></Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
