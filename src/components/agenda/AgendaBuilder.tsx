import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Download,
  FileText,
  Wand2,
  AlertTriangle,
  Save,
  Upload,
  X,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { agendaItemsQuery, agendaTemplatesQuery, speakersQuery, eventQuery } from "@/lib/queries";
import { exportAgendaWord } from "@/lib/agenda-word-export";
import {
  bulkReplaceAgenda,
  SESSION_LABELS,
  SESSION_TYPES,
  TEMPLATE_LABELS,
  TEMPLATE_KEYS,
  type TemplateKey,
  isSponsorType,
  upsertAgendaTemplate,
} from "@/lib/agenda.functions";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------
// Time helpers
// ------------------------------------------------------------------

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function fromMin(total: number): string {
  const t = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
function addMinutes(hhmm: string, mins: number): string {
  return fromMin(toMin(hhmm) + mins);
}
function minutesBetween(a: string, b: string): number {
  return toMin(b) - toMin(a);
}

// ------------------------------------------------------------------
// Row model
// ------------------------------------------------------------------

type Item = {
  id: string;
  position: number;
  start_time: string | null; // derived; kept in-sync
  duration_min: number;
  session_type: string;
  title: string | null;
  speaker_ids: string[];
  speaker_extra: string | null;
  av_requirements: string | null;
  track: string | null;
  description: string | null;
  // Registration sits BEFORE the day's start and doesn't count against the
  // fixed end. We flag it so the re-timing / overrun math ignores it.
  __isPreDay?: boolean;
};

function newClientId() {
  return "tmp-" + Math.random().toString(36).slice(2);
}

function mkItem(session_type: string, title = "", duration = 30, extra: Partial<Item> = {}): Item {
  return {
    id: newClientId(),
    position: 0,
    start_time: null,
    duration_min: duration,
    session_type,
    title,
    speaker_ids: [],
    speaker_extra: null,
    av_requirements: null,
    track: null,
    description: null,
    ...extra,
  };
}

// Recompute contiguous start times for a day's items given the day's start.
// Registration (__isPreDay) is scheduled to *end* exactly at dayStart.
function retime(items: Item[], dayStart: string): Item[] {
  const out: Item[] = [];
  let cur = dayStart;

  // Pre-day items (Registration) go first, ending exactly at dayStart.
  const pre = items.filter((i) => i.__isPreDay);
  const rest = items.filter((i) => !i.__isPreDay);

  if (pre.length > 0) {
    const preTotal = pre.reduce((s, i) => s + i.duration_min, 0);
    let c = fromMin(toMin(dayStart) - preTotal);
    for (const it of pre) {
      out.push({ ...it, start_time: c });
      c = addMinutes(c, it.duration_min);
    }
  }
  for (const it of rest) {
    out.push({ ...it, start_time: cur });
    cur = addMinutes(cur, it.duration_min);
  }
  return out.map((r, i) => ({ ...r, position: i + 1 }));
}

// End of the *core* day (excluding registration & anything after chairperson closing).
function coreDayEnd(items: Item[]): string | null {
  const rest = items.filter((i) => !i.__isPreDay);
  if (rest.length === 0) return null;
  // The core day is everything up through (and including) chairperson closing
  // remarks. Happy hour extends beyond and is not counted for the fixed end.
  let idxClose = -1;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].session_type === "chairperson_remarks") idxClose = i;
  }
  const last = idxClose >= 0 ? rest[idxClose] : rest[rest.length - 1];
  if (!last.start_time) return null;
  return addMinutes(last.start_time, last.duration_min);
}

// ------------------------------------------------------------------
// Skeleton generator - the real fix
// ------------------------------------------------------------------

export type DayPlan = {
  label: string;
  start: string;
  fixedEnd: string; // "17:00" or "15:00"
  items: Item[];
};

