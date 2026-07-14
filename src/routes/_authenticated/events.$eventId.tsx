import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Pencil,
  Plus,
  ExternalLink,
  Lock,
  Mail,
  Send,
  ChevronRight,
  Sparkles,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SpeakerListCard } from "@/components/speakers/SpeakerListCard";

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
import { updateSpeaker } from "@/lib/speakers.functions";
import { updateSponsor } from "@/lib/sponsors.functions";
import { updateEvent } from "@/lib/events.functions";
import { getAsanaProofingDueDates } from "@/lib/asana.functions";
import { EventFormDialog } from "@/components/dialogs/EventFormDialog";
import { SpeakerFormDialog } from "@/components/dialogs/SpeakerFormDialog";
import { SpeakerDetailDialog } from "@/components/dialogs/SpeakerDetailDialog";
import { SponsorFormDialog } from "@/components/dialogs/SponsorFormDialog";
import { WebsiteTaskFormDialog } from "@/components/dialogs/WebsiteTaskFormDialog";
import { MilestoneFormDialog } from "@/components/dialogs/MilestoneFormDialog";
import { BulkEmailDialog } from "@/components/BulkEmailDialog";
import { ConfirmSendEmailDialog, type ConfirmDraft } from "@/components/ConfirmSendEmailDialog";
import { SendHistoryPanel } from "@/components/SendHistoryPanel";
import {
  EventBannerGroup,
  type BannerRow,
} from "@/components/banners/EventBannerGroup";
import { TEMPLATE_LABELS, type TemplateType } from "@/lib/email-sends.functions";
import { OutreachHub } from "@/components/outreach/OutreachHub";
import { AgendaTab } from "@/components/agenda/AgendaTab";
import { sendGmailEmail } from "@/lib/email.functions";
import { firstNameOf } from "@/lib/gmail";
import { SyncDialog } from "@/components/SyncDialog";
import { toast } from "sonner";

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
  const qc = useQueryClient();
  const event = useQuery(eventQuery(eventId));
  const speakers = useQuery(speakersQuery(eventId));
  const sponsors = useQuery(sponsorsQuery(eventId));
  const tasks = useQuery(websiteTasksQuery(eventId));
  const milestones = useQuery(milestonesQuery(eventId));
  const fetchAsana = useServerFn(getAsanaProofingDueDates);
  const asanaQuery = useQuery({
    queryKey: ["asanaProofingDues", eventId],
    queryFn: () => fetchAsana({ data: { event_id: eventId } }),
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  const asanaDues = asanaQuery.data?.dues;

  const upSpeaker = useServerFn(updateSpeaker);
  const upSponsor = useServerFn(updateSponsor);
  const upEvent = useServerFn(updateEvent);

  const [editingEvent, setEditingEvent] = useState(false);
  const [speakerEdit, setSpeakerEdit] = useState<null | { open: boolean; speaker?: any }>(null);
  const [detailSpeaker, setDetailSpeaker] = useState<any | null>(null);
  const [sponsorEdit, setSponsorEdit] = useState<null | { open: boolean; sponsor?: any }>(null);
  const [taskEdit, setTaskEdit] = useState<null | { open: boolean; task?: any }>(null);
  const [milestoneEdit, setMilestoneEdit] = useState<null | {
    open: boolean;
    milestone?: any;
    type?: "kickoff" | "washup";
  }>(null);
  const [confirmEmail, setConfirmEmail] = useState<ConfirmDraft | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [speakerQ, setSpeakerQ] = useState("");
  const sendEmail = useServerFn(sendGmailEmail);

  function emailOne(s: any, ev: any) {
    if (!s.email) { toast.error("No email on file"); return; }
    const firstName = firstNameOf(s.name);
    const code = ev?.code ?? "our upcoming event";
    setConfirmEmail({
      to: s.email,
      recipientName: firstName,
      subject: `${code} — quick check-in`,
      body: `Hi ${firstName},\n\nJust following up on your session for ${code}. Let me know if you need anything from us — happy to help move things forward.\n\nThanks!`,
      templateType: "custom",
      eventId: s.event_id ?? null,
      speakerId: s.id,
    });
  }

  async function performSendConfirmed(edited: { subject: string; body: string }) {
    if (!confirmEmail) return;
    const t = toast.loading(`Sending email to ${confirmEmail.recipientName ?? confirmEmail.to}…`);
    try {
      await sendEmail({
        data: { to: confirmEmail.to, subject: edited.subject, body: edited.body },
      });
      toast.success(`Sent to ${confirmEmail.recipientName ?? confirmEmail.to}`, { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send", { id: t });
    }
  }

  const bannerRows = useMemo<BannerRow[]>(() => {
    return [
      ...((speakers.data ?? []) as any[]).map((s) => ({
        kind: "speaker" as const,
        id: s.id,
        event_id: s.event_id,
        name: s.name,
        banner_status: s.banner_status,
        linkedin_post_confirmed: s.linkedin_post_confirmed,
      })),
      ...((sponsors.data ?? []) as any[]).map((s) => ({
        kind: "sponsor" as const,
        id: s.id,
        event_id: s.event_id,
        name: s.name,
        banner_status: s.banner_status,
        linkedin_post_confirmed: s.linkedin_post_confirmed,
      })),
    ];
  }, [speakers.data, sponsors.data]);

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
    mutationFn: async ({ patch }: { patch: any }) => upEvent({ data: { id: eventId, patch } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", eventId] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["eventSummaries"] });
      toast.success("Saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!event.data) return null;
  const e = event.data;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Events
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            {e.code}
            <StatusPill className={pillClass.businessLine[e.business_line as "AIAI" | "CSC"]}>
              {e.business_line}
            </StatusPill>
            <span className="text-muted-foreground">
              · {labels.format[e.format as "in_person" | "virtual"]}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">{e.name}</h1>
          <div className="text-sm text-muted-foreground mt-1">
            {e.venue ? `${e.venue} · ` : ""}
            {e.event_date ? new Date(e.event_date).toLocaleDateString() : "Date TBC"}
            {e.owner ? ` · Owner: ${e.owner}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill className={pillClass.website[e.website_status as never]}>
            {labels.website[e.website_status as never]}
          </StatusPill>
          <Button variant="outline" size="sm" onClick={() => setSyncOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            Sync
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditingEvent(true)}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit
          </Button>
        </div>
      </div>

      {/* Top-level search — filters the Speakers, Outreach, Banners lists below */}
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 h-10"
          placeholder="Search speakers by name, company, email…"
          value={speakerQ}
          onChange={(ev) => setSpeakerQ(ev.target.value)}
        />
      </div>

      <Tabs defaultValue="speakers">
        <TabsList>
          <TabsTrigger value="speakers">Speakers</TabsTrigger>
          <TabsTrigger value="outreach">Outreach</TabsTrigger>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="banners">Banners</TabsTrigger>
          <TabsTrigger value="website">Website</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="milestones">Kickoff & Washup</TabsTrigger>
        </TabsList>

        <TabsContent value="outreach" className="mt-4">
          <OutreachHub eventId={eventId} />
        </TabsContent>

        <TabsContent value="agenda" className="mt-4">
          <AgendaTab eventId={eventId} eventFormat={e.format} />
        </TabsContent>

        <TabsContent value="email" className="mt-4 space-y-4">
          <EmailSection eventId={eventId} speakers={speakers.data ?? []} />
        </TabsContent>

        <TabsContent value="speakers" className="mt-4 space-y-3">
          {(() => {
            const term = speakerQ.trim().toLowerCase();
            const all = (speakers.data ?? []) as any[];
            const filtered = term
              ? all.filter((s) => {
                  const hay = `${s.name ?? ""} ${s.company ?? ""} ${s.email ?? ""} ${s.title ?? ""}`.toLowerCase();
                  return hay.includes(term);
                })
              : all;
            return (
              <>
                <SectionHeader
                  title={
                    term
                      ? `Speakers (${filtered.length} of ${all.length})`
                      : `Speakers (${all.length})`
                  }
                  onAdd={() => setSpeakerEdit({ open: true })}
                />
                {all.length === 0 ? (
                  <Card className="p-8 text-center text-sm text-muted-foreground">
                    No speakers yet.
                  </Card>
                ) : filtered.length === 0 ? (
                  <Card className="p-8 text-center text-sm text-muted-foreground">
                    No speakers match "{speakerQ}".
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {filtered.map((s: any) => (
                      <SpeakerListCard
                        key={s.id}
                        s={s}
                        ev={e}
                        showEventChip={false}
                        onOpenDetail={() => setDetailSpeaker(s)}
                        onEmail={() => emailOne(s, e)}
                        onCopyLink={async () => {
                          const url = s.dropbox_link || s.linkedin_url;
                          if (!url) return toast.error("No link stored for this speaker");
                          try {
                            await navigator.clipboard.writeText(url);
                            toast.success("Link copied");
                          } catch { toast.error("Couldn't copy link"); }
                        }}
                        onEdit={() => setSpeakerEdit({ open: true, speaker: s })}
                      />
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </TabsContent>


        <TabsContent value="banners" className="mt-4 space-y-6">
          <EventBannerGroup
            event={e}
            rows={bannerRows}
            onPatchRow={(row, patch) => patchRow.mutate({ row, patch })}
            onPatchEvent={(patch) => patchEvent.mutate({ patch })}
            compact
          />
          <div>
            <SectionHeader title="Sponsors" onAdd={() => setSponsorEdit({ open: true })} />
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sponsor</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Banner</TableHead>
                    <TableHead>LinkedIn post</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sponsors.data ?? []).map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.spend_tier}</TableCell>
                      <TableCell>{s.session_type}</TableCell>
                      <TableCell>
                        <StatusPill className={pillClass.banner[s.banner_status as never]}>
                          {labels.banner[s.banner_status as never]}
                        </StatusPill>
                      </TableCell>
                      <TableCell>{s.linkedin_post_confirmed ? "✓" : "—"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSponsorEdit({ open: true, sponsor: s })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(sponsors.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                        No sponsors yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="website" className="mt-4 space-y-3">
          <SectionHeader title="Website tasks" onAdd={() => setTaskEdit({ open: true })} />
          {(tasks.data ?? []).length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No website tasks yet.
            </Card>
          ) : (
            <div className="space-y-2">
              {(tasks.data ?? []).map((t: any) => {
                const stages = [
                  { key: "buddy_proof" as const, label: "1st proof (buddy)", done: t.buddy_proof_done, date: t.buddy_proof_date },
                  { key: "marketer_proof" as const, label: "2nd proof (marketing)", done: t.marketer_proof_done, date: t.marketer_proof_date },
                  { key: "amendments_actioned" as const, label: "Amendments actioned", done: t.amendments_actioned_done, date: t.amendments_actioned_date },
                  { key: "final_signoff" as const, label: "Final sign-off", done: t.final_signoff_done, date: t.final_signoff_date },
                ];
                return (
                  <Card
                    key={t.id}
                    className="p-4 hover:shadow-sm transition-shadow cursor-pointer bg-white rounded-2xl border-slate-200/70"
                    onClick={() => setTaskEdit({ open: true, task: t })}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {t.protected && <Lock className="h-3.5 w-3.5 text-amber-600" />}
                          <div className="font-semibold text-sm truncate">
                            {t.title || "Website task"}
                          </div>
                          <StatusPill className={pillClass.website[t.status as never]}>
                            {labels.website[t.status as never]}
                          </StatusPill>
                          {t.due_date && (
                            <span className="text-[11px] text-muted-foreground">
                              Due {new Date(t.due_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {stages.map((st) => {
                            const asanaDue = asanaDues?.[st.key] ?? null;
                            return (
                              <span
                                key={st.label}
                                className={
                                  "text-[11px] px-2 py-0.5 rounded-full ring-1 " +
                                  (st.done
                                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                    : "bg-slate-50 text-slate-500 ring-slate-200")
                                }
                              >
                                {st.done ? "✓ " : "○ "}
                                {st.label}
                                {st.done && st.date ? ` · ${new Date(st.date).toLocaleDateString()}` : ""}
                                {asanaDue ? ` · Asana ${new Date(asanaDue).toLocaleDateString()}` : ""}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      {t.markup_url && (
                        <a
                          href={t.markup_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(evt) => evt.stopPropagation()}
                          className="shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium bg-sky-50 text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
                        >
                          Markup <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>


        <TabsContent value="milestones" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold">Kickoff & Washup</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMilestoneEdit({ open: true, type: "kickoff" })}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Kickoff
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMilestoneEdit({ open: true, type: "washup" })}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Washup
              </Button>
            </div>
          </div>
          <div className="grid gap-3">
            {(milestones.data ?? []).map((m: any) => (
              <Card key={m.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        {labels.milestoneType[m.type as never]}
                      </span>
                      <StatusPill className={pillClass.milestoneStatus[m.status as never]}>
                        {labels.milestoneStatus[m.status as never]}
                      </StatusPill>
                      <span className="text-xs text-muted-foreground">
                        {m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString() : "—"}
                      </span>
                    </div>
                    <div className="flex gap-3 text-xs mt-1">
                      {m.doc_link && (
                        <a
                          className="text-primary hover:underline inline-flex items-center gap-1"
                          href={m.doc_link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Doc <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {m.recap_link && (
                        <a
                          className="text-primary hover:underline inline-flex items-center gap-1"
                          href={m.recap_link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Recap <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {m.key_action_items && (
                      <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                        {m.key_action_items}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMilestoneEdit({ open: true, milestone: m })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
            {(milestones.data ?? []).length === 0 && (
              <Card className="p-8 text-center text-sm text-muted-foreground">No milestones yet.</Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <EventFormDialog open={editingEvent} onOpenChange={setEditingEvent} event={e as any} />
      {speakerEdit && (
        <SpeakerFormDialog
          open={speakerEdit.open}
          onOpenChange={(o) => setSpeakerEdit(o ? speakerEdit : null)}
          speaker={speakerEdit.speaker}
          defaultEventId={eventId}
        />
      )}
      <SpeakerDetailDialog
        open={!!detailSpeaker}
        onOpenChange={(o) => !o && setDetailSpeaker(null)}
        speaker={detailSpeaker}
        event={e as any}
        onEdit={() => {
          const s = detailSpeaker;
          setDetailSpeaker(null);
          if (s) setSpeakerEdit({ open: true, speaker: s });
        }}
        onEmail={() => {
          const s = detailSpeaker;
          if (s) emailOne(s, e);
        }}
      />
      <ConfirmSendEmailDialog
        open={!!confirmEmail}
        onOpenChange={(o) => !o && setConfirmEmail(null)}
        draft={confirmEmail}
        onConfirm={performSendConfirmed}
      />
      {sponsorEdit && (
        <SponsorFormDialog
          open={sponsorEdit.open}
          onOpenChange={(o) => setSponsorEdit(o ? sponsorEdit : null)}
          sponsor={sponsorEdit.sponsor}
          eventId={eventId}
        />
      )}
      {taskEdit && (
        <WebsiteTaskFormDialog
          open={taskEdit.open}
          onOpenChange={(o) => setTaskEdit(o ? taskEdit : null)}
          task={taskEdit.task}
          defaultEventId={eventId}
        />
      )}
      {milestoneEdit && (
        <MilestoneFormDialog
          open={milestoneEdit.open}
          onOpenChange={(o) => setMilestoneEdit(o ? milestoneEdit : null)}
          milestone={milestoneEdit.milestone}
          defaultEventId={eventId}
          defaultType={milestoneEdit.type}
        />
      )}
      <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} defaultEventId={eventId} />
    </div>
  );
}

function SectionHeader({ title, onAdd }: { title: string; onAdd?: () => void }) {
  return (
    <div className="flex justify-between items-center mb-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {onAdd && (
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      )}
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
                  <div className="text-sm font-semibold text-slate-900">{TEMPLATE_LABELS[t]}</div>
                  <div className="mt-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700 tabular-nums">{info.count}</span>{" "}
                    sent all-time
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">Latest: {fmt(info.latest)}</div>
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
