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
  Wand2,
  AlertTriangle,
  Save,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { agendaItemsQuery, agendaTemplatesQuery, speakersQuery } from "@/lib/queries";
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

type Item = {
  id: string; // client id
  position: number;
  start_time: string | null;
  duration_min: number;
  session_type: string;
  title: string | null;
  speaker_ids: string[];
  speaker_extra: string | null;
  av_requirements: string | null;
};

function newClientId() {
  return "tmp-" + Math.random().toString(36).slice(2);
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function minutesBetween(a: string, b: string): number {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}

function recomputeTimes(items: Item[], virtualBuffer = 0, forceStart?: string): Item[] {
  let cur = forceStart ?? items[0]?.start_time ?? "09:00";
  return items.map((it, i) => {
    const start = cur;
    const next = addMinutes(start, it.duration_min + (i < items.length - 1 ? virtualBuffer : 0));
    const result = { ...it, start_time: start, position: i + 1 };
    cur = next;
    return result;
  });
}

const VIRTUAL_DAY_START = "09:00";
const VIRTUAL_DAY_END = "17:00";
const VIRTUAL_DAY_MINUTES = 8 * 60; // 480

function skeletonFor(
  template: TemplateKey,
  defaults: Map<string, number>,
): Item[] {
  const dur = (t: string, fallback: number) => defaults.get(t) ?? fallback;
  const mk = (t: string, title = "", overrideDuration?: number): Item => ({
    id: newClientId(),
    position: 0,
    start_time: null,
    duration_min: overrideDuration ?? dur(t, 30),
    session_type: t,
    title,
    speaker_ids: [],
    speaker_extra: null,
    av_requirements: null,
  });

  if (template === "csc_in_person") {
    return [
      mk("chairperson_remarks", "Chairperson opening remarks"),
      mk("keynote", "Opening keynote"),
      mk("panel", "Morning panel"),
      mk("coffee_break"),
      mk("sponsored_keynote", "Sponsor keynote"),
      mk("roundtable", "Roundtable discussion"),
      mk("lunch"),
      mk("keynote", "Afternoon keynote"),
      mk("panel", "Afternoon panel"),
      mk("chairperson_remarks", "Chairperson closing remarks"),
      mk("happy_hour"),
    ];
  }
  if (template === "aiai") {
    return [
      mk("chairperson_remarks", "Chairperson opening"),
      mk("keynote"),
      mk("panel"),
      mk("panel"),
      mk("coffee_break"),
      mk("sponsored_keynote"),
      mk("lunch"),
      mk("keynote"),
      mk("panel"),
      mk("chairperson_remarks", "Chairperson closing"),
    ];
  }
  // virtual — fixed 9am-5pm EDT (480 min total incl. buffers)
  return [
    mk("chairperson_remarks", "Welcome & housekeeping", 15),
    mk("keynote", "Opening keynote", 40),
    mk("panel", "Morning panel", 45),
    mk("break", "Break", 10),
    mk("sponsored_keynote", "Sponsor keynote", 30),
    mk("keynote", "Midday keynote", 40),
    mk("lunch", "Lunch break", 45),
    mk("panel", "Afternoon panel", 45),
    mk("keynote", "Afternoon keynote", 40),
    mk("break", "Break", 10),
    mk("panel", "Closing panel", 45),
    mk("chairperson_remarks", "Closing remarks", 15),
  ];
}

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

  const [template, setTemplate] = useState<TemplateKey>(
    eventFormat === "virtual" ? "virtual" : "csc_in_person",
  );
  const [items, setItems] = useState<Item[] | null>(null);
  const [virtualBuffer, setVirtualBuffer] = useState<number>(15);

  useEffect(() => {
    if (itemsQ.data && items === null) {
      setItems(
        itemsQ.data.map((r: any) => ({
          id: r.id,
          position: r.position,
          start_time: r.start_time,
          duration_min: r.duration_min,
          session_type: r.session_type,
          title: r.title,
          speaker_ids: r.speaker_ids ?? [],
          speaker_extra: r.speaker_extra,
          av_requirements: r.av_requirements,
        })),
      );
    }
  }, [itemsQ.data, items]);

  const defaultDurs = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of templatesQ.data ?? []) {
      if (t.template_key === template) m.set(t.session_type, t.minutes);
    }
    return m;
  }, [templatesQ.data, template]);

  const isVirtual = template === "virtual";

  const rows = useMemo(() => {
    if (!items) return [];
    if (isVirtual) return recomputeTimes(items, virtualBuffer, VIRTUAL_DAY_START);
    return recomputeTimes(items, 0);
  }, [items, isVirtual, virtualBuffer]);

  const virtualOverrun = useMemo(() => {
    if (!isVirtual || rows.length === 0) return 0;
    const last = rows[rows.length - 1];
    const endMin =
      Number(last.start_time!.split(":")[0]) * 60 +
      Number(last.start_time!.split(":")[1]) +
      last.duration_min;
    return endMin - (9 * 60 + VIRTUAL_DAY_MINUTES);
  }, [isVirtual, rows]);

  const sponsorBackToBack = useMemo(() => {
    const flags = new Set<number>();
    for (let i = 1; i < rows.length; i++) {
      if (isSponsorType(rows[i].session_type) && isSponsorType(rows[i - 1].session_type)) {
        flags.add(i);
        flags.add(i - 1);
      }
    }
    return flags;
  }, [rows]);

  const speakerOptions = (speakersQ.data ?? []) as Array<{ id: string; name: string; status: string }>;

  const replaceFn = useServerFn(bulkReplaceAgenda);
  const save = useMutation({
    mutationFn: async () => {
      const payload = rows.map((r) => ({
        position: r.position,
        start_time: r.start_time,
        duration_min: r.duration_min,
        session_type: r.session_type,
        title: r.title,
        speaker_ids: r.speaker_ids,
        speaker_extra: r.speaker_extra,
        av_requirements: r.av_requirements,
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
    if (rows.length > 0) {
      if (!confirm("Replace current agenda with a fresh skeleton?")) return;
    }
    setItems(skeletonFor(template, defaultDurs));
  }

  function updateRow(i: number, patch: Partial<Item>) {
    setItems((prev) => prev!.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function move(i: number, dir: -1 | 1) {
    setItems((prev) => {
      const p = [...prev!];
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      [p[i], p[j]] = [p[j], p[i]];
      return p;
    });
  }

  function remove(i: number) {
    setItems((prev) => prev!.filter((_, idx) => idx !== i));
  }

  function add() {
    setItems((prev) => [
      ...(prev ?? []),
      {
        id: newClientId(),
        position: (prev?.length ?? 0) + 1,
        start_time: null,
        duration_min: 30,
        session_type: "keynote",
        title: "",
        speaker_ids: [],
        speaker_extra: null,
        av_requirements: null,
      },
    ]);
  }

  function exportCSV() {
    const header = ["Start", "End", "Mins", "Session type", "Session title", "Speaker(s)", "AV requirements"];
    const speakerNameById = new Map(speakerOptions.map((s) => [s.id, s.name]));
    const lines = rows.map((r) => {
      const end = r.start_time ? addMinutes(r.start_time, r.duration_min) : "";
      const spNames = [
        ...r.speaker_ids.map((id) => speakerNameById.get(id) ?? "").filter(Boolean),
        r.speaker_extra ?? "",
      ]
        .filter(Boolean)
        .join("; ");
      return [
        r.start_time ?? "",
        end,
        String(r.duration_min),
        SESSION_LABELS[r.session_type] ?? r.session_type,
        r.title ?? "",
        spNames,
        r.av_requirements ?? "",
      ];
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

  const startTime = isVirtual ? VIRTUAL_DAY_START : (items?.[0]?.start_time ?? "09:00");

  return (
    <div className="space-y-4">
      <Card className="p-4 rounded-2xl border-slate-200/70 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <div className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">
            Template
          </div>
          <Select value={template} onValueChange={(v) => setTemplate(v as TemplateKey)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_KEYS.map((k) => (
                <SelectItem key={k} value={k}>
                  {TEMPLATE_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <div className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">
            Day start {isVirtual && <span className="text-slate-400">(fixed)</span>}
          </div>
          <Input
            type="time"
            value={startTime}
            disabled={isVirtual}
            onChange={(e) =>
              setItems((prev) =>
                prev && prev.length > 0
                  ? prev.map((r, i) => (i === 0 ? { ...r, start_time: e.target.value } : r))
                  : prev,
              )
            }
            className="w-32"
          />
        </div>
        {isVirtual && (
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">
              Buffer (min)
            </div>
            <Input
              type="number"
              min={0}
              value={virtualBuffer}
              onChange={(e) => setVirtualBuffer(Number(e.target.value))}
              className="w-24"
            />
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
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={rows.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
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

      {isVirtual && (
        <div className="flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800">
          <span className="font-medium">
            Virtual event day: fixed {VIRTUAL_DAY_START}–{VIRTUAL_DAY_END} · All times EDT
          </span>
          {virtualOverrun > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Sessions overrun the day by {virtualOverrun} min — trim to fit inside {VIRTUAL_DAY_END}.
            </span>
          )}
        </div>
      )}

      {sponsorBackToBack.size > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          Two sponsor sessions are scheduled back-to-back. Consider spacing them out.
        </div>
      )}

      <Card className="rounded-2xl border-slate-200/70 overflow-hidden">
        <div className="grid grid-cols-[70px_70px_60px_150px_1fr_180px_150px_100px] gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b">
          <div>Start</div>
          <div>End</div>
          <div>Mins</div>
          <div>Type</div>
          <div>Title</div>
          <div>Speakers</div>
          <div>AV</div>
          <div className="text-right">Actions</div>
        </div>
        {rows.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-500">
            No agenda yet — pick a template and click "Draft skeleton" to get started.
          </div>
        )}
        {rows.map((r, i) => {
          const end = r.start_time ? addMinutes(r.start_time, r.duration_min) : "";
          const flagged = sponsorBackToBack.has(i);
          return (
            <div
              key={r.id}
              className={
                "grid grid-cols-[70px_70px_60px_150px_1fr_180px_150px_100px] gap-2 px-3 py-2 border-b border-slate-100 items-center " +
                (flagged ? "bg-amber-50/50" : "")
              }
            >
              <Input
                value={r.start_time ?? ""}
                onChange={(e) =>
                  updateRow(i, {
                    start_time: e.target.value,
                    // when user edits start of a mid-row, recompute uses first row's start; simplest: only row 0 authoritative
                  })
                }
                disabled={i !== 0}
                className="h-8 text-xs tabular-nums"
              />
              <Input
                value={end}
                onChange={(e) => {
                  if (!r.start_time) return;
                  const m = minutesBetween(r.start_time, e.target.value);
                  if (m > 0) updateRow(i, { duration_min: m });
                }}
                className="h-8 text-xs tabular-nums"
              />
              <Input
                type="number"
                min={1}
                value={r.duration_min}
                onChange={(e) => updateRow(i, { duration_min: Number(e.target.value) })}
                className="h-8 text-xs tabular-nums"
              />
              <Select
                value={r.session_type}
                onValueChange={(v) => {
                  const patch: Partial<Item> = { session_type: v };
                  const d = defaultDurs.get(v);
                  if (d) patch.duration_min = d;
                  updateRow(i, patch);
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {SESSION_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={r.title ?? ""}
                onChange={(e) => updateRow(i, { title: e.target.value })}
                placeholder="Session title…"
                className="h-8 text-xs"
              />
              <SpeakerPicker
                options={speakerOptions}
                selectedIds={r.speaker_ids}
                extra={r.speaker_extra ?? ""}
                onChange={(ids, extra) => updateRow(i, { speaker_ids: ids, speaker_extra: extra })}
              />
              <Input
                value={r.av_requirements ?? ""}
                onChange={(e) => updateRow(i, { av_requirements: e.target.value })}
                placeholder="1x mic, screen…"
                className="h-8 text-xs"
              />
              <div className="flex justify-end gap-0.5">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => move(i, -1)}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => move(i, 1)}>
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => remove(i)}
                >
                  <Trash2 className="h-3 w-3 text-red-500" />
                </Button>
              </div>
            </div>
          );
        })}
        <div className="p-2">
          <Button variant="ghost" size="sm" onClick={add}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add row
          </Button>
        </div>
      </Card>
    </div>
  );
}

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
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs justify-start font-normal truncate"
        >
          <span className="truncate">{labelText}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2">
        <div className="text-[11px] font-semibold uppercase text-slate-500 mb-1">
          Speakers on this event
        </div>
        <div className="max-h-52 overflow-auto space-y-1">
          {options.length === 0 && (
            <div className="text-xs text-slate-500 p-2">No speakers on this event yet.</div>
          )}
          {options.map((o) => (
            <label
              key={o.id}
              className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-slate-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(o.id)}
                onChange={() => toggle(o.id)}
              />
              <span className="flex-1 truncate">{o.name}</span>
              <span className="text-[10px] text-slate-400">{o.status}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t">
          <div className="text-[11px] font-semibold uppercase text-slate-500 mb-1">
            TBC / extra names
          </div>
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
        <Button variant="outline" size="sm">
          Template durations
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3">
        <div className="text-xs font-semibold mb-2">
          {TEMPLATE_LABELS[templateKey]} — default minutes
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
        <div className="text-[10px] text-slate-500 mt-2">
          Changes apply to future "Draft skeleton" runs.
        </div>
      </PopoverContent>
    </Popover>
  );
}