function planSingleOrDay1(dayStart: string, opts: { withSponsors: boolean; withHappyHour: boolean }): Item[] {
  // Content mix for a full 09:00–17:00 day when sponsors present:
  //   Chair open 15 + Chair close 15 + Coffee 30 + Coffee 30 + Lunch 60 = 150
  //   Remaining content = 330 min.
  //   4×Keynote(30)=120 + 2×Sponsored(30)=60 + Fireside(30) + Roundtable(45)
  //   + Panel(45) + Panel(30, shrunk per rule) = 330 ✓
  const items: Item[] = [];

  // Registration (60) - sits before day start.
  items.push(mkItem("other", "Registration", 60, { __isPreDay: true }));

  items.push(mkItem("chairperson_remarks", "Chairperson opening remarks", 15));
  items.push(mkItem("keynote", "Opening keynote", 30));
  if (opts.withSponsors) items.push(mkItem("sponsored_keynote", "Sponsor 1 keynote", 30));
  items.push(mkItem("keynote", "Morning keynote", 30));
  if (opts.withSponsors) items.push(mkItem("sponsored_keynote", "Sponsor 2 keynote", 30));
  items.push(mkItem("coffee_break", "Coffee break", 30));
  items.push(mkItem("fireside_chat", "Fireside chat", 30));
  items.push(mkItem("roundtable", "Roundtable discussions", 45));
  items.push(mkItem("lunch", "Lunch", 60));
  items.push(mkItem("panel", "Afternoon panel", 45));
  items.push(mkItem("keynote", "Afternoon keynote", 30));
  items.push(mkItem("coffee_break", "Coffee break", 30));
  items.push(mkItem("panel", "Closing panel", 30)); // shrunk per rule to hit 17:00
  items.push(mkItem("keynote", "Closing keynote", 30));
  items.push(mkItem("chairperson_remarks", "Chairperson closing remarks", 15));
  if (opts.withHappyHour) items.push(mkItem("happy_hour", "Happy hour", 60));

  // If no sponsors, we removed 60 min → backfill with 2 keynotes to keep 17:00.
  if (!opts.withSponsors) {
    // Insert 2 extra keynotes early in the day (positions 3 & 4 of content).
    const insertAt = items.findIndex((i) => i.session_type === "coffee_break");
    items.splice(insertAt, 0, mkItem("keynote", "Late-morning keynote", 30));
    items.splice(insertAt, 0, mkItem("keynote", "Late-morning keynote", 30));
  }
  return items;
}

function planDay2(dayStart: string): Item[] {
  // 09:00–15:00 day, no sponsors. 6h = 360. Fixed 120 → content 240.
  //   Fireside(30) + Roundtable(45) + Panel(45) + 4×Keynote(30)=120 = 240 ✓
  const items: Item[] = [];
  items.push(mkItem("chairperson_remarks", "Chairperson opening remarks", 15));
  items.push(mkItem("keynote", "Day 2 opening keynote", 30));
  items.push(mkItem("keynote", "Morning keynote", 30));
  items.push(mkItem("fireside_chat", "Fireside chat", 30));
  items.push(mkItem("coffee_break", "Coffee break", 30));
  items.push(mkItem("roundtable", "Roundtable discussions", 45));
  items.push(mkItem("keynote", "Pre-lunch keynote", 30));
  items.push(mkItem("lunch", "Lunch", 60));
  items.push(mkItem("panel", "Afternoon panel", 45));
  items.push(mkItem("keynote", "Closing keynote", 30));
  items.push(mkItem("chairperson_remarks", "Chairperson closing remarks", 15));
  return items;
}

function planVirtual(): Item[] {
  // Single virtual day 09:00–17:00, no registration, no happy hour.
  return [
    mkItem("chairperson_remarks", "Welcome & housekeeping", 15),
    mkItem("keynote", "Opening keynote", 40),
    mkItem("panel", "Morning panel", 45),
    mkItem("break", "Break", 10),
    mkItem("sponsored_keynote", "Sponsor keynote", 30),
    mkItem("keynote", "Midday keynote", 40),
    mkItem("lunch", "Lunch break", 45),
    mkItem("panel", "Afternoon panel", 45),
    mkItem("keynote", "Afternoon keynote", 40),
    mkItem("break", "Break", 10),
    mkItem("panel", "Closing panel", 45),
    mkItem("chairperson_remarks", "Closing remarks", 15),
  ];
}

function buildPlans(
  template: TemplateKey,
  dayCount: 1 | 2,
  day1Start: string,
  day2Start: string,
): DayPlan[] {
  if (template === "virtual") {
    return [{ label: "Day 1", start: "09:00", fixedEnd: "17:00", items: planVirtual() }];
  }
  if (dayCount === 1) {
    return [
      {
        label: "Day 1",
        start: day1Start,
        fixedEnd: "17:00",
        items: planSingleOrDay1(day1Start, { withSponsors: true, withHappyHour: true }),
      },
    ];
  }
  return [
    {
      label: "Day 1",
      start: day1Start,
      fixedEnd: "17:00",
      items: planSingleOrDay1(day1Start, { withSponsors: true, withHappyHour: true }),
    },
    {
      label: "Day 2",
      start: day2Start,
      fixedEnd: "15:00",
      items: planDay2(day2Start),
    },
  ];
}

