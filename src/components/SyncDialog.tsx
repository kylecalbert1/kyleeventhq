import { SearchableSelect } from "@/components/ui/searchable-select";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  FileText,
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
  fetchBioSuggestions,
  applyBioSuggestion,
  revertBio,
} from "@/lib/sync.functions";
import { createSpeaker, listSpeakers } from "@/lib/speakers.functions";
import { eventsQuery } from "@/lib/queries";

type Confidence = "high" | "medium" | "low";

type Item =
  | {
      kind: "lead";
      key: string;
      confidence: Confidence;
      email: string;
      name: string | null;
      events: Array<{ id: string; title: string; when: string }>;
    }
  | {
      kind: "email";
      key: string;
      confidence: Confidence;
      thread_id: string;
      subject: string;
      snippet: string;
      from: string;
      speaker_email: string | null;
      matched_speaker:
        | { id: string; name: string; email: string; previous_status: string }
        | null;
      suggested_status: "confirmed" | "declined" | "needs_approval" | "unclear";
      reasoning: string;
      needs: { bio: boolean; headshot: boolean; banner: boolean };
    }
  | {
      kind: "asset";
      key: string;
      confidence: Confidence;
      // Either a bio suggestion (auto-fills bio_text) OR a banner-missing flag.
      variant: "bio" | "banner";
      speaker_id: string;
      speaker_name: string;
      speaker_email: string;
      event_label: string | null;
      // For bio:
      bio_text?: string;
      previous_bio?: string | null;
      subject?: string;
      // For banner:
      banner_status?: string;
      reasoning: string;
    };

const statusLabel: Record<
  "confirmed" | "declined" | "needs_approval" | "unclear",
  string
> = {
  confirmed: "Confirmed interest",
  declined: "Declined",
  needs_approval: "Needs internal approval",
  unclear: "Unclear",
};

const statusCls: Record<
  "confirmed" | "declined" | "needs_approval" | "unclear",
  string
> = {
  confirmed: "bg-emerald-600 text-white",
  declined: "bg-rose-600 text-white",
  needs_approval: "bg-amber-500 text-white",
  unclear: "bg-slate-400 text-white",
};

const confidenceCls: Record<Confidence, string> = {
  high: "border-emerald-500 text-emerald-700",
  medium: "border-amber-500 text-amber-700",
  low: "border-slate-400 text-slate-600",
};

