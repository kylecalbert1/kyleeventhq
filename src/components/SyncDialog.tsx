import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  CalendarClock,
  Mail,
  Plug,
  UserPlus,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  Image as ImageIcon,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import {
  checkCalendarConnected,
  checkGmailSyncConnected,
  fetchLeadSuggestions,
  fetchEmailSuggestions,
  applyEmailSuggestion,
  setSpeakerStatus,
  fetchBannerVerification,
  revertBannerStatus,
} from "@/lib/sync.functions";
import { createSpeaker } from "@/lib/speakers.functions";
import { eventsQuery } from "@/lib/queries";

type LeadSuggestion = {
  email: string;
  name: string | null;
  events: Array<{ id: string; title: string; when: string }>;
};

type EmailSuggestion = {
  thread_id: string;
  subject: string;
  snippet: string;
  from: string;
  matched_speaker: { id: string; name: string; email: string; previous_status: string } | null;
  suggested_status: "confirmed" | "declined" | "needs_approval" | "unclear";
  confidence: "high" | "medium" | "low";
  reasoning: string;
  needs: { bio: boolean; headshot: boolean; banner: boolean };
  received_at: string;
};

const statusLabel: Record<EmailSuggestion["suggested_status"], string> = {
  confirmed: "Confirmed interest",
  declined: "Declined",
  needs_approval: "Needs internal approval",
  unclear: "Unclear",
};

const statusCls: Record<EmailSuggestion["suggested_status"], string> = {
  confirmed: "bg-emerald-600 text-white",
  declined: "bg-rose-600 text-white",
  needs_approval: "bg-amber-500 text-white",
  unclear: "bg-slate-400 text-white",
};

const confidenceCls: Record<EmailSuggestion["confidence"], string> = {
  high: "border-emerald-500 text-emerald-700",
  medium: "border-amber-500 text-amber-700",
  low: "border-slate-400 text-slate-600",
};