// ------------------------------------------------------------------
// Load / split existing agenda items into day plans (heuristic: a start_time
// that moves backwards vs. the previous item signals a new day).
// ------------------------------------------------------------------

function splitIntoDays(rows: any[]): { day1: Item[]; day2: Item[] } {
  const day1: Item[] = [];
  const day2: Item[] = [];
  let inDay2 = false;
  let prevStart: string | null = null;
  for (const r of rows) {
    const cur: Item = {
      id: r.id,
      position: r.position,
      start_time: r.start_time,
      duration_min: r.duration_min,
      session_type: r.session_type,
      title: r.title,
      speaker_ids: r.speaker_ids ?? [],
      speaker_extra: r.speaker_extra,
      av_requirements: r.av_requirements,
      track: r.track ?? null,
      description: r.description ?? null,
    };
    if (!inDay2 && prevStart && r.start_time && toMin(r.start_time) < toMin(prevStart)) {
      inDay2 = true;
    }
    (inDay2 ? day2 : day1).push(cur);
    if (r.start_time) prevStart = r.start_time;
  }
  return { day1, day2 };
}

// ------------------------------------------------------------------
// Overrun analysis & auto-fix suggestion
// ------------------------------------------------------------------

type OverrunFix =
  | { kind: "shrinkPanel"; index: number; label: string }
  | { kind: "dropKeynote"; index: number; label: string }
  | { kind: "none" };

