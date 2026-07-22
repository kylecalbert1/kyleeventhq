import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Sparkles,
  Search,
  CalendarDays,
  MapPin,
  Users as UsersIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SpeakerListCard } from "@/components/speakers/SpeakerListCard";
import { useContactHistory } from "@/hooks/use-contact-history";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { StatusPill } from "@/components/StatusPill";
import {
  eventQuery,
  speakersQuery,
  sponsorsQuery,
  websiteTasksQuery,
  milestonesQuery,
  emailSendsQuery,
  eventReconciliationQuery,
} from "@/lib/queries";
import { labels, pillClass } from "@/lib/status";
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
import { SendMessageDialog } from "@/components/SendMessageDialog";
import { EmailTemplateManagerDialog } from "@/components/EmailTemplateManagerDialog";
import { Checkbox } from "@/components/ui/checkbox";


import { sendGmailEmail } from "@/lib/email.functions";
import { firstNameOf } from "@/lib/gmail";
import { SyncDialog } from "@/components/SyncDialog";
import { TitoEventPanel } from "@/components/events/TitoEventPanel";
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
  const speakerEmails = useMemo(
    () => (speakers.data ?? []).map((s: any) => s.email as string | null),
    [speakers.data],
  );
  const { lookup: lookupHistory } = useContactHistory(speakerEmails);
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
  const [sendOpen, setSendOpen] = useState<null | { seedEmails?: string[]; seedGroup?: "prospective" | "current_confirmed" | "past_speakers" | "confirmed_not_registered" }>(null);
  const [templateMgrOpen, setTemplateMgrOpen] = useState(false);
  const sendEmail = useServerFn(sendGmailEmail);

  function emailOne(s: any, ev: any) {
    if (!s.email) { toast.error("No email on file"); return; }
    const firstName = firstNameOf(s.name);
    const code = ev?.code ?? "our upcoming event";
    setConfirmEmail({
      to: s.email,
      recipientName: firstName,
      subject: `${code} - quick check-in`,
      body: `Hi ${firstName},\n\nJust following up on your session for ${code}. Let me know if you need anything from us - happy to help move things forward.\n\nThanks!`,
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

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [filterKey, setFilterKey] = useState<
    | "all"
    | "confirmed"
    | "prospective"
    | "needs_chasing"
    | "missing_assets"
    | "not_registered"
    | "registered"
    | "declined"
  >("all");



  if (!event.data) return null;
  const e = event.data;

  const recon = useQuery({
    ...eventReconciliationQuery(eventId),
    enabled: Boolean((e as any).tito_slug),
  });
  const needsRegIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of recon.data?.needsRegistration ?? []) ids.add(r.id);
    return ids;
  }, [recon.data]);

  const allSpeakers = (speakers.data ?? []) as any[];
  const isProspective = (s: any) =>
    s.status === "new" || s.status === "contacted" || s.status === "responded";
  const isMissingAssets = (s: any) => {
    if (typeof s.bio_and_headshot_received === "boolean") return !s.bio_and_headshot_received;
    return !(s.bio_received && s.headshot_received);
  };
  const needsChasing = (s: any) => {
    if (s.status !== "contacted" && s.status !== "responded") return false;
    if (s.last_message_direction !== "outbound") return false;
    if (!s.last_message_at) return true;
    const days = (Date.now() - new Date(s.last_message_at).getTime()) / 86400000;
    return days >= 3;
  };
  const notRegisteredInTito = (s: any) =>
    s.status === "confirmed" && needsRegIds.has(s.id);
  const registeredInTito = (s: any) =>
    s.status === "confirmed" && !needsRegIds.has(s.id) && Boolean((e as any).tito_slug);

  const counts = {
    all: allSpeakers.length,
    confirmed: allSpeakers.filter((s) => s.status === "confirmed").length,
    prospective: allSpeakers.filter(isProspective).length,
    needsChasing: allSpeakers.filter(needsChasing).length,
    missingAssets: allSpeakers.filter(isMissingAssets).length,
    notRegistered: allSpeakers.filter(notRegisteredInTito).length,
    declined: allSpeakers.filter((s) => s.status === "declined").length,
    registeredTito: allSpeakers.filter(registeredInTito).length,
  };

  type FilterKey =
    | "all"
    | "confirmed"
    | "prospective"
    | "needs_chasing"
    | "missing_assets"
    | "not_registered"
    | "registered"
    | "declined";

  function applyFilter(list: any[]): any[] {
    switch (filterKey) {
      case "confirmed": return list.filter((s) => s.status === "confirmed");
      case "prospective": return list.filter(isProspective);
      case "needs_chasing": return list.filter(needsChasing);
      case "missing_assets": return list.filter(isMissingAssets);
      case "not_registered": return list.filter(notRegisteredInTito);
      case "registered": return list.filter(registeredInTito);
      case "declined": return list.filter((s) => s.status === "declined");
      default: return list;
    }
  }

  const eventDate = e.event_date ? new Date(e.event_date) : null;
  const tz = "Europe/London";
  const dayLabel = eventDate
    ? new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: tz,
      }).format(eventDate)
    : "Date TBC";
  const tzShort = eventDate
    ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" })
        .formatToParts(eventDate)
        .find((p) => p.type === "timeZoneName")?.value ?? tz
    : tz;
  const speakerTarget = (e as any).speaker_target ?? 0;

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

      {/* Header card */}
      <Card className="p-5 rounded-2xl border-slate-200/70">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
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
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                {dayLabel} <span className="text-slate-400">({tzShort})</span>
              </span>
              {e.venue && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  {e.venue}
                </span>
              )}
              {e.owner && <span className="text-slate-500">Owner: {e.owner}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-3.5 py-2">
              <UsersIcon className="h-4 w-4 text-indigo-600" />
              <span className="text-xs uppercase tracking-wider text-indigo-700/80 font-semibold">
                Confirmed
              </span>
              <span className="text-lg font-bold text-indigo-900 tabular-nums">
                {counts.confirmed}
                <span className="text-indigo-400 font-normal"> / </span>
                <span className="text-indigo-700">{speakerTarget || "-"}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <StatusPill className={pillClass.website[e.website_status as never]}>
                {labels.website[e.website_status as never]}
              </StatusPill>
              <Button variant="outline" size="sm" onClick={() => setEditingEvent(true)}>
                <Pencil className="h-4 w-4 mr-1.5" />
                Edit event
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSyncOpen(true)}>
                <Sparkles className="h-4 w-4 mr-1.5" />
                Sync from Tito
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSendOpen({})}>
                <Send className="h-4 w-4 mr-1.5" />
                Send message
              </Button>
              <Button size="sm" onClick={() => setSpeakerEdit({ open: true })}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add attendee
              </Button>
            </div>
          </div>
        </div>

        {/* Status chips as filters */}
        <div className="mt-4 flex flex-wrap gap-2">
          <FilterChip
            active={filterKey === "confirmed"}
            onClick={() => setFilterKey(filterKey === "confirmed" ? "all" : "confirmed")}
            tone="emerald"
            label="Confirmed"
            count={counts.confirmed}
          />
          <FilterChip
            active={filterKey === "prospective"}
            onClick={() => setFilterKey(filterKey === "prospective" ? "all" : "prospective")}
            tone="sky"
            label="Prospective"
            count={counts.prospective}
          />
          {(e as any).tito_slug && (
            <>
              <FilterChip
                active={filterKey === "registered"}
                onClick={() => setFilterKey(filterKey === "registered" ? "all" : "registered")}
                tone="violet"
                label="Registered in Tito"
                count={counts.registeredTito}
              />
              <FilterChip
                active={filterKey === "not_registered"}
                onClick={() => setFilterKey(filterKey === "not_registered" ? "all" : "not_registered")}
                tone="amber"
                label="Not yet registered"
                count={counts.notRegistered}
              />
            </>
          )}
        </div>
      </Card>

      <TitoEventPanel eventId={eventId} hasTitoSlug={Boolean((e as any).tito_slug)} />

      {/* Speakers section: one search bar + one filter row */}
      <section className="space-y-3">
        <div className="accent-bar mb-2" />
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px] max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-10"
              placeholder="Search speakers by name, company, email"
              value={speakerQ}
              onChange={(ev) => setSpeakerQ(ev.target.value)}
            />
          </div>
          <Select value={filterKey} onValueChange={(v) => setFilterKey(v as FilterKey)}>
            <SelectTrigger className="h-10 w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({counts.all})</SelectItem>
              <SelectItem value="confirmed">Confirmed ({counts.confirmed})</SelectItem>
              <SelectItem value="prospective">Prospective ({counts.prospective})</SelectItem>
              <SelectItem value="needs_chasing">Needs chasing ({counts.needsChasing})</SelectItem>
              <SelectItem value="missing_assets">
                Missing bio or headshot ({counts.missingAssets})
              </SelectItem>
              {(e as any).tito_slug && (
                <SelectItem value="not_registered">
                  Not registered in Tito ({counts.notRegistered})
                </SelectItem>
              )}
              <SelectItem value="declined">Declined ({counts.declined})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(() => {
          const term = speakerQ.trim().toLowerCase();
          const searched = term
            ? allSpeakers.filter((s) => {
                const hay = `${s.name ?? ""} ${s.company ?? ""} ${s.email ?? ""} ${s.title ?? ""}`.toLowerCase();
                return hay.includes(term);
              })
            : allSpeakers;
          const filtered = applyFilter(searched);
          const selectedIds = Object.keys(selected).filter((k) => selected[k]);
          const selectedSpeakers = filtered.filter((s) => selected[s.id]);
          const allVisibleChecked =
            filtered.length > 0 && filtered.every((s) => selected[s.id]);
          return (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-500">
                  Showing {filtered.length} of {allSpeakers.length}
                </div>
                {filtered.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer px-2 py-1 rounded-md hover:bg-muted/60 transition-colors">
                    <Checkbox
                      checked={allVisibleChecked}
                      onCheckedChange={(v) => {
                        const next = { ...selected };
                        if (v) filtered.forEach((s) => (next[s.id] = true));
                        else filtered.forEach((s) => delete next[s.id]);
                        setSelected(next);
                      }}
                    />
                    Select all visible
                  </label>
                )}
              </div>

              <div
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  selectedIds.length > 0 ? "max-h-24 opacity-100 mb-4" : "max-h-0 opacity-0 mb-0"
                }`}
              >
                <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 shadow-sm">
                  <div className="text-sm font-medium">
                    {selectedIds.length} speaker{selectedIds.length === 1 ? "" : "s"} selected
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => setSelected({})}>
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        setSendOpen({
                          seedEmails: selectedSpeakers
                            .map((s) => s.email)
                            .filter((e): e is string => !!e),
                        })
                      }
                    >
                      <Mail className="h-4 w-4 mr-1.5" />
                      Send message
                    </Button>
                  </div>
                </div>
              </div>

              {allSpeakers.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                  No speakers yet.
                </Card>
              ) : filtered.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                  No speakers match this filter.
                </Card>
              ) : (
                <div className="space-y-3">
                  {filtered.map((s: any) => (
                    <SpeakerListCard
                      key={s.id}
                      s={s}
                      ev={e}
                      showEventChip={false}
                      selected={!!selected[s.id]}
                      onToggleSelect={(v) => setSelected({ ...selected, [s.id]: v })}
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
                      onStatusChange={async (next) => {
                        try {
                          const { updateSpeaker } = await import("@/lib/speakers.functions");
                          await updateSpeaker({ data: { id: s.id, patch: { status: next } } });
                          await qc.invalidateQueries({ queryKey: ["speakers", eventId] });
                          await qc.invalidateQueries({ queryKey: ["eventReconciliation", eventId] });
                          toast.success(`Status set to ${next}`);
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Couldn't update status");
                        }
                      }}
                      history={lookupHistory(s.email)}
                    />
                  ))}
                </div>
              )}

              <BulkEmailDialog
                open={bulkEmailOpen}
                onOpenChange={setBulkEmailOpen}
                speakers={selectedSpeakers}
                eventId={eventId}
              />
            </>
          );
        })()}
      </section>



      {/* ─── Messaging ─── */}
      <section className="space-y-3">
        <div className="accent-bar mb-2" />
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-indigo-600" /> Messaging
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              One send flow for every audience. Open Send message to pick a template, edit copy, and choose recipients.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTemplateMgrOpen(true)}>
              <Pencil className="h-4 w-4 mr-1.5" /> Manage templates
            </Button>
            <Button size="sm" onClick={() => setSendOpen({})}>
              <Send className="h-4 w-4 mr-1.5" /> Send message
            </Button>
          </div>
        </div>
        <SendHistoryPanel eventId={eventId} defaultOpen title="Send history (this event)" />
      </section>

      {/* ─── Sponsors ─── */}
      <section className="space-y-6">
        <div className="accent-bar mb-2" />
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
                    <TableCell>{s.linkedin_post_confirmed ? "✓" : "-"}</TableCell>
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
      </section>

      {/* ─── Website tasks ─── */}
      <section className="space-y-3">
        <div className="accent-bar mb-2" />
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
                  className="p-4 hover:shadow-sm transition-shadow cursor-pointer bg-card rounded-2xl border-slate-200/70"
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
      </section>

      {/* ─── Kickoff & Washup ─── */}
      <section className="space-y-4">
        <div className="accent-bar mb-2" />
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
                      {m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString() : "-"}
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
      </section>

      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        Looking for LinkedIn outreach templates or the agenda builder? They now live
        in their own top-level pages - <Link to="/outreach-templates" className="underline font-medium">Outreach</Link>{" "}
        and <Link to="/agenda" className="underline font-medium">Agenda</Link> - with an event picker at the top.
      </div>


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
      {sendOpen && (
        <SendMessageDialog
          open={!!sendOpen}
          onOpenChange={(o) => !o && setSendOpen(null)}
          eventId={eventId}
          seedRecipientEmails={sendOpen.seedEmails}
          seedGroup={sendOpen.seedGroup}
        />
      )}
      <EmailTemplateManagerDialog open={templateMgrOpen} onOpenChange={setTemplateMgrOpen} />
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

const chipTones = {
  emerald: "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
  sky: "bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100",
  violet: "bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100",
  amber: "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100",
} as const;

const chipToneActive = {
  emerald: "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-600",
  sky: "bg-sky-600 text-white border-sky-600 hover:bg-sky-600",
  violet: "bg-violet-600 text-white border-violet-600 hover:bg-violet-600",
  amber: "bg-amber-600 text-white border-amber-600 hover:bg-amber-600",
} as const;

function FilterChip({
  label,
  count,
  active,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone: keyof typeof chipTones;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
        active ? chipToneActive[tone] : chipTones[tone]
      }`}
    >
      {label}
      <span
        className={`inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 min-w-[1.25rem] ${
          active ? "bg-white/20 text-white" : "bg-white/70 text-current"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

}