export function SyncDialog({
  open,
  onOpenChange,
  defaultEventId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultEventId?: string;
}) {
  const qc = useQueryClient();
  const events = useQuery(eventsQuery);
  const [tab, setTab] = useState<"calendar" | "email" | "banner">("calendar");
  const [eventId, setEventId] = useState<string | undefined>(
    defaultEventId && defaultEventId !== "all" ? defaultEventId : undefined,
  );

  // Connection checks
  const calStatus = useQuery({
    queryKey: ["calConnected"],
    queryFn: () => checkCalendarConnected(),
  });
  const gmailStatus = useQuery({
    queryKey: ["gmailSyncConnected"],
    queryFn: () => checkGmailSyncConnected(),
  });

  const [leads, setLeads] = useState<LeadSuggestion[] | null>(null);
  const [dismissedLeads, setDismissedLeads] = useState<Set<string>>(new Set());
  const [emailSugs, setEmailSugs] = useState<EmailSuggestion[] | null>(null);
  const [dismissedEmails, setDismissedEmails] = useState<Set<string>>(new Set());

  type BannerFlag = {
    speaker_id: string;
    speaker_name: string;
    speaker_email: string;
    banner_status: string;
    event_id: string | null;
    event_label: string | null;
  };
  const [bannerFlags, setBannerFlags] = useState<BannerFlag[] | null>(null);
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());

  const fetchLeads = useServerFn(fetchLeadSuggestions);
  const fetchEmails = useServerFn(fetchEmailSuggestions);
  const create = useServerFn(createSpeaker);
  const apply = useServerFn(applyEmailSuggestion);
  const revert = useServerFn(setSpeakerStatus);
  const fetchBanners = useServerFn(fetchBannerVerification);
  const revertBanner = useServerFn(revertBannerStatus);

  const bannerMut = useMutation({
    mutationFn: () => fetchBanners({ data: undefined as any }),
    onSuccess: (r) => {
      if (!r.connected) {
        toast.error("Gmail not connected");
        setBannerFlags([]);
        return;
      }
      setBannerFlags(r.flagged);
      toast.success(
        r.flagged.length === 0
          ? "All sent banners have matching Gmail evidence"
          : `Flagged ${r.flagged.length} speaker${r.flagged.length === 1 ? "" : "s"} with no matching sent email`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Banner check failed"),
  });

  const leadsMut = useMutation({
    mutationFn: () => fetchLeads({ data: { pastDays: 30, futureDays: 60 } }),
    onSuccess: (r) => {
      if (!r.connected) {
        toast.error("Google Calendar not connected");
        setLeads([]);
        return;
      }
      setLeads(r.suggestions);
      toast.success(`Found ${r.suggestions.length} new lead${r.suggestions.length === 1 ? "" : "s"}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  const emailMut = useMutation({
    mutationFn: () => fetchEmails({ data: undefined as any }),
    onSuccess: async (r) => {
      if (!r.connected) {
        toast.error("Gmail not connected");
        setEmailSugs([]);
        return;
      }

      // Split: auto-apply high-confidence with a matched speaker + actionable status.
      const auto = r.suggestions.filter(
        (s) =>
          s.matched_speaker &&
          s.confidence === "high" &&
          s.suggested_status !== "unclear",
      );
      const manual = r.suggestions.filter((s) => !auto.includes(s));
      setEmailSugs(manual);

      let applied = 0;
      for (const sug of auto) {
        try {
          await apply({
            data: {
              speaker_id: sug.matched_speaker!.id,
              suggested_status: sug.suggested_status,
            },
          });
          applied++;
          setDismissedEmails((s) => new Set(s).add(sug.thread_id));
          const prev = sug.matched_speaker!.previous_status as
            | "contacted"
            | "responded"
            | "confirmed"
            | "declined";
          const name = sug.matched_speaker!.name;
          const speakerId = sug.matched_speaker!.id;
          toast.success(
            `Auto-applied "${statusLabel[sug.suggested_status]}" to ${name}`,
            {
              duration: 15000,
              description: sug.reasoning,
              action: {
                label: "Undo",
                onClick: async () => {
                  try {
                    await revert({ data: { speaker_id: speakerId, status: prev } });
                    qc.invalidateQueries({ queryKey: ["speakers"] });
                    toast.success(`Reverted ${name} to ${prev}`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Undo failed");
                  }
                },
              },
            },
          );
        } catch (e) {
          console.error("Auto-apply failed", e);
        }
      }
      if (applied > 0) qc.invalidateQueries({ queryKey: ["speakers"] });
      toast.success(
        `Reviewed ${r.suggestions.length} thread${r.suggestions.length === 1 ? "" : "s"} · ${applied} auto-applied · ${manual.length} to review`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  async function addLead(lead: LeadSuggestion) {
    if (!eventId) {
      toast.error("Pick an event first");
      return;
    }
    try {
      await create({
        data: {
          event_id: eventId,
          name: lead.name || lead.email.split("@")[0],
          email: lead.email,
          status: "contacted",
          banner_status: "not_started",
          bio_received: false,
          headshot_received: false,
          linkedin_post_confirmed: false,
        } as any,
      });
      setDismissedLeads((s) => new Set(s).add(lead.email));
      qc.invalidateQueries({ queryKey: ["speakers"] });
      toast.success(`Added ${lead.name ?? lead.email} as lead`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add lead");
    }
  }

  async function applyStatus(sug: EmailSuggestion) {
    if (!sug.matched_speaker) {
      toast.error("No matching speaker record");
      return;
    }
    const prev = sug.matched_speaker.previous_status as
      | "contacted"
      | "responded"
      | "confirmed"
      | "declined";
    const name = sug.matched_speaker.name;
    const speakerId = sug.matched_speaker.id;
    try {
      await apply({
        data: {
          speaker_id: speakerId,
          suggested_status: sug.suggested_status,
        },
      });
      setDismissedEmails((s) => new Set(s).add(sug.thread_id));
      qc.invalidateQueries({ queryKey: ["speakers"] });
      toast.success(`Updated ${name}`, {
        duration: 15000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await revert({ data: { speaker_id: speakerId, status: prev } });
              qc.invalidateQueries({ queryKey: ["speakers"] });
              toast.success(`Reverted ${name} to ${prev}`);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Undo failed");
            }
          },
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Sync
          </DialogTitle>
          <DialogDescription>
            Pull new leads from your calendar and read-only status suggestions from Gmail.
            Nothing is created or updated without your click.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="calendar" className="gap-2">
              <CalendarClock className="h-4 w-4" /> Calendar leads
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" /> Email thread status
            </TabsTrigger>
            <TabsTrigger value="banner" className="gap-2">
              <ImageIcon className="h-4 w-4" /> Banner check
            </TabsTrigger>
          </TabsList>

          {/* CALENDAR TAB */}
          <TabsContent value="calendar" className="flex-1 overflow-y-auto space-y-3 mt-3 pr-1">
            {calStatus.data && !calStatus.data.connected ? (
              <ConnectPrompt
                title="Connect Google Calendar"
                description="Link a Google Calendar account in Connectors to sync attendees as leads."
              />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Assign leads to:</span>
                    <Select value={eventId ?? ""} onValueChange={(v) => setEventId(v)}>
                      <SelectTrigger className="w-48 h-8 text-xs">
                        <SelectValue placeholder="Pick an event…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(events.data ?? []).map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => leadsMut.mutate()}
                    disabled={leadsMut.isPending}
                  >
                    {leadsMut.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1.5" />
                    )}
                    {leads ? "Refresh" : "Scan calendar"}
                  </Button>
                </div>

                {leads === null ? (
                  <EmptyHint
                    icon={<CalendarClock className="h-6 w-6" />}
                    text="Click Scan calendar to look for external attendees from the last 30 days and next 60 days."
                  />
                ) : leads.filter((l) => !dismissedLeads.has(l.email)).length === 0 ? (
                  <EmptyHint icon={<CheckCircle2 className="h-6 w-6" />} text="No new leads to review." />
                ) : (
                  leads
                    .filter((l) => !dismissedLeads.has(l.email))
                    .map((lead) => (
                      <Card key={lead.email} className="p-3 transition-all hover:shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate">
                              {lead.name ?? lead.email.split("@")[0]}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {lead.email}
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {lead.events.slice(0, 3).map((ev, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px] font-normal">
                                  {ev.title}
                                </Badge>
                              ))}
                              {lead.events.length > 3 && (
                                <Badge variant="outline" className="text-[10px]">
                                  +{lead.events.length - 3} more
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              onClick={() => addLead(lead)}
                              disabled={!eventId}
                              title={!eventId ? "Pick an event first" : "Create speaker record"}
                            >
                              <UserPlus className="h-3.5 w-3.5 mr-1" /> Add as lead
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setDismissedLeads((s) => new Set(s).add(lead.email))
                              }
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))
                )}
              </>
            )}
          </TabsContent>

          {/* EMAIL TAB */}
          <TabsContent value="email" className="flex-1 overflow-y-auto space-y-3 mt-3 pr-1">
            {gmailStatus.data && !gmailStatus.data.connected ? (
              <ConnectPrompt
                title="Connect Gmail"
                description="Link a Gmail account in Connectors to review speaker threads."
              />
            ) : (
              <>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => emailMut.mutate()}
                    disabled={emailMut.isPending}
                  >
                    {emailMut.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1.5" />
                    )}
                    {emailSugs ? "Refresh" : "Scan Gmail"}
                  </Button>
                </div>

                {emailSugs === null ? (
                  <EmptyHint
                    icon={<Mail className="h-6 w-6" />}
                    text="Click Scan Gmail to read recent speaker-related threads. This may take a moment."
                  />
                ) : emailSugs.filter((s) => !dismissedEmails.has(s.thread_id)).length === 0 ? (
                  <EmptyHint icon={<CheckCircle2 className="h-6 w-6" />} text="No suggestions to review." />
                ) : (
                  emailSugs
                    .filter((s) => !dismissedEmails.has(s.thread_id))
                    .map((sug) => (
                      <Card key={sug.thread_id} className="p-3 transition-all hover:shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={statusCls[sug.suggested_status]}>
                                {statusLabel[sug.suggested_status]}
                              </Badge>
                              <Badge variant="outline" className={`text-[10px] ${confidenceCls[sug.confidence]}`}>
                                {sug.confidence} confidence
                              </Badge>
                              {sug.matched_speaker ? (
                                <span className="text-xs font-medium">
                                  {sug.matched_speaker.name}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">
                                  No matching speaker
                                </span>
                              )}
                            </div>
                            <div className="font-medium text-sm mt-1.5 truncate">
                              {sug.subject}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {sug.from}
                            </div>
                            <div className="text-xs mt-1.5 text-foreground/80 line-clamp-2">
                              {sug.snippet}
                            </div>
                            <div className="text-[11px] italic text-muted-foreground mt-1">
                              AI: {sug.reasoning}
                            </div>
                            {(sug.needs.bio || sug.needs.headshot || sug.needs.banner) && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {sug.needs.bio && (
                                  <Badge variant="outline" className="text-[10px] border-orange-400 text-orange-700">
                                    <AlertTriangle className="h-3 w-3 mr-1" /> Mentions bio
                                  </Badge>
                                )}
                                {sug.needs.headshot && (
                                  <Badge variant="outline" className="text-[10px] border-orange-400 text-orange-700">
                                    <AlertTriangle className="h-3 w-3 mr-1" /> Mentions headshot
                                  </Badge>
                                )}
                                {sug.needs.banner && (
                                  <Badge variant="outline" className="text-[10px] border-orange-400 text-orange-700">
                                    <AlertTriangle className="h-3 w-3 mr-1" /> Mentions banner
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            <Button
                              size="sm"
                              onClick={() => applyStatus(sug)}
                              disabled={!sug.matched_speaker || sug.suggested_status === "unclear"}
                              title={
                                !sug.matched_speaker
                                  ? "No matching speaker"
                                  : sug.suggested_status === "unclear"
                                  ? "Nothing conclusive to apply"
                                  : "Update speaker status"
                              }
                            >
                              Apply status
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setDismissedEmails((s) => new Set(s).add(sug.thread_id))
                              }
                            >
                              <X className="h-4 w-4 mr-1" /> Dismiss
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function EmptyHint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 py-10 px-4 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
      <div className="text-muted-foreground/60">{icon}</div>
      {text}
    </div>
  );
}

function ConnectPrompt({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-4">
      <div className="flex items-start gap-3">
        <Plug className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-medium text-sm">{title}</div>
          <div className="text-xs text-muted-foreground mt-1">{description}</div>
          <a
            href="/dashboard/connectors"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-primary hover:underline"
          >
            Open Connectors →
          </a>
        </div>
      </div>
    </div>
  );
}