function analyseDay(items: Item[], fixedEnd: string): { overrun: number; fix: OverrunFix } {
  const end = coreDayEnd(items);
  if (!end) return { overrun: 0, fix: { kind: "none" } };
  const overrun = toMin(end) - toMin(fixedEnd);
  if (overrun <= 0) return { overrun: 0, fix: { kind: "none" } };

  // 1) Prefer shrinking a 45-min Panel/Roundtable → 30 min.
  const shrinkIdx = items.findIndex(
    (i) => (i.session_type === "panel" || i.session_type === "roundtable") && i.duration_min >= 45,
  );
  if (shrinkIdx >= 0) {
    return {
      overrun,
      fix: {
        kind: "shrinkPanel",
        index: shrinkIdx,
        label: `Shrink "${items[shrinkIdx].title || SESSION_LABELS[items[shrinkIdx].session_type]}" to 30 min`,
      },
    };
  }
  // 2) Otherwise drop a filler keynote (never sponsor, never chairperson).
  //    Prefer the last plain keynote before chairperson closing.
  let dropIdx = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].session_type === "keynote") {
      dropIdx = i;
      break;
    }
  }
  if (dropIdx >= 0) {
    return {
      overrun,
      fix: {
        kind: "dropKeynote",
        index: dropIdx,
        label: `Drop "${items[dropIdx].title || "Keynote"}"`,
      },
    };
  }
  return { overrun, fix: { kind: "none" } };
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export function AgendaBuilder({
  eventId,
  eventFormat,
  onImport,
  onSaved,
  onCancel,
}: {
  eventId: string;
  eventFormat: string;
  onImport?: () => void;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const qc = useQueryClient();
  const itemsQ = useQuery(agendaItemsQuery(eventId));
  const templatesQ = useQuery(agendaTemplatesQuery);
  const speakersQ = useQuery(speakersQuery(eventId));
  const eventQ = useQuery(eventQuery(eventId));


  const [template, setTemplate] = useState<TemplateKey>(
    eventFormat === "virtual" ? "virtual" : "csc_in_person",
  );
  const [dayCount, setDayCount] = useState<1 | 2>(1);
  const [day1Start, setDay1Start] = useState("09:00");
  const [day2Start, setDay2Start] = useState("09:00");
  const [days, setDays] = useState<Item[][] | null>(null); // per-day item arrays
  const [activeDay, setActiveDay] = useState<0 | 1>(0);
  const [timezone, setTimezone] = useState("");

  // Hydrate from existing agenda_items on first load.
  useEffect(() => {
    if (itemsQ.data && days === null) {
      const { day1, day2 } = splitIntoDays(itemsQ.data);
      if (day2.length > 0) {
        setDayCount(2);
        setDay1Start(day1[0]?.start_time ?? "09:00");
        setDay2Start(day2[0]?.start_time ?? "09:00");
        setDays([day1, day2]);
      } else {
        setDay1Start(day1[0]?.start_time ?? "09:00");
        setDays([day1]);
      }
    }
  }, [itemsQ.data, days]);

  const isVirtual = template === "virtual";

  // Fixed ends per day.
  const fixedEnds = useMemo(() => {
    if (isVirtual) return ["17:00"];
    if (dayCount === 1) return ["17:00"];
    return ["17:00", "15:00"];
  }, [dayCount, isVirtual]);

  const dayStarts = useMemo(() => {
    if (isVirtual) return ["09:00"];
    if (dayCount === 1) return [day1Start];
    return [day1Start, day2Start];
  }, [dayCount, day1Start, day2Start, isVirtual]);

  // Ensure `days` array matches dayCount (add/remove day 2 when toggling).
  useEffect(() => {
    setDays((prev) => {
      if (!prev) return prev;
      if (isVirtual || dayCount === 1) {
        if (prev.length === 1) return prev;
        return [prev[0] ?? []];
      }
      if (prev.length === 2) return prev;
      return [prev[0] ?? [], prev[1] ?? []];
    });
    if (isVirtual || dayCount === 1) setActiveDay(0);
  }, [dayCount, isVirtual]);

  // Derived: retimed rows per day.
  const retimedDays = useMemo(() => {
    if (!days) return [] as Item[][];
    return days.map((d, i) => retime(d, dayStarts[i] ?? "09:00"));
  }, [days, dayStarts]);

  const analyses = useMemo(
    () => retimedDays.map((d, i) => analyseDay(d, fixedEnds[i] ?? "17:00")),
    [retimedDays, fixedEnds],
  );

  const speakerOptions = (speakersQ.data ?? []) as Array<{ id: string; name: string; status: string }>;

  // Save flattens all days back into one positional list.
  const replaceFn = useServerFn(bulkReplaceAgenda);
  const save = useMutation({
    mutationFn: async () => {
      const flat = retimedDays.flatMap((day) => day);
      const payload = flat.map((r, i) => ({
        position: i + 1,
        start_time: r.start_time,
        duration_min: r.duration_min,
        session_type: r.session_type,
        title: r.title,
        speaker_ids: r.speaker_ids,
        speaker_extra: r.speaker_extra,
        av_requirements: r.av_requirements,
        track: r.track,
        description: r.description,
      }));
      return replaceFn({ data: { event_id: eventId, items: payload } });
    },
    onSuccess: () => {
      toast.success("Agenda saved");
      qc.invalidateQueries({ queryKey: ["agendaItems", eventId] });
      onSaved?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  function draftSkeleton() {
    const already = (days ?? []).some((d) => d.length > 0);
    if (already && !confirm("Replace current agenda with a fresh skeleton?")) return;
    const plans = buildPlans(template, isVirtual ? 1 : dayCount, day1Start, day2Start);
    setDays(plans.map((p) => p.items));
    setActiveDay(0);
    toast.success(`Skeleton generated - ${plans.length === 1 ? "1 day" : "2 days"}`);
  }

  function mutateDay(idx: number, fn: (items: Item[]) => Item[]) {
    setDays((prev) => {
      if (!prev) return prev;
      const next = prev.map((d, i) => (i === idx ? fn(d) : d));
      return next;
    });
  }

  function updateRow(dayIdx: number, rowIdx: number, patch: Partial<Item>) {
    mutateDay(dayIdx, (items) => items.map((r, i) => (i === rowIdx ? { ...r, ...patch } : r)));
  }
  function moveRow(dayIdx: number, rowIdx: number, dir: -1 | 1) {
    mutateDay(dayIdx, (items) => {
      const p = [...items];
      const j = rowIdx + dir;
      if (j < 0 || j >= p.length) return p;
      [p[rowIdx], p[j]] = [p[j], p[rowIdx]];
      return p;
    });
  }
  function removeRow(dayIdx: number, rowIdx: number) {
    mutateDay(dayIdx, (items) => items.filter((_, i) => i !== rowIdx));
  }
  function addRow(dayIdx: number) {
    mutateDay(dayIdx, (items) => [
      ...items,
      mkItem("keynote", "", 30),
    ]);
  }

  // Live re-timing: editing a row's start_time is equivalent to changing the
  // duration of the row above (contiguity invariant). Editing end_time /
  // duration just changes this row; subsequent rows shift automatically because
  // start_times are derived on every render.
  function editRowStart(dayIdx: number, rowIdx: number, newStart: string) {
    if (rowIdx === 0) {
      // Row 0 sets the day start (registration excluded).
      const rows = retimedDays[dayIdx];
      const firstCore = rows.findIndex((r) => !r.__isPreDay);
      if (rowIdx === firstCore) {
        if (dayIdx === 0) setDay1Start(newStart);
        else setDay2Start(newStart);
      }
      return;
    }
    const rows = retimedDays[dayIdx];
    const prev = rows[rowIdx - 1];
    if (!prev?.start_time) return;
    const newPrevDur = minutesBetween(prev.start_time, newStart);
    if (newPrevDur < 5) {
      toast.error("That would leave the previous session under 5 minutes.");
      return;
    }
    updateRow(dayIdx, rowIdx - 1, { duration_min: newPrevDur });
  }

  function applyFix(dayIdx: number) {
    const { fix } = analyses[dayIdx];
    if (fix.kind === "shrinkPanel") {
      updateRow(dayIdx, fix.index, { duration_min: 30 });
      toast.success("Panel/roundtable shrunk to 30 min.");
    } else if (fix.kind === "dropKeynote") {
      removeRow(dayIdx, fix.index);
      toast.success("Filler keynote dropped.");
    }
  }

  function exportCSV() {
    const header = ["Day", "Start", "End", "Mins", "Session type", "Session title", "Speaker(s)", "AV requirements"];
    const speakerNameById = new Map(speakerOptions.map((s) => [s.id, s.name]));
    const lines: string[][] = [];
    retimedDays.forEach((rows, di) => {
      for (const r of rows) {
        const end = r.start_time ? addMinutes(r.start_time, r.duration_min) : "";
        const spNames = [
          ...r.speaker_ids.map((id) => speakerNameById.get(id) ?? "").filter(Boolean),
          r.speaker_extra ?? "",
        ].filter(Boolean).join("; ");
        lines.push([
          `Day ${di + 1}`,
          r.start_time ?? "",
          end,
          String(r.duration_min),
          SESSION_LABELS[r.session_type] ?? r.session_type,
          r.title ?? "",
          spNames,
          r.av_requirements ?? "",
        ]);
      }
    });
    const csv = [header, ...lines]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agenda-${eventId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportWord() {
    try {
      await exportAgendaWord({
        event: eventQ.data ?? {},
        items: retimedDays.flat() as any,
        speakers: (speakersQ.data ?? []) as any,
        timezone,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Word export failed");
    }
  }


  const activeRows = retimedDays[activeDay] ?? [];
  const activeAnalysis = analyses[activeDay] ?? { overrun: 0, fix: { kind: "none" as const } };
  const activeFixedEnd = fixedEnds[activeDay] ?? "17:00";

  const sponsorBackToBack = useMemo(() => {
    const flags = new Set<number>();
    for (let i = 1; i < activeRows.length; i++) {
      if (isSponsorType(activeRows[i].session_type) && isSponsorType(activeRows[i - 1].session_type)) {
        flags.add(i);
        flags.add(i - 1);
      }
    }
    return flags;
  }, [activeRows]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="p-4 rounded-2xl border-slate-200/70 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <div className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">Template</div>
          <Select value={template} onValueChange={(v) => setTemplate(v as TemplateKey)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TEMPLATE_KEYS.map((k) => (
                <SelectItem key={k} value={k}>{TEMPLATE_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!isVirtual && (
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">Length</div>
            <Select value={String(dayCount)} onValueChange={(v) => setDayCount(Number(v) as 1 | 2)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1-day event</SelectItem>
                <SelectItem value="2">2-day event</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1">
          <div className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">
            {dayCount === 2 ? "Day 1 start" : "Day start"}
            {isVirtual && <span className="text-slate-400"> (fixed)</span>}
          </div>
          <Input
            type="time"
            value={isVirtual ? "09:00" : day1Start}
            disabled={isVirtual}
            onChange={(e) => setDay1Start(e.target.value)}
            className="w-32"
          />
          <div className="text-[10px] text-slate-500">ends 17:00 (fixed)</div>
        </div>

        {!isVirtual && dayCount === 2 && (
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">Day 2 start</div>
            <Input
              type="time"
              value={day2Start}
              onChange={(e) => setDay2Start(e.target.value)}
              className="w-32"
            />
            <div className="text-[10px] text-slate-500">ends 15:00 (fixed)</div>
          </div>
        )}

        <div className="flex-1" />
        <div className="flex flex-wrap gap-2">
          <TemplateSettings templateKey={template} />
          {onImport && (
            <Button variant="outline" size="sm" onClick={onImport}>
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Import
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={draftSkeleton}>
            <Wand2 className="h-3.5 w-3.5 mr-1.5" /> Draft skeleton
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={activeRows.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
          <Input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="PDT / BST / EDT"
            className="h-8 w-32 text-xs"
          />
          <Button variant="outline" size="sm" onClick={exportWord} disabled={activeRows.length === 0}>
            <FileText className="h-3.5 w-3.5 mr-1.5" /> Export Word
          </Button>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
            </Button>
          )}
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {save.isPending ? "Saving…" : "Save agenda"}
          </Button>
        </div>
      </Card>

      {/* Day tabs */}
      {retimedDays.length > 1 && (
        <div className="flex items-center gap-2">
          {retimedDays.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveDay(i as 0 | 1)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                activeDay === i
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
              )}
            >
              Day {i + 1}
              <span className="ml-2 text-[10px] opacity-70">
                {dayStarts[i]}–{fixedEnds[i]}
              </span>
              {analyses[i].overrun > 0 && (
                <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-rose-200">
                  <AlertTriangle className="h-3 w-3" /> +{analyses[i].overrun}m
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Overrun warning + auto-fix */}
      {activeAnalysis.overrun > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
          <span className="inline-flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Day {activeDay + 1} runs {activeAnalysis.overrun} min past its fixed end of {activeFixedEnd}.
          </span>
          {activeAnalysis.fix.kind !== "none" && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => applyFix(activeDay)}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              {activeAnalysis.fix.label}
            </Button>
          )}
        </div>
      )}

      {sponsorBackToBack.size > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          Two sponsor sessions are scheduled back-to-back. Consider spacing them out.
        </div>
      )}

      {/* Rows */}
      <Card className="rounded-2xl border-slate-200/70 overflow-hidden">
        <div className="grid grid-cols-[70px_70px_60px_170px_1fr_130px_160px_130px_90px] gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b">
          <div>Start</div><div>End</div><div>Mins</div><div>Type</div><div>Title</div>
          <div>Track</div><div>Speakers</div><div>AV</div><div className="text-right">Actions</div>
        </div>
        {activeRows.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-500">
            No sessions yet - click "Draft skeleton" to generate a starting agenda.
          </div>
        )}
        {activeRows.map((r, i) => {
          const end = r.start_time ? addMinutes(r.start_time, r.duration_min) : "";
          const flagged = sponsorBackToBack.has(i);
          return (
            <div key={r.id} className={"border-b border-slate-100 " + (flagged ? "bg-amber-50/50" : r.__isPreDay ? "bg-slate-50/60" : "")}>
              <div className="grid grid-cols-[70px_70px_60px_170px_1fr_130px_160px_130px_90px] gap-2 px-3 py-2 items-center">
                <Input
                  type="time"
                  value={r.start_time ?? ""}
                  onChange={(e) => editRowStart(activeDay, i, e.target.value)}
                  className="h-8 text-xs tabular-nums"
                />
                <Input
                  type="time"
                  value={end}
                  onChange={(e) => {
                    if (!r.start_time) return;
                    const m = minutesBetween(r.start_time, e.target.value);
                    if (m > 0) updateRow(activeDay, i, { duration_min: m });
                  }}
                  className="h-8 text-xs tabular-nums"
                />
                <Input
                  type="number"
                  min={1}
                  value={r.duration_min}
                  onChange={(e) => updateRow(activeDay, i, { duration_min: Number(e.target.value) || 1 })}
                  className="h-8 text-xs tabular-nums"
                />
                <Select
                  value={r.session_type}
                  onValueChange={(v) => updateRow(activeDay, i, { session_type: v })}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SESSION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{SESSION_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={r.title ?? ""}
                  onChange={(e) => updateRow(activeDay, i, { title: e.target.value })}
                  placeholder="Session title…"
                  className="h-8 text-xs"
                />
                <Input
                  value={r.track ?? ""}
                  onChange={(e) => updateRow(activeDay, i, { track: e.target.value || null })}
                  placeholder="Track (opt.)"
                  className="h-8 text-xs"
                />
                <SpeakerPicker
                  options={speakerOptions}
                  selectedIds={r.speaker_ids}
                  extra={r.speaker_extra ?? ""}
                  onChange={(ids, extra) => updateRow(activeDay, i, { speaker_ids: ids, speaker_extra: extra })}
                />
                <Input
                  value={r.av_requirements ?? ""}
                  onChange={(e) => updateRow(activeDay, i, { av_requirements: e.target.value })}
                  placeholder="1x mic, screen…"
                  className="h-8 text-xs"
                />
                <div className="flex justify-end gap-0.5">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveRow(activeDay, i, -1)}>
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveRow(activeDay, i, 1)}>
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeRow(activeDay, i)}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              </div>
              <div className="px-3 pb-2 -mt-1">
                <Textarea
                  value={r.description ?? ""}
                  onChange={(e) => updateRow(activeDay, i, { description: e.target.value || null })}
                  placeholder="Short description (auto-generated on import; edit or clear as you like)"
                  className="text-xs min-h-[36px] resize-y"
                  rows={1}
                />
              </div>
            </div>
          );
        })}
        <div className="p-2">
          <Button variant="ghost" size="sm" onClick={() => addRow(activeDay)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add row
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------
// Sub-components (unchanged from previous version)
// ------------------------------------------------------------------

function SpeakerPicker({
  options,
  selectedIds,
  extra,
  onChange,
}: {
  options: Array<{ id: string; name: string; status: string }>;
  selectedIds: string[];
  extra: string;
  onChange: (ids: string[], extra: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const labelText = useMemo(() => {
    const names = selectedIds
      .map((id) => options.find((o) => o.id === id)?.name)
      .filter(Boolean) as string[];
    const parts = [...names];
    if (extra) parts.push(extra);
    return parts.length > 0 ? parts.join(", ") : "TBC / add…";
  }, [selectedIds, extra, options]);

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
      extra || null,
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs justify-start font-normal truncate">
          <span className="truncate">{labelText}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2">
        <div className="text-[11px] font-semibold uppercase text-slate-500 mb-1">Speakers on this event</div>
        <div className="max-h-52 overflow-auto space-y-1">
          {options.length === 0 && (
            <div className="text-xs text-slate-500 p-2">No speakers on this event yet.</div>
          )}
          {options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={selectedIds.includes(o.id)} onChange={() => toggle(o.id)} />
              <span className="flex-1 truncate">{o.name}</span>
              <span className="text-[10px] text-slate-400">{o.status}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t">
          <div className="text-[11px] font-semibold uppercase text-slate-500 mb-1">TBC / extra names</div>
          <Input
            value={extra}
            onChange={(e) => onChange(selectedIds, e.target.value || null)}
            placeholder="e.g. TBC, or John Doe (Acme)"
            className="h-8 text-xs"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TemplateSettings({ templateKey }: { templateKey: TemplateKey }) {
  const qc = useQueryClient();
  const q = useQuery(agendaTemplatesQuery);
  const upsertFn = useServerFn(upsertAgendaTemplate);
  const rows = (q.data ?? []).filter((t: any) => t.template_key === templateKey);
  const patch = useMutation({
    mutationFn: async (v: { session_type: string; minutes: number; position: number }) =>
      upsertFn({ data: { template_key: templateKey, ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agendaTemplates"] }),
  });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">Template durations</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3">
        <div className="text-xs font-semibold mb-2">
          {TEMPLATE_LABELS[templateKey]} - default minutes (reference only; the skeleton uses the fixed vocabulary durations)
        </div>
        <div className="space-y-1.5 max-h-72 overflow-auto">
          {rows.map((r: any) => (
            <div key={r.id} className="flex items-center gap-2">
              <div className="flex-1 text-xs">{SESSION_LABELS[r.session_type] ?? r.session_type}</div>
              <Input
                type="number"
                min={1}
                defaultValue={r.minutes}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v > 0 && v !== r.minutes)
                    patch.mutate({ session_type: r.session_type, minutes: v, position: r.position });
                }}
                className="h-7 w-20 text-xs tabular-nums"
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
