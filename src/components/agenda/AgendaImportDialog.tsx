import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, AlertTriangle, Link as LinkIcon, Loader2 } from "lucide-react";
import {
  SESSION_LABELS,
  SESSION_TYPES,
  bulkReplaceAgenda,
  importAgendaFromUrl,
} from "@/lib/agenda.functions";

type ParsedRow = {
  start_time: string | null;
  duration_min: number;
  session_type: string;
  title: string | null;
  speaker_ids: string[];
  speaker_extra: string | null;
  av_requirements: string | null;
  track: string | null;
  raw_speakers?: string;
};

const TYPE_ALIASES: Array<[string, string]> = [
  ["chairperson", "chairperson_remarks"],
  ["chair remarks", "chairperson_remarks"],
  ["opening remark", "chairperson_remarks"],
  ["closing remark", "chairperson_remarks"],
  ["sponsored keynote", "sponsored_keynote"],
  ["sponsor keynote", "sponsored_keynote"],
  ["keynote", "keynote"],
  ["fireside", "fireside_chat"],
  ["panel", "panel"],
  ["roundtable", "roundtable"],
  ["workshop", "workshop"],
  ["coffee", "coffee_break"],
  ["break", "break"],
  ["lunch", "lunch"],
  ["happy hour", "happy_hour"],
  ["networking", "happy_hour"],
];

function normalizeSessionType(raw: string): string {
  const s = (raw || "").trim().toLowerCase();
  if (!s) return "other";
  if ((SESSION_TYPES as readonly string[]).includes(s)) return s;
  const snake = s.replace(/[\s-]+/g, "_");
  if ((SESSION_TYPES as readonly string[]).includes(snake)) return snake;
  for (const [needle, val] of TYPE_ALIASES) if (s.includes(needle)) return val;
  return "other";
}

