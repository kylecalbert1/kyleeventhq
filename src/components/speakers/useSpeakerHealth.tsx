import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { agendaItemsQuery, speakerFlagsQuery } from "@/lib/queries";
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
  type AutoFlag,
  type SpeakerHealth,
} from "@/lib/speaker-health";

export type HealthFilter = "all" | "action" | "stale" | "no_reply" | "declined" | "flagged";

export type SpeakerHealthInfo = {
  health: SpeakerHealth;
  autoFlags: AutoFlag[];
  manualFlags: { id: string; note: string | null }[];
};

/**
 * Health, flags and override wiring for one event's speaker list. Lives
 * alongside the existing Speakers section — there is no separate health page.
 */
export function useSpeakerHealth(
  eventId: string,
  speakers: any[],
  eventDate: string | null | undefined,
) {
  const qc = useQueryClient();
  const agenda = useQuery(agendaItemsQuery(eventId));
  const flags = useQuery(speakerFlagsQuery(eventId));

  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");

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

  const daysToEvent = daysUntil(eventDate ?? null);

  const infoById = useMemo(() => {
    const agendaSpeakerIds = new Set<string>();
    for (const item of (agenda.data ?? []) as any[]) {
      for (const id of item.speaker_ids ?? []) agendaSpeakerIds.add(id);
    }
    const allFlags = flags.data ?? [];
    const map = new Map<string, SpeakerHealthInfo>();
    for (const speaker of speakers) {
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
      map.set(speaker.id, { health, autoFlags, manualFlags });
    }
    return map;
  }, [speakers, agenda.data, flags.data, daysToEvent]);

  const counts = useMemo(() => {
    const rows = speakers.map((s) => ({ s, i: infoById.get(s.id)! })).filter((r) => r.i);
    const live = rows.filter((r) => r.s.status !== "declined");
    return {
      total: rows.length,
      action: live.filter((r) => r.i.health.state === "attention" || r.i.health.state === "stale")
        .length,
      stale: live.filter((r) => r.i.health.state === "stale").length,
      noReply: live.filter((r) => !r.s.last_inbound_at).length,
      declined: rows.filter((r) => r.s.status === "declined").length,
      flagged: rows.filter((r) => r.i.autoFlags.length + r.i.manualFlags.length > 0).length,
    };
  }, [speakers, infoById]);

  /** Apply the currently selected tile / chip to a list of speakers. */
  function applyHealthFilter(list: any[]): any[] {
    if (healthFilter === "all") return list;
    return list.filter((s) => {
      const info = infoById.get(s.id);
      if (!info) return false;
      switch (healthFilter) {
        case "action":
          return (
            s.status !== "declined" &&
            (info.health.state === "attention" || info.health.state === "stale")
          );
        case "stale":
          return s.status !== "declined" && info.health.state === "stale";
        case "no_reply":
          return s.status !== "declined" && !s.last_inbound_at;
        case "declined":
          return s.status === "declined";
        case "flagged":
          return info.autoFlags.length + info.manualFlags.length > 0;
        default:
          return true;
      }
    });
  }

  return {
    infoById,
    counts,
    healthFilter,
    setHealthFilter,
    applyHealthFilter,
    onAddFlag: (speaker_id: string, note: string) => addFlagM.mutate({ speaker_id, note }),
    onDismissAutoFlag: (speaker_id: string, code: string) => dismissM.mutate({ speaker_id, code }),
    onRemoveFlag: (id: string) => removeM.mutate(id),
    onOverrideChange: (
      speaker_id: string,
      override: "ok" | "follow_up" | "at_risk" | null,
    ) => overrideM.mutate({ speaker_id, override }),
  };
}

export type SpeakerHealthApi = ReturnType<typeof useSpeakerHealth>;

export function SpeakerHealthTiles({
  counts,
  value,
  onChange,
}: {
  counts: {
    total: number;
    action: number;
    stale: number;
    noReply: number;
    declined: number;
    flagged: number;
  };
  value: HealthFilter;
  onChange: (v: HealthFilter) => void;
}) {
  const tiles: { key: HealthFilter; label: string; value: number; tone: string }[] = [
    { key: "all", label: "Speakers tracked", value: counts.total, tone: "text-foreground" },
    { key: "action", label: "Need action now", value: counts.action, tone: "text-amber-600" },
    { key: "stale", label: "Stale contact", value: counts.stale, tone: "text-rose-600" },
    { key: "no_reply", label: "No reply logged", value: counts.noReply, tone: "text-slate-600" },
    { key: "declined", label: "Dropped / declined", value: counts.declined, tone: "text-slate-600" },
    { key: "flagged", label: "Open flags", value: counts.flagged, tone: "text-violet-600" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {tiles.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(value === t.key ? "all" : t.key)}
          className={`rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
            value === t.key
              ? "border-primary ring-1 ring-primary/30 bg-primary/5"
              : "border-border"
          }`}
        >
          <div className={`text-2xl font-semibold ${t.tone}`}>{t.value}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{t.label}</div>
        </button>
      ))}
    </div>
  );
}
