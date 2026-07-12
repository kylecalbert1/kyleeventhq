import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Pencil, Plus, ExternalLink, Lock, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill } from "@/components/StatusPill";
import {
  eventQuery,
  speakersQuery,
  sponsorsQuery,
  websiteTasksQuery,
  milestonesQuery,
  emailSendsQuery,
} from "@/lib/queries";
import { labels, pillClass } from "@/lib/status";
import { EventFormDialog } from "@/components/dialogs/EventFormDialog";
import { SpeakerFormDialog } from "@/components/dialogs/SpeakerFormDialog";
import { SponsorFormDialog } from "@/components/dialogs/SponsorFormDialog";
import { WebsiteTaskFormDialog } from "@/components/dialogs/WebsiteTaskFormDialog";
import { MilestoneFormDialog } from "@/components/dialogs/MilestoneFormDialog";
import { BulkEmailDialog } from "@/components/BulkEmailDialog";
import { SendHistoryPanel } from "@/components/SendHistoryPanel";
import { TEMPLATE_LABELS, type TemplateType } from "@/lib/email-sends.functions";

export const Route = createFileRoute("/_authenticated/events/$eventId")({
  loader: ({ params, context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(eventQuery(params.eventId)),
      context.queryClient.ensureQueryData(speakersQuery(params.eventId)),
      context.queryClient.ensureQueryData(sponsorsQuery(params.eventId)),
      context.queryClient.ensureQueryData(websiteTasksQuery(params.eventId)),
      context.queryClient.ensureQueryData(milestonesQuery(params.eventId)),
      context.queryClient.ensureQueryData(emailSendsQuery(params.eventId)),
    ]),
  component: EventDetail,
});