function parseTime(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const totalMin = Math.round(v * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const m = s.match(/(\d{1,2})[:.]?(\d{2})?\s*(am|pm)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const mm = Number(m[2] ?? 0);
  const ampm = (m[3] || "").toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h > 23 || mm > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function minsBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  const diff = bh * 60 + bm - (ah * 60 + am);
  return diff > 0 ? diff : null;
}

function findHeaderIndexes(header: string[]) {
  const norm = header.map((h) => (h || "").toString().trim().toLowerCase());
  const findIdx = (needles: string[]) =>
    norm.findIndex((h) => needles.some((n) => h.includes(n)));
  return {
    start: findIdx(["start"]),
    end: findIdx(["end", "finish"]),
    mins: findIdx(["min", "duration", "length"]),
    type: findIdx(["type", "session type", "format"]),
    title: findIdx(["title", "session title", "topic", "session"]),
    speakers: findIdx(["speaker"]),
    av: findIdx(["av", "requirement", "notes"]),
    track: findIdx(["track", "stream", "stage", "room"]),
  };
}

function rowsFromMatrix(matrix: any[][]): ParsedRow[] {
  if (matrix.length < 2) return [];
  let headerRow = 0;
  for (let i = 0; i < Math.min(matrix.length, 8); i++) {
    const cells = matrix[i].map((c) => String(c ?? "").toLowerCase());
    if (cells.some((c) => c.includes("start")) && cells.some((c) => c.includes("session") || c.includes("type") || c.includes("title"))) {
      headerRow = i;
      break;
    }
  }
  const header = matrix[headerRow].map((c) => String(c ?? ""));
  const idx = findHeaderIndexes(header);
  const out: ParsedRow[] = [];
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;
    const start = idx.start >= 0 ? parseTime(row[idx.start]) : null;
    const end = idx.end >= 0 ? parseTime(row[idx.end]) : null;
    let mins = idx.mins >= 0 ? Number(row[idx.mins]) : NaN;
    if (!Number.isFinite(mins) || mins <= 0) {
      const derived = minsBetween(start, end);
      mins = derived ?? 30;
    }
    const typeRaw = idx.type >= 0 ? String(row[idx.type] ?? "") : "";
    const title = idx.title >= 0 ? String(row[idx.title] ?? "").trim() : "";
    const spk = idx.speakers >= 0 ? String(row[idx.speakers] ?? "").trim() : "";
    const av = idx.av >= 0 ? String(row[idx.av] ?? "").trim() : "";
    const track = idx.track >= 0 ? String(row[idx.track] ?? "").trim() : "";
    out.push({
      start_time: start,
      duration_min: Math.max(1, Math.round(mins)),
      session_type: normalizeSessionType(typeRaw),
      title: title || null,
      speaker_ids: [],
      speaker_extra: null,
      av_requirements: av || null,
      track: track || null,
      raw_speakers: spk || undefined,
    });
  }
  return out;
}

function splitNames(raw: string): string[] {
  return raw
    .split(/,|;|\band\b|&|\/|\n/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchSpeakers(
  parsed: ParsedRow[],
  speakers: Array<{ id: string; name: string }>,
): ParsedRow[] {
  const byName = new Map<string, string>();
  for (const s of speakers) byName.set(s.name.trim().toLowerCase(), s.id);
  return parsed.map((r) => {
    if (!r.raw_speakers) return r;
    const names = splitNames(r.raw_speakers);
    const ids: string[] = [];
    const unmatched: string[] = [];
    for (const n of names) {
      const id = byName.get(n.toLowerCase());
      if (id) ids.push(id);
      else unmatched.push(n);
    }
    return {
      ...r,
      speaker_ids: ids,
      speaker_extra: unmatched.length > 0 ? unmatched.join(", ") : null,
    };
  });
}

export function AgendaImportDialog({
  open,
  onOpenChange,
  eventId,
  speakers,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  speakers: Array<{ id: string; name: string }>;
  onImported: () => void;
}) {
  const qc = useQueryClient();
  const replaceFn = useServerFn(bulkReplaceAgenda);
  const importUrlFn = useServerFn(importAgendaFromUrl);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  async function handleFile(file: File) {
    setParsing(true);
    setFileName(file.name);
    try {
      const name = file.name.toLowerCase();
      let matrix: any[][] = [];
      if (name.endsWith(".csv")) {
        const XLSX = await import("xlsx");
        const text = await file.text();
        const wb = XLSX.read(text, { type: "string" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        matrix = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        matrix = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      } else if (name.endsWith(".docx")) {
        const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
        const buf = await file.arrayBuffer();
        const { value: html } = await (mammoth as any).convertToHtml({ arrayBuffer: buf });
        const doc = new DOMParser().parseFromString(html, "text/html");
        const table = doc.querySelector("table");
        if (!table) {
          toast.error("No table found in this .docx — try exporting to xlsx or csv.");
          setRows([]);
          setParsing(false);
          return;
        }
        matrix = Array.from(table.querySelectorAll("tr")).map((tr) =>
          Array.from(tr.querySelectorAll("th,td")).map((c) => (c.textContent ?? "").trim()),
        );
      } else {
        toast.error("Unsupported file type. Use .xlsx, .csv, or .docx.");
        setParsing(false);
        return;
      }
      const parsed = matchSpeakers(rowsFromMatrix(matrix), speakers);
      if (parsed.length === 0) {
        toast.error("Couldn't find any agenda rows in that file.");
      }
      setRows(parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to parse file");
    } finally {
      setParsing(false);
    }
  }

  async function handleUrlImport() {
    if (!urlValue.trim()) return;
    setUrlLoading(true);
    setFileName(urlValue);
    try {
      const res = await importUrlFn({ data: { url: urlValue.trim() } });
      const parsed = matchSpeakers(
        res.rows.map((r) => ({
          start_time: r.start_time,
          duration_min: r.duration_min,
          session_type: r.session_type,
          title: r.title,
          speaker_ids: [],
          speaker_extra: null,
          av_requirements: null,
          track: r.track,
          raw_speakers: r.raw_speakers ?? undefined,
        })),
        speakers,
      );
      if (parsed.length === 0) toast.error("Couldn't find any agenda rows on that page.");
      setRows(parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to fetch URL");
    } finally {
      setUrlLoading(false);
    }
  }

  const commit = useMutation({
    mutationFn: async () => {
      if (!rows) return;
      const items = rows.map((r, i) => ({
        position: i + 1,
        start_time: r.start_time,
        duration_min: r.duration_min,
        session_type: r.session_type,
        title: r.title,
        speaker_ids: r.speaker_ids,
        speaker_extra: r.speaker_extra,
        av_requirements: r.av_requirements,
        track: r.track,
      }));
      return replaceFn({ data: { event_id: eventId, items } });
    },
    onSuccess: () => {
      toast.success(`Imported ${rows?.length ?? 0} rows`);
      qc.invalidateQueries({ queryKey: ["agendaItems", eventId] });
      onImported();
      onOpenChange(false);
      setRows(null);
      setFileName(null);
      setUrlValue("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setRows(null); setFileName(null); setUrlValue(""); } }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import agenda</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold text-slate-700 mb-1">Import from URL</div>
            <div className="text-xs text-slate-500 mb-2">
              Paste a public agenda page (e.g. Acara event site). We'll fetch it server-side and parse the running order.
            </div>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://events.customersuccesscollective.com/…/agenda"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleUrlImport} disabled={urlLoading || !urlValue.trim()}>
                {urlLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <LinkIcon className="h-3.5 w-3.5 mr-1.5" />}
                Fetch
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400">
            <div className="flex-1 h-px bg-slate-200" />
            or
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-700 mb-1">Upload a file</div>
            <div className="text-xs text-slate-500 mb-2">
              .xlsx, .csv, or .docx. Expected columns: Start · End · Mins · Session Type · Session Title · Speaker(s) · Track · AV Requirements. Extras and order don't matter.
            </div>
            <label className="flex items-center gap-2 p-3 rounded-lg border-2 border-dashed border-slate-300 hover:bg-slate-50 cursor-pointer">
              <Upload className="h-4 w-4 text-slate-500" />
              <span className="text-sm">
                {fileName ? fileName : "Click to choose a file…"}
              </span>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
            {parsing && <div className="text-xs text-slate-500 mt-2">Parsing…</div>}
          </div>

          {rows && rows.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2">
                Preview — {rows.length} rows
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[60px_60px_50px_110px_1fr_140px_120px] gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b">
                  <div>Start</div>
                  <div>End</div>
                  <div>Mins</div>
                  <div>Type</div>
                  <div>Title</div>
                  <div>Track</div>
                  <div>Speakers</div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {rows.map((r, i) => {
                    const end =
                      r.start_time
                        ? (() => {
                            const [h, m] = r.start_time.split(":").map(Number);
                            const t = h * 60 + m + r.duration_min;
                            return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
                          })()
                        : "";
                    return (
                      <div
                        key={i}
                        className="grid grid-cols-[60px_60px_50px_110px_1fr_140px_120px] gap-2 px-3 py-1.5 text-xs border-b border-slate-100 items-center"
                      >
                        <div className="tabular-nums">{r.start_time ?? "—"}</div>
                        <div className="tabular-nums">{end}</div>
                        <div className="tabular-nums">{r.duration_min}</div>
                        <div className="truncate">{SESSION_LABELS[r.session_type] ?? r.session_type}</div>
                        <div className="truncate">{r.title ?? ""}</div>
                        <div className="truncate text-slate-600">{r.track ?? ""}</div>
                        <div className="truncate">
                          {r.speaker_ids.length > 0 && (
                            <span className="text-emerald-700">{r.speaker_ids.length} matched</span>
                          )}
                          {r.speaker_extra && (
                            <span className="text-slate-500">
                              {r.speaker_ids.length > 0 ? " · " : ""}
                              {r.speaker_extra}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-2 flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                Importing will replace the current agenda for this event.
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!rows || rows.length === 0 || commit.isPending}
            onClick={() => commit.mutate()}
          >
            {commit.isPending ? "Importing…" : `Import ${rows?.length ?? 0} rows`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
