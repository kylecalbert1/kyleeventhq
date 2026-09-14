import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Flag, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/StatusPill";
import { PageHelp } from "@/components/PageHelp";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { eventQuery, speakersQuery, agendaItemsQuery, speakerFlagsQuery } from "@/lib/queries";
import {
  addManualFlag,
  deleteSpeakerFlag,
  dismissAutoFlag,
  setSpeakerHealthOverride,
} from "@/lib/speaker-flags.functions";
import {
  computeAutoFlags,
  computeSpeakerHealth,
  daysUntil,
  HEALTH_THRESHOLDS,
  type AutoFlag,
  type SpeakerHealth,
} from "@/lib/speaker-health";
import { labels, pillClass } from "@/lib/status";
import { fuzzyFilter } from "@/lib/fuzzy-search";

export const Route = createFileRoute("/_authenticated/events/$eventId_/health")({
  head: () => ({
    meta: [
      { title: "Speaker health — Event Command Centre" },
      {
        name: "description",
        content:
          "Live speaker health for this event: who has gone quiet, who never replied, and what needs chasing.",
      },
      { property: "og:title", content: "Speaker health — Event Command Centre" },
      {
        property: "og:description",
        content:
          "Live speaker health for this event: who has gone quiet, who never replied, and what needs chasing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ params, context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(eventQuery(params.eventId)),
      context.queryClient.ensureQueryData(speakersQuery(params.eventId)),
    ]),
  component: SpeakerHealthPage,
});

type Filter = "all" | "action" | "stale" | "no_reply" | "declined" | "flagged";

type Row = {
  speaker: any;
  health: SpeakerHealth;
  autoFlags: AutoFlag[];
  manualFlags: { id: string; note: string | null }[];
};

function SpeakerHealthPage() {
  const { eventId } = Route.useParams();
  const qc = useQueryClient();
  const event = useQuery(eventQuery(eventId));
  const speakers = useQuery(speakersQuery(eventId));
  const agenda = useQuery(agendaItemsQuery(eventId));
  const flags = useQuery(speakerFlagsQuery(eventId));

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [flagDraftFor, setFlagDraftFor] = useState<string | null>(null);
  const [flagText, setFlagText] = useState("");

  const addFlag = useServerFn(addManualFlag);
  const dismissFlag = useServerFn(dismissAutoFlag);
  const removeFlag = useServerFn(deleteSpeakerFlag);
  const setOverride = useServerFn(setSpeakerHealthOverride);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["speakerFlags", eventId] });
    void qc.invalidateQueries({ queryKey: ["speakers"] });
  }

  const addFlagM = useMutation({
    mutationFn: (v: { speaker_id: string; note: string }) =>
      addFlag({ data: { ...v, event_id: eventId } }),
    onSuccess: () => {
      setFlagDraftFor(null);
      setFlagText("");
      refresh();
      toast.success("Flag added");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not add that flag"),
  });

  const dismissM = useMutation({
    mutationFn: (v: { speaker_id: string; code: string }) =>
      dismissFlag({ data: { ...v, event_id: eventId } }),
    onSuccess: refresh,
    onError: (e: any) => toast.error(e?.message ?? "Could not dismiss that flag"),
  });

  const removeM = useMutation({
    mutationFn: (id: string) => removeFlag({ data: { id } }),
    onSuccess: refresh,
    onError: (e: any) => toast.error(e?.message ?? "Could not remove that flag"),
  });

  const overrideM = useMutation({
    mutationFn: (v: { speaker_id: string; override: "ok" | "follow_up" | "at_risk" | null }) =>
      setOverride({ data: v }),
    onSuccess: refresh,
    onError: (e: any) => toast.error(e?.message ?? "Could not save that"),
  });

  const daysToEvent = daysUntil(event.data?.event_date ?? null);

  const rows: Row[] = useMemo(() => {
    const agendaSpeakerIds = new Set<string>();
    for (const item of agenda.data ?? []) {
      for (const id of (item as any).speaker_ids ?? []) agendaSpeakerIds.add(id);
    }
    const allFlags = flags.data ?? [];
    return (speakers.data ?? []).map((speaker: any) => {
      const health = computeSpeakerHealth(speaker);
      const dismissed = new Set(
        allFlags
          .filter((f) => f.speaker_id === speaker.id && f.code !== "manual" && f.dismissed_at)
          .map((f) => f.code),
      );
      const autoFlags = computeAutoFlags(speaker, health, {
        daysToEvent,
        onAgenda: agendaSpeakerIds.has(speaker.id),
      }).filter((f) => !dismissed.has(f.code));
      const manualFlags = allFlags
        .filter((f) => f.speaker_id === speaker.id && f.code === "manual" && !f.dismissed_at)
        .map((f) => ({ id: f.id, note: f.note }));
      return { speaker, health, autoFlags, manualFlags };
    });
  }, [speakers.data, agenda.data, flags.data, daysToEvent]);

  const counts = useMemo(() => {
    const live = rows.filter((r) => r.speaker.status !== "declined");
    return {
      total: rows.length,
      action: live.filter((r) => r.health.state === "attention" || r.health.state === "stale").length,
      stale: live.filter((r) => r.health.state === "stale").length,
      noReply: live.filter((r) => !r.speaker.last_inbound_at).length,
      declined: rows.filter((r) => r.speaker.status === "declined").length,
      flagged: rows.filter((r) => r.autoFlags.length + r.manualFlags.length > 0).length,
    };
  }, [rows]);

  const visible = useMemo(() => {
    let list = rows;
    switch (filter) {
      case "action":
        list = list.filter(
          (r) =>
            r.speaker.status !== "declined" &&
            (r.health.state === "attention" || r.health.state === "stale"),
        );
        break;
      case "stale":
        list = list.filter((r) => r.speaker.status !== "declined" && r.health.state === "stale");
        break;
      case "no_reply":
        list = list.filter((r) => r.speaker.status !== "declined" && !r.speaker.last_inbound_at);
        break;
      case "declined":
        list = list.filter((r) => r.speaker.status === "declined");
        break;
      case "flagged":
        list = list.filter((r) => r.autoFlags.length + r.manualFlags.length > 0);
        break;
      default:
        break;
    }
    if (q.trim()) {
      list = fuzzyFilter(list, q, (r) =>
        [r.speaker.name, r.speaker.company, r.speaker.title],
      );
    }
    const order = { stale: 0, attention: 1, no_message: 2, ok: 3, closed: 4 } as const;
    return [...list].sort(
      (a, b) =>
        order[a.health.state] - order[b.health.state] || (b.health.days ?? 0) - (a.health.days ?? 0),
    );
  }, [rows, filter, q]);

  const tiles: { key: Filter; label: string; value: number; tone: string }[] = [
    { key: "all", label: "Speakers tracked", value: counts.total, tone: "text-foreground" },
    { key: "action", label: "Need action now", value: counts.action, tone: "text-amber-600" },
    { key: "stale", label: "Stale contact", value: counts.stale, tone: "text-rose-600" },
    { key: "no_reply", label: "No reply logged", value: counts.noReply, tone: "text-slate-600" },
    { key: "declined", label: "Dropped / declined", value: counts.declined, tone: "text-slate-600" },
    { key: "flagged", label: "Open flags", value: counts.flagged, tone: "text-violet-600" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/events/$eventId" params={{ eventId }}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to event
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Speaker health</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {event.data?.name ?? "This event"} — who has gone quiet, who never replied, and what needs
          fixing. Under {HEALTH_THRESHOLDS.okDays} days since contact is fine, under{" "}
          {HEALTH_THRESHOLDS.attentionDays} needs attention, older is stale.
        </p>
      </div>

      <PageHelp
        title="How this is worked out"
        what="Days are counted from their last reply where we have one, otherwise from your last message to them. Speakers you have never messaged show as no message logged."
        steps={[
          "Use the tiles to filter down to the group you want to work through.",
          "Flags are worked out automatically from the record: missing email, no session assigned, a lead not moving close to the event, or a confirmed speaker gone quiet.",
          "Dismiss any flag you don't care about, or add your own note-to-self flag.",
          "Override the status on anyone you want to chase regardless of the dates.",
        ]}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={`rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
              filter === t.key ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-border"
            }`}
          >
            <div className={`text-2xl font-semibold ${t.tone}`}>{t.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{t.label}</div>
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, company or job title…"
          className="pl-8"
        />
      </div>

      <Card className="divide-y">
        {visible.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No speakers match this view.</div>
        )}
        {visible.map(({ speaker, health, autoFlags, manualFlags }) => (
          <div key={speaker.id} className="p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium leading-tight">{speaker.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {[speaker.title, speaker.company].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {speaker.status && (
                  <StatusPill className={pillClass.speaker[speaker.status as never]}>
                    {labels.speaker[speaker.status as never]}
                  </StatusPill>
                )}
                <StatusPill className={health.cls}>
                  {health.days !== null ? `${health.label} · ${health.days}d` : health.label}
                </StatusPill>
                <Select
                  value={speaker.health_override ?? "auto"}
                  onValueChange={(v) =>
                    overrideM.mutate({
                      speaker_id: speaker.id,
                      override: v === "auto" ? null : (v as any),
                    })
                  }
                >
                  <SelectTrigger className="h-7 w-[150px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automatic</SelectItem>
                    <SelectItem value="ok">Mark as fine</SelectItem>
                    <SelectItem value="follow_up">Mark: follow up</SelectItem>
                    <SelectItem value="at_risk">Mark: at risk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">{health.line}</div>

            {(autoFlags.length > 0 || manualFlags.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {autoFlags.map((f) => (
                  <span
                    key={f.code}
                    title={f.detail}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900"
                  >
                    <Flag className="h-3 w-3" />
                    {f.label}
                    <button
                      type="button"
                      className="opacity-60 hover:opacity-100"
                      onClick={() => dismissM.mutate({ speaker_id: speaker.id, code: f.code })}
                      aria-label={`Dismiss ${f.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {manualFlags.map((f) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-900"
                  >
                    <Flag className="h-3 w-3" />
                    {f.note}
                    <button
                      type="button"
                      className="opacity-60 hover:opacity-100"
                      onClick={() => removeM.mutate(f.id)}
                      aria-label="Remove flag"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {flagDraftFor === speaker.id ? (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  value={flagText}
                  onChange={(e) => setFlagText(e.target.value)}
                  placeholder="What should you notice about this person?"
                  className="h-8 text-sm max-w-md"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && flagText.trim()) {
                      addFlagM.mutate({ speaker_id: speaker.id, note: flagText.trim() });
                    }
                    if (e.key === "Escape") setFlagDraftFor(null);
                  }}
                />
                <Button
                  size="sm"
                  disabled={!flagText.trim() || addFlagM.isPending}
                  onClick={() => addFlagM.mutate({ speaker_id: speaker.id, note: flagText.trim() })}
                >
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setFlagDraftFor(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                onClick={() => {
                  setFlagDraftFor(speaker.id);
                  setFlagText("");
                }}
              >
                <Plus className="h-3 w-3" /> Add a flag
              </button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
