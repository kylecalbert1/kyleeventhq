import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { SESSION_LABELS, isSponsorType } from "@/lib/agenda.functions";

export type WordAgendaItem = {
  start_time: string | null;
  duration_min: number;
  session_type: string;
  title: string | null;
  speaker_ids?: string[] | null;
  speaker_extra?: string | null;
  av_requirements?: string | null;
};

export type WordSpeaker = { id: string; name: string; title?: string | null; company?: string | null };

const PREFIX_TYPES = new Set(["panel", "fireside_chat", "workshop", "sponsored_keynote"]);

function sessionTypeCell(session_type: string, title: string | null): string {
  const label = SESSION_LABELS[session_type] ?? session_type;
  const t = (title ?? "").trim();
  if (!t) return label;
  if (PREFIX_TYPES.has(session_type) && !t.toLowerCase().startsWith(label.toLowerCase())) {
    return `${label}: ${t}`;
  }
  return t;
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

export function splitByDay<T extends { start_time: string | null }>(items: T[]): T[][] {
  const days: T[][] = [[]];
  let prevStart: string | null = null;
  for (const it of items) {
    if (prevStart && it.start_time && it.start_time < prevStart) days.push([]);
    days[days.length - 1].push(it);
    if (it.start_time) prevStart = it.start_time;
  }
  return days.filter((d) => d.length > 0);
}

function formatLongDate(iso: string | null | undefined, offsetDays = 0): string | null {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function speakerCellLines(
  item: WordAgendaItem,
  speakerById: Map<string, WordSpeaker>,
): string[] {
  const lines: string[] = [];
  for (const id of item.speaker_ids ?? []) {
    const s = speakerById.get(id);
    if (!s) continue;
    lines.push([s.name, s.title, s.company].map((p) => (p ?? "").trim()).filter(Boolean).join(", "));
  }
  const extra = (item.speaker_extra ?? "").trim();
  if (extra) {
    for (const part of extra.split(/\n|;/)) {
      const p = part.trim();
      if (p) lines.push(p);
    }
  }
  return lines;
}

const COL_WIDTHS = [900, 900, 700, 3060, 2400, 1400];
const TABLE_WIDTH = COL_WIDTHS.reduce((a, b) => a + b, 0);
const border = { style: BorderStyle.SINGLE, size: 1, color: "BFBFBF" };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(lines: string[], idx: number, opts: { bold?: boolean; fill?: string } = {}) {
  return new TableCell({
    borders,
    width: { size: COL_WIDTHS[idx], type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    ...(opts.fill ? { shading: { fill: opts.fill, type: ShadingType.CLEAR } } : {}),
    children:
      lines.length === 0
        ? [new Paragraph({ children: [new TextRun("")] })]
        : lines.map(
            (l) => new Paragraph({ children: [new TextRun({ text: l, bold: opts.bold })] }),
          ),
  });
}

const HEADERS = ["Start", "End", "Mins", "Session Type", "Speaker(s)", "AV Requirements"];

function buildTable(items: WordAgendaItem[], speakerById: Map<string, WordSpeaker>): Table {
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: HEADERS.map((h, i) => cell([h], i, { bold: true, fill: "EFEFEF" })),
    }),
  ];
  for (const it of items) {
    const fill = isSponsorType(it.session_type) ? "FFF2A8" : undefined;
    const start = it.start_time ?? "";
    const end = it.start_time ? addMinutes(it.start_time, it.duration_min) : "";
    const cells = [
      [start],
      [end],
      [String(it.duration_min)],
      [sessionTypeCell(it.session_type, it.title)],
      speakerCellLines(it, speakerById),
      (it.av_requirements ?? "").trim() ? [(it.av_requirements ?? "").trim()] : [],
    ];
    rows.push(new TableRow({ children: cells.map((c, i) => cell(c, i, { fill })) }));
  }
  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: COL_WIDTHS,
    rows,
  });
}

export async function exportAgendaWord(opts: {
  event: { name?: string | null; venue?: string | null; event_date?: string | null; code?: string | null };
  items: WordAgendaItem[];
  speakers: WordSpeaker[];
  timezone?: string;
}) {
  const { event, items, speakers } = opts;
  const tz = (opts.timezone ?? "").trim();
  const speakerById = new Map(speakers.map((s) => [s.id, s]));
  const days = splitByDay(items);

  const children: Array<Paragraph | Table> = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: "AV agenda", bold: true, size: 32 })],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Event: ${event.name ?? ""}`, bold: true }),
        new TextRun({ text: `     Venue: ${event.venue ?? ""}` }),
      ],
    }),
  ];

  days.forEach((dayItems, i) => {
    const dateStr = formatLongDate(event.event_date, i);
    const bits: string[] = [];
    if (dateStr) bits.push(`Date: ${dateStr}`);
    if (tz) bits.push(`All times in ${tz}`);
    const heading = days.length > 1 ? `Day ${i + 1}` : "";
    if (heading) {
      children.push(
        new Paragraph({
          spacing: { before: 240 },
          children: [new TextRun({ text: heading, bold: true, size: 26 })],
        }),
      );
    }
    if (bits.length > 0) {
      children.push(new Paragraph({ children: [new TextRun(bits.join("     "))] }));
    }
    if (i === 0) {
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: "* Yellow rows = sponsor slots", italics: true })],
        }),
      );
    }
    children.push(buildTable(dayItems, speakerById));
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug = (event.code || event.name || "agenda").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  a.download = `av-agenda-${slug || "event"}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