function EventDetail() {
  const { eventId } = Route.useParams();
  const event = useQuery(eventQuery(eventId));
  const speakers = useQuery(speakersQuery(eventId));
  const sponsors = useQuery(sponsorsQuery(eventId));
  const tasks = useQuery(websiteTasksQuery(eventId));
  const milestones = useQuery(milestonesQuery(eventId));

  const [editingEvent, setEditingEvent] = useState(false);
  const [speakerEdit, setSpeakerEdit] = useState<null | { open: boolean; speaker?: any }>(null);
  const [sponsorEdit, setSponsorEdit] = useState<null | { open: boolean; sponsor?: any }>(null);
  const [taskEdit, setTaskEdit] = useState<null | { open: boolean; task?: any }>(null);
  const [milestoneEdit, setMilestoneEdit] = useState<null | { open: boolean; milestone?: any; type?: "kickoff" | "washup" }>(null);

  if (!event.data) return null;
  const e = event.data;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" />Events</Link>
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            {e.code}
            <StatusPill className={pillClass.businessLine[e.business_line as "AIAI" | "CSC"]}>{e.business_line}</StatusPill>
            <span className="text-muted-foreground">· {labels.format[e.format as "in_person" | "virtual"]}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">{e.name}</h1>
          <div className="text-sm text-muted-foreground mt-1">
            {e.venue ? `${e.venue} · ` : ""}
            {e.event_date ? new Date(e.event_date).toLocaleDateString() : "Date TBC"}
            {e.owner ? ` · Owner: ${e.owner}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill className={pillClass.website[e.website_status as never]}>{labels.website[e.website_status as never]}</StatusPill>
          <Button variant="outline" size="sm" onClick={() => setEditingEvent(true)}><Pencil className="h-4 w-4 mr-1.5" />Edit</Button>
        </div>
      </div>

      <Tabs defaultValue="speakers">
        <TabsList>
          <TabsTrigger value="speakers">Speakers</TabsTrigger>
          <TabsTrigger value="banners">Banners</TabsTrigger>
          <TabsTrigger value="website">Website</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="milestones">Kickoff & Washup</TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="mt-4 space-y-4">
          <EmailSection eventId={eventId} speakers={speakers.data ?? []} />
        </TabsContent>


        <TabsContent value="speakers" className="mt-4">
          <SectionHeader title="Speakers" onAdd={() => setSpeakerEdit({ open: true })} />
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Banner</TableHead>
                  <TableHead>Bio</TableHead>
                  <TableHead>Headshot</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(speakers.data ?? []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}<div className="text-xs text-muted-foreground">{s.title}</div></TableCell>
                    <TableCell>{s.company}</TableCell>
                    <TableCell>{s.session_title}{s.session_format && <div className="text-xs text-muted-foreground">{labels.sessionFormat[s.session_format as never]}</div>}</TableCell>
                    <TableCell><StatusPill className={pillClass.speaker[s.status as never]}>{labels.speaker[s.status as never]}</StatusPill></TableCell>
                    <TableCell><StatusPill className={pillClass.banner[s.banner_status as never]}>{labels.banner[s.banner_status as never]}</StatusPill></TableCell>
                    <TableCell>{s.bio_received ? "✓" : "—"}</TableCell>
                    <TableCell>{s.headshot_received ? "✓" : "—"}</TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => setSpeakerEdit({ open: true, speaker: s })}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
                  </TableRow>
                ))}
                {(speakers.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">No speakers yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="banners" className="mt-4 space-y-6">
          <div>
            <SectionHeader title="Speaker banners" />
            <Card>
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Dropbox</TableHead><TableHead>LinkedIn post</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(speakers.data ?? []).map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell><StatusPill className={pillClass.banner[s.banner_status as never]}>{labels.banner[s.banner_status as never]}</StatusPill></TableCell>
                      <TableCell>{s.dropbox_link ? <a className="text-primary hover:underline inline-flex items-center gap-1" href={s.dropbox_link} target="_blank" rel="noreferrer">Link <ExternalLink className="h-3 w-3" /></a> : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>{s.linkedin_post_confirmed ? "✓" : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
          <div>
            <SectionHeader title="Sponsors" onAdd={() => setSponsorEdit({ open: true })} />
            <Card>
              <Table>
                <TableHeader><TableRow><TableHead>Sponsor</TableHead><TableHead>Tier</TableHead><TableHead>Session</TableHead><TableHead>Banner</TableHead><TableHead>LinkedIn post</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {(sponsors.data ?? []).map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.spend_tier}</TableCell>
                      <TableCell>{s.session_type}</TableCell>
                      <TableCell><StatusPill className={pillClass.banner[s.banner_status as never]}>{labels.banner[s.banner_status as never]}</StatusPill></TableCell>
                      <TableCell>{s.linkedin_post_confirmed ? "✓" : "—"}</TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => setSponsorEdit({ open: true, sponsor: s })}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
                    </TableRow>
                  ))}
                  {(sponsors.data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No sponsors yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="website" className="mt-4">
          <SectionHeader title="Website tasks" onAdd={() => setTaskEdit({ open: true })} />
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead></TableHead><TableHead>Task</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead><TableHead>Assignee</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {(tasks.data ?? []).map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.protected && <Lock className="h-3.5 w-3.5 text-amber-600" />}</TableCell>
                    <TableCell className="font-medium">{labels.websiteTaskType[t.task_type as never]}</TableCell>
                    <TableCell><StatusPill className={pillClass.website[t.status as never]}>{labels.website[t.status as never]}</StatusPill></TableCell>
                    <TableCell>{t.due_date ? new Date(t.due_date).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>{t.assignee ?? "—"}</TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => setTaskEdit({ open: true, task: t })}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
                  </TableRow>
                ))}
                {(tasks.data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No website tasks.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="milestones" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold">Kickoff & Washup</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setMilestoneEdit({ open: true, type: "kickoff" })}><Plus className="h-3.5 w-3.5 mr-1" />Kickoff</Button>
              <Button variant="outline" size="sm" onClick={() => setMilestoneEdit({ open: true, type: "washup" })}><Plus className="h-3.5 w-3.5 mr-1" />Washup</Button>
            </div>
          </div>
          <div className="grid gap-3">
            {(milestones.data ?? []).map((m: any) => (
              <Card key={m.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{labels.milestoneType[m.type as never]}</span>
                      <StatusPill className={pillClass.milestoneStatus[m.status as never]}>{labels.milestoneStatus[m.status as never]}</StatusPill>
                      <span className="text-xs text-muted-foreground">{m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString() : "—"}</span>
                    </div>
                    <div className="flex gap-3 text-xs mt-1">
                      {m.doc_link && <a className="text-primary hover:underline inline-flex items-center gap-1" href={m.doc_link} target="_blank" rel="noreferrer">Doc <ExternalLink className="h-3 w-3" /></a>}
                      {m.recap_link && <a className="text-primary hover:underline inline-flex items-center gap-1" href={m.recap_link} target="_blank" rel="noreferrer">Recap <ExternalLink className="h-3 w-3" /></a>}
                    </div>
                    {m.key_action_items && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{m.key_action_items}</p>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setMilestoneEdit({ open: true, milestone: m })}><Pencil className="h-3.5 w-3.5" /></Button>
                </div>
              </Card>
            ))}
            {(milestones.data ?? []).length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No milestones yet.</Card>}
          </div>
        </TabsContent>
      </Tabs>

      <EventFormDialog open={editingEvent} onOpenChange={setEditingEvent} event={e as any} />
      {speakerEdit && <SpeakerFormDialog open={speakerEdit.open} onOpenChange={(o) => setSpeakerEdit(o ? speakerEdit : null)} speaker={speakerEdit.speaker} defaultEventId={eventId} />}
      {sponsorEdit && <SponsorFormDialog open={sponsorEdit.open} onOpenChange={(o) => setSponsorEdit(o ? sponsorEdit : null)} sponsor={sponsorEdit.sponsor} eventId={eventId} />}
      {taskEdit && <WebsiteTaskFormDialog open={taskEdit.open} onOpenChange={(o) => setTaskEdit(o ? taskEdit : null)} task={taskEdit.task} defaultEventId={eventId} />}
      {milestoneEdit && <MilestoneFormDialog open={milestoneEdit.open} onOpenChange={(o) => setMilestoneEdit(o ? milestoneEdit : null)} milestone={milestoneEdit.milestone} defaultEventId={eventId} defaultType={milestoneEdit.type} />}
    </div>
  );
}

function SectionHeader({ title, onAdd }: { title: string; onAdd?: () => void }) {
  return (
    <div className="flex justify-between items-center mb-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {onAdd && <Button variant="outline" size="sm" onClick={onAdd}><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>}
    </div>
  );
}

const TEMPLATE_ORDER: TemplateType[] = [
  "confirmation",
  "banner_reminder",
  "bio_headshot_reminder",
  "follow_up",
  "custom",
];

function EmailSection({ eventId, speakers }: { eventId: string; speakers: any[] }) {
  const sends = useQuery(emailSendsQuery(eventId));
  const [composeOpen, setComposeOpen] = useState(false);
  const [initialTemplate, setInitialTemplate] = useState<TemplateType>("custom");

  const perTemplate = useMemo(() => {
    const map = new Map<TemplateType, { count: number; latest: string | null }>();
    for (const t of TEMPLATE_ORDER) map.set(t, { count: 0, latest: null });
    for (const s of sends.data ?? []) {
      const cur = map.get(s.template_type) ?? { count: 0, latest: null };
      cur.count += s.recipient_count;
      if (!cur.latest || new Date(s.sent_at) > new Date(cur.latest)) {
        cur.latest = s.sent_at;
      }
      map.set(s.template_type, cur);
    }
    return map;
  }, [sends.data]);

  function fmt(iso: string | null) {
    if (!iso) return "Not sent yet";
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function launchCompose(template: TemplateType) {
    setInitialTemplate(template);
    setComposeOpen(true);
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-indigo-600" /> Email templates
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kyle triggers these sends manually based on pipeline status — this is tracking, not automation.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {speakers.length} speaker{speakers.length === 1 ? "" : "s"} on this event
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {TEMPLATE_ORDER.map((t) => {
            const info = perTemplate.get(t)!;
            return (
              <Card
                key={t}
                className="p-4 rounded-2xl border-slate-200/70 shadow-sm flex flex-col gap-3"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {TEMPLATE_LABELS[t]}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700 tabular-nums">
                      {info.count}
                    </span>{" "}
                    sent all-time
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Latest: {fmt(info.latest)}
                  </div>
                </div>
                <Button
                  size="sm"
                  className="rounded-full bg-indigo-600 hover:bg-indigo-700 text-white h-8 mt-auto"
                  onClick={() => launchCompose(t)}
                  disabled={speakers.length === 0}
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Send now
                </Button>
              </Card>
            );
          })}
        </div>
      </div>

      <SendHistoryPanel eventId={eventId} defaultOpen title="Send history (this event)" />

      <BulkEmailDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        speakers={speakers}
        initialTemplate={initialTemplate}
        eventId={eventId}
      />
    </div>
  );
}