const confidenceRank: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

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
  const [eventId, setEventId] = useState<string | undefined>(
    defaultEventId && defaultEventId !== "all" ? defaultEventId : undefined,
  );

  const calStatus = useQuery({
    queryKey: ["calConnected"],
    queryFn: () => checkCalendarConnected(),
  });
  const gmailStatus = useQuery({
    queryKey: ["gmailSyncConnected"],
    queryFn: () => checkGmailSyncConnected(),
  });

  const [items, setItems] = useState<Item[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<{
    autoApplied: number;
    manual: number;
    scanned: number;
    warnings: string[];
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [resolving, setResolving] = useState<Extract<Item, { kind: "email" }> | null>(null);

  const fetchLeads = useServerFn(fetchLeadSuggestions);
  const fetchEmails = useServerFn(fetchEmailSuggestions);
  const create = useServerFn(createSpeaker);
  const apply = useServerFn(applyEmailSuggestion);
  const setStatus = useServerFn(setSpeakerStatus);
  const fetchBanners = useServerFn(fetchBannerVerification);
  const revertBanner = useServerFn(revertBannerStatus);
  const fetchBios = useServerFn(fetchBioSuggestions);
  const applyBio = useServerFn(applyBioSuggestion);
  const revertBioFn = useServerFn(revertBio);
  const allSpeakers = useQuery({
    queryKey: ["allSpeakers"],
    queryFn: () => listSpeakers({ data: {} }),
    enabled: open,
  });

  async function runAllScans() {
    setRunning(true);
    setItems(null);
    setSummary(null);
    setDismissed(new Set());
    const collected: Item[] = [];
    const warnings: string[] = [];
    let autoApplied = 0;
    let scanned = 0;

    // 1) Calendar leads (public data)
    if (calStatus.data?.connected) {
      try {
        const r = await fetchLeads({ data: { pastDays: 30, futureDays: 60 } });
        if (r.connected) {
          scanned += r.suggestions.length;
          for (const l of r.suggestions) {
            collected.push({
              kind: "lead",
              key: `lead:${l.email}`,
              // Leads always need Kyle's event assignment → treat as medium.
              confidence: "medium",
              email: l.email,
              name: l.name,
              events: l.events,
            });
          }
        } else {
          warnings.push("Google Calendar not connected");
        }
      } catch (e) {
        warnings.push(
          `Calendar scan failed: ${e instanceof Error ? e.message : "unknown"}`,
        );
      }
    } else {
      warnings.push("Google Calendar not connected");
    }

    // 2) Email status
    if (gmailStatus.data?.connected) {
      try {
        const r = await fetchEmails({ data: undefined as never });
        if (r.connected) {
          scanned += r.suggestions.length;
          for (const s of r.suggestions) {
            const canAutoApply =
              s.matched_speaker &&
              s.confidence === "high" &&
              s.suggested_status !== "unclear";
            if (canAutoApply && s.matched_speaker) {
              try {
                await apply({
                  data: {
                    speaker_id: s.matched_speaker.id,
                    suggested_status: s.suggested_status,
                  },
                });
                autoApplied++;
                continue;
              } catch (e) {
                console.error("Auto-apply email failed", e);
              }
            }
            collected.push({
              kind: "email",
              key: `email:${s.thread_id}`,
              confidence: s.confidence,
              thread_id: s.thread_id,
              subject: s.subject,
              snippet: s.snippet,
              from: s.from,
              speaker_email: s.speaker_email ?? null,
              matched_speaker: s.matched_speaker,
              suggested_status: s.suggested_status,
              reasoning: s.reasoning,
              needs: s.needs,
            });
          }
        } else {
          warnings.push("Gmail not connected");
        }
      } catch (e) {
        warnings.push(
          `Email scan failed: ${e instanceof Error ? e.message : "unknown"}`,
        );
      }

      // 3) Bio detection
      try {
        const r = await fetchBios({ data: undefined as never });
        if (r.connected) {
          scanned += r.suggestions.length;
          for (const s of r.suggestions) {
            if (s.confidence === "high") {
              try {
                await applyBio({
                  data: { speaker_id: s.speaker_id, bio_text: s.bio_text },
                });
                autoApplied++;
                continue;
              } catch (e) {
                console.error("Auto-apply bio failed", e);
              }
            }
            collected.push({
              kind: "asset",
              variant: "bio",
              key: `bio:${s.speaker_id}:${s.thread_id}`,
              confidence: s.confidence,
              speaker_id: s.speaker_id,
              speaker_name: s.speaker_name,
              speaker_email: s.speaker_email,
              event_label: null,
              bio_text: s.bio_text,
              previous_bio: s.previous_bio,
              subject: s.subject,
              reasoning: s.reasoning,
            });
          }
        }
      } catch (e) {
        warnings.push(
          `Bio scan failed: ${e instanceof Error ? e.message : "unknown"}`,
        );
      }

      // 4) Banner verification (merged into Assets)
      try {
        const r = await fetchBanners({ data: undefined as never });
        if (r.connected) {
          scanned += r.flagged.length;
          for (const f of r.flagged) {
            // No confidence from the server - always manual medium.
            collected.push({
              kind: "asset",
              variant: "banner",
              key: `banner:${f.speaker_id}`,
              confidence: "medium",
              speaker_id: f.speaker_id,
              speaker_name: f.speaker_name,
              speaker_email: f.speaker_email,
              event_label: f.event_label,
              banner_status: f.banner_status,
              reasoning: `Banner status is "${f.banner_status}" but no matching sent email was found.`,
            });
          }
        }
      } catch (e) {
        warnings.push(
          `Banner scan failed: ${e instanceof Error ? e.message : "unknown"}`,
        );
      }
    } else {
      warnings.push("Gmail not connected");
    }

    // Sort by confidence: high → medium → low, then keep original order.
    collected.sort(
      (a, b) => confidenceRank[a.confidence] - confidenceRank[b.confidence],
    );

    setItems(collected);
    setSummary({ autoApplied, manual: collected.length, scanned, warnings });
    setRunning(false);
    if (autoApplied > 0) qc.invalidateQueries({ queryKey: ["speakers"] });
    qc.invalidateQueries({ queryKey: ["asanaProofingDues"] });

    toast.success(
      `Sync complete - ${autoApplied} auto-applied · ${collected.length} to review`,
    );
  }

  const visible = useMemo(
    () => (items ?? []).filter((i) => !dismissed.has(i.key)),
    [items, dismissed],
  );

  async function addLead(l: Extract<Item, { kind: "lead" }>, overrideEventId?: string) {
    const targetEventId = overrideEventId ?? eventId;
    if (!targetEventId) {
      toast.error(
        "Pick an event for this lead - use the per-card picker, or set a default at the top.",
      );
      return;
    }
    try {
      await create({
        data: {
          event_id: targetEventId,
          // Never derive a name from the email local-part - that produced
          // greetings like "Hi rayotero323,". Store a neutral placeholder
          // instead so greeting helpers fall back to "Hi there,".
          name: (l.name ?? "").trim() || "Unnamed",
          email: l.email,
          status: "contacted",
          banner_status: "not_started",
          bio_received: false,
          headshot_received: false,
          linkedin_post_confirmed: false,
        } as never,
      });
      setDismissed((s) => new Set(s).add(l.key));
      qc.invalidateQueries({ queryKey: ["speakers"] });
      toast.success(`Added ${l.name ?? l.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add lead");
    }
  }


  async function applyEmail(it: Extract<Item, { kind: "email" }>) {
    if (!it.matched_speaker || it.suggested_status === "unclear") {
      setResolving(it);
      return;
    }
    const prev = it.matched_speaker.previous_status as
      | "contacted"
      | "responded"
      | "confirmed"
      | "declined";
    const name = it.matched_speaker.name;
    const speakerId = it.matched_speaker.id;
    try {
      await apply({
        data: {
          speaker_id: speakerId,
          suggested_status: it.suggested_status,
        },
      });
      setDismissed((s) => new Set(s).add(it.key));
      qc.invalidateQueries({ queryKey: ["speakers"] });
      toast.success(`Updated ${name}`, {
        duration: 12000,
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                await setStatus({ data: { speaker_id: speakerId, status: prev } });
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

  async function resolveEmail(
    it: Extract<Item, { kind: "email" }>,
    resolution: {
      speakerId?: string;
      newSpeaker?: { eventId: string; name: string; email: string };
      status: "confirmed" | "declined" | "responded" | "in_conversation";
    },
  ) {
    let speakerId: string;
    let speakerName: string;
    let previousStatus: string;
    try {
      if (resolution.newSpeaker) {
        const row = await create({
          data: {
            event_id: resolution.newSpeaker.eventId,
            name: resolution.newSpeaker.name,
            email: resolution.newSpeaker.email,
            status: resolution.status,
            banner_status: "not_started",
            linkedin_post_confirmed: false,
          } as never,
        });
        speakerId = row.id;
        speakerName = row.name;
        previousStatus = "new";
      } else if (resolution.speakerId) {
        const speaker = allSpeakers.data?.find((s) => s.id === resolution.speakerId);
        if (!speaker) throw new Error("Speaker not found");
        speakerId = speaker.id;
        speakerName = speaker.name;
        previousStatus = speaker.status;
        await setStatus({
          data: { speaker_id: speakerId, status: resolution.status },
        });
      } else {
        throw new Error("Choose a speaker or create a new one");
      }
      setResolving(null);
      setDismissed((s) => new Set(s).add(it.key));
      qc.invalidateQueries({ queryKey: ["speakers"] });
      toast.success(`Updated ${speakerName}`, {
        duration: 12000,
            action: {
              label: "Undo",
              onClick: async () => {
                try {
                  await setStatus({
                    data: { speaker_id: speakerId, status: previousStatus as any },
                  });
                  qc.invalidateQueries({ queryKey: ["speakers"] });
                  toast.success(`Reverted ${speakerName} to ${previousStatus}`);
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

  async function applyAsset(it: Extract<Item, { kind: "asset" }>) {
    try {
      if (it.variant === "bio" && it.bio_text) {
        await applyBio({
          data: { speaker_id: it.speaker_id, bio_text: it.bio_text },
        });
        setDismissed((s) => new Set(s).add(it.key));
        qc.invalidateQueries({ queryKey: ["speakers"] });
        const prevBio = it.previous_bio ?? null;
        toast.success(`Applied bio for ${it.speaker_name}`, {
          duration: 12000,
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                await revertBioFn({
                  data: { speaker_id: it.speaker_id, previous_bio: prevBio },
                });
                qc.invalidateQueries({ queryKey: ["speakers"] });
                toast.success(`Reverted bio for ${it.speaker_name}`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Undo failed");
              }
            },
          },
        });
      } else if (it.variant === "banner") {
        await revertBanner({ data: { speaker_id: it.speaker_id } });
        setDismissed((s) => new Set(s).add(it.key));
        qc.invalidateQueries({ queryKey: ["speakers"] });
        toast.success(`Reverted ${it.speaker_name} banner to Not started`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply");
    }
  }

  const disconnected =
    calStatus.data && !calStatus.data.connected && gmailStatus.data && !gmailStatus.data.connected;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Scan Gmail & Calendar
          </DialogTitle>
          <DialogDescription>
            Runs Calendar leads, Gmail status, and Bio + Banner checks together.
            High-confidence hits are applied automatically - only the ambiguous
            ones land here for your review.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Default event for new leads
              <span className="ml-1 text-muted-foreground/70">(optional)</span>
            </span>
            <SearchableSelect
              triggerClassName="w-52 h-8 text-xs"
              placeholder="None - pick per lead"
              searchPlaceholder="Search events…"
              value={eventId ?? ""}
              onValueChange={(v) => setEventId(v || undefined)}
              options={(events.data ?? []).map((e) => ({
                value: e.id,
                label: e.code,
                keywords: e.name,
              }))}
            />
            {eventId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setEventId(undefined)}
              >
                Clear
              </Button>
            )}
          </div>
          <Button
            size="sm"
            onClick={runAllScans}
            disabled={running}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
          >
            {running ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            Sync now
          </Button>
        </div>


        {disconnected && (
          <ConnectPrompt
            title="No connectors linked"
            description="Link Google Calendar and Gmail in Connectors to enable syncing."
          />
        )}

        {summary && (
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <b>{summary.autoApplied}</b> auto-applied
            </span>
            <span>·</span>
            <span>
              <b>{summary.manual}</b> to review
            </span>
            <span>·</span>
            <span>{summary.scanned} items scanned</span>
            {summary.warnings.map((w, i) => (
              <Badge
                key={i}
                variant="outline"
                className="border-amber-400 text-amber-700 text-[10px]"
              >
                {w}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {!items && !running && (
            <EmptyHint
              icon={<Sparkles className="h-6 w-6" />}
              text="Click Sync now to scan Calendar, Gmail, bios and banners in one pass."
            />
          )}
          {running && (
            <EmptyHint
              icon={<Loader2 className="h-6 w-6 animate-spin" />}
              text="Scanning…"
            />
          )}
          {items && visible.length === 0 && !running && (
            <EmptyHint
              icon={<CheckCircle2 className="h-6 w-6" />}
              text={
                summary && summary.autoApplied > 0
                  ? "All caught up - high-confidence items were applied automatically."
                  : "Nothing needs your review right now."
              }
            />
          )}

          {visible.map((it) => (
            <ReviewRow
              key={it.key}
              item={it}
              onDismiss={() => setDismissed((s) => new Set(s).add(it.key))}
              onAction={async (overrideEventId?: string) => {
                if (it.kind === "lead") await addLead(it, overrideEventId);
                else if (it.kind === "email") await applyEmail(it);
                else await applyAsset(it);
              }}
              defaultEventId={eventId}
              eventOptions={(events.data ?? []).map((e) => ({
                id: e.id,
                label: e.code,
              }))}
            />
          ))}
        </div>

        {resolving && (
          <ResolveEmailDialog
            item={resolving}
            speakers={allSpeakers.data ?? []}
            events={(events.data ?? []).map((e) => ({ id: e.id, code: e.code, name: e.name }))}
            onClose={() => setResolving(null)}
            onResolve={(resolution) => resolveEmail(resolving, resolution)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewRow({
  item,
  onDismiss,
  onAction,
  defaultEventId,
  eventOptions,
}: {
  item: Item;
  onDismiss: () => void;
  onAction: (overrideEventId?: string) => void | Promise<void>;
  defaultEventId?: string;
  eventOptions: Array<{ id: string; label: string }>;
}) {
  const [rowEventId, setRowEventId] = useState<string | undefined>(defaultEventId);
  const effectiveEventId = rowEventId ?? defaultEventId;
  const isLead = item.kind === "lead";
  return (
    <Card className="p-3 transition-all hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <KindBadge item={item} />
            <Badge
              variant="outline"
              className={`text-[10px] ${confidenceCls[item.confidence]}`}
            >
              {item.confidence} confidence
            </Badge>
            <RowTitle item={item} />
          </div>
          <RowBody item={item} />
          {isLead && !defaultEventId && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Assign to:</span>
              <SearchableSelect
                triggerClassName="h-7 text-xs w-48"
                placeholder="Pick event…"
                searchPlaceholder="Search events…"
                value={rowEventId ?? ""}
                onValueChange={(v) => setRowEventId(v || undefined)}
                options={eventOptions.map((o) => ({ value: o.id, label: o.label }))}
              />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <ActionButton
            item={item}
            onAction={() => onAction(effectiveEventId)}
            eventPickerReady={isLead ? !!effectiveEventId : true}
          />
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            <X className="h-4 w-4 mr-1" /> Dismiss
          </Button>
        </div>
      </div>
    </Card>
  );
}


function KindBadge({ item }: { item: Item }) {
  if (item.kind === "lead") {
    return (
      <Badge className="bg-sky-600 text-white text-[10px]">
        <CalendarClock className="h-3 w-3 mr-1" /> Calendar lead
      </Badge>
    );
  }
  if (item.kind === "email") {
    return (
      <Badge className={`${statusCls[item.suggested_status]} text-[10px]`}>
        <Mail className="h-3 w-3 mr-1" /> {statusLabel[item.suggested_status]}
      </Badge>
    );
  }
  if (item.variant === "bio") {
    return (
      <Badge className="bg-teal-600 text-white text-[10px]">
        <FileText className="h-3 w-3 mr-1" /> Bio detected
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-[10px] border-amber-500 text-amber-700"
    >
      <AlertTriangle className="h-3 w-3 mr-1" /> Banner unverified
    </Badge>
  );
}

function RowTitle({ item }: { item: Item }) {
  if (item.kind === "lead") {
    return (
      <span className="text-xs font-medium">{item.name ?? item.email}</span>
    );
  }
  if (item.kind === "email") {
    return (
      <span className="text-xs font-medium">
        {item.matched_speaker?.name ?? (
          <span className="italic text-muted-foreground">No matching speaker</span>
        )}
      </span>
    );
  }
  return (
    <span className="text-xs font-medium">
      {item.speaker_name}
      {item.event_label && (
        <Badge variant="secondary" className="ml-1 text-[10px] font-normal">
          {item.event_label}
        </Badge>
      )}
    </span>
  );
}

function RowBody({ item }: { item: Item }) {
  if (item.kind === "lead") {
    return (
      <>
        <div className="text-xs text-muted-foreground truncate">{item.email}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {item.events.slice(0, 3).map((ev, i) => (
            <Badge key={i} variant="secondary" className="text-[10px] font-normal">
              {ev.title}
            </Badge>
          ))}
          {item.events.length > 3 && (
            <Badge variant="outline" className="text-[10px]">
              +{item.events.length - 3} more
            </Badge>
          )}
        </div>
      </>
    );
  }
  if (item.kind === "email") {
    return (
      <>
        <div className="font-medium text-sm mt-1.5 truncate">{item.subject}</div>
        <div className="text-xs text-muted-foreground truncate">{item.from}</div>
        <div className="text-xs mt-1.5 text-foreground/80 line-clamp-2">
          {item.snippet}
        </div>
        <div className="text-[11px] italic text-muted-foreground mt-1">
          AI: {item.reasoning}
        </div>
        {(item.needs.bio || item.needs.headshot || item.needs.banner) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.needs.bio && (
              <Badge
                variant="outline"
                className="text-[10px] border-orange-400 text-orange-700"
              >
                Mentions bio
              </Badge>
            )}
            {item.needs.headshot && (
              <Badge
                variant="outline"
                className="text-[10px] border-orange-400 text-orange-700"
              >
                Mentions headshot
              </Badge>
            )}
            {item.needs.banner && (
              <Badge
                variant="outline"
                className="text-[10px] border-orange-400 text-orange-700"
              >
                Mentions banner
              </Badge>
            )}
          </div>
        )}
      </>
    );
  }
  // asset
  if (item.variant === "bio") {
    return (
      <>
        <div className="text-xs text-muted-foreground truncate">
          {item.subject} · {item.speaker_email}
        </div>
        <div className="mt-2 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-800 whitespace-pre-line line-clamp-6">
          {item.bio_text}
        </div>
        <div className="text-[11px] italic text-muted-foreground mt-1">
          AI: {item.reasoning}
        </div>
      </>
    );
  }
  return (
    <>
      <div className="text-xs text-muted-foreground mt-1 truncate">
        {item.speaker_email}
      </div>
      <div className="text-[11px] italic text-muted-foreground mt-1">
        {item.reasoning}
      </div>
    </>
  );
}

function ActionButton({
  item,
  onAction,
  eventPickerReady,
}: {
  item: Item;
  onAction: () => void | Promise<void>;
  eventPickerReady: boolean;
}) {
  if (item.kind === "lead") {
    return (
      <Button
        size="sm"
        onClick={() => onAction()}
        disabled={!eventPickerReady}
        title={
          eventPickerReady
            ? "Create speaker record"
            : "Pick an event for this lead first"
        }
      >
        <UserPlus className="h-3.5 w-3.5 mr-1" /> Add as lead
      </Button>
    );
  }
  if (item.kind === "email") {
    return (
      <Button
        size="sm"
        onClick={() => onAction()}
        title={
          !item.matched_speaker
            ? "Match or create a speaker, then apply status"
            : "Update speaker status"
        }
      >
        Apply status
      </Button>
    );
  }
  if (item.variant === "bio") {
    return (
      <Button size="sm" onClick={() => onAction()}>
        Apply bio
      </Button>
    );
  }
  return (
    <Button size="sm" variant="destructive" onClick={() => onAction()}>
      <Undo2 className="h-3.5 w-3.5 mr-1" /> Revert to not started
    </Button>
  );
}

function EmptyHint({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 py-10 px-4 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
      <div className="text-muted-foreground/60">{icon}</div>
      {text}
    </div>
  );
}

function ConnectPrompt({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-4">
      <div className="flex items-start gap-3">
        <Plug className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-medium text-sm">{title}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {description}
          </div>
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
