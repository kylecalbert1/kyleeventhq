import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Pencil, Upload } from "lucide-react";
import { agendaItemsQuery, speakersQuery } from "@/lib/queries";
import { SESSION_LABELS } from "@/lib/agenda.functions";
import { AgendaBuilder } from "@/components/agenda/AgendaBuilder";
import { AgendaImportDialog } from "@/components/agenda/AgendaImportDialog";

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

const TYPE_ACCENT: Record<string, string> = {
  keynote: "border-l-indigo-500 bg-indigo-50/40",
  sponsored_keynote: "border-l-amber-500 bg-amber-50/40",
  panel: "border-l-violet-500 bg-violet-50/40",
  fireside_chat: "border-l-rose-400 bg-rose-50/40",
  roundtable: "border-l-teal-500 bg-teal-50/40",
  workshop: "border-l-sky-500 bg-sky-50/40",
  chairperson_remarks: "border-l-slate-400 bg-slate-50/40",
  coffee_break: "border-l-orange-300 bg-orange-50/40",
  break: "border-l-slate-300 bg-slate-50/40",
  lunch: "border-l-lime-500 bg-lime-50/40",
  happy_hour: "border-l-pink-500 bg-pink-50/40",
  other: "border-l-slate-300 bg-slate-50/40",
};

function isBreakLike(t: string) {
  return t === "coffee_break" || t === "break" || t === "lunch" || t === "happy_hour";
}

export function AgendaTab({ eventId, eventFormat }: { eventId: string; eventFormat: string }) {
  const itemsQ = useQuery(agendaItemsQuery(eventId));
  const speakersQ = useQuery(speakersQuery(eventId));
  const items = itemsQ.data ?? [];
  const hasItems = items.length > 0;
  const [mode, setMode] = useState<"view" | "edit">(hasItems ? "view" : "edit");
  const [importOpen, setImportOpen] = useState(false);

  // Keep mode in sync when data first arrives on a new event
  useMemo(() => {
    if (itemsQ.isSuccess && !hasItems && mode === "view") setMode("edit");
  }, [itemsQ.isSuccess, hasItems]);

  const speakerNameById = useMemo(
    () => new Map((speakersQ.data ?? []).map((s: any) => [s.id, s.name])),
    [speakersQ.data],
  );

  function exportCSV() {
    const header = ["Start", "End", "Mins", "Session type", "Session title", "Speaker(s)", "AV requirements"];
    const rows = items.map((r: any) => {
      const end = r.start_time ? addMinutes(r.start_time, r.duration_min) : "";
      const spNames = [
        ...(r.speaker_ids ?? []).map((id: string) => speakerNameById.get(id) ?? "").filter(Boolean),
        r.speaker_extra ?? "",
      ].filter(Boolean).join("; ");
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
    const csv = [header, ...rows]
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

  if (mode === "edit") {
    return (
      <>
        <AgendaBuilder
          eventId={eventId}
          eventFormat={eventFormat}
          onImport={() => setImportOpen(true)}
          onSaved={() => setMode("view")}
          onCancel={hasItems ? () => setMode("view") : undefined}
        />
        <AgendaImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          eventId={eventId}
          speakers={speakersQ.data ?? []}
          onImported={() => setMode("view")}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Running order</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {items.length} sessions · saved. Use Edit to change, Import to replace from a file.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Import
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={items.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
          <Button size="sm" onClick={() => setMode("edit")}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500 rounded-2xl border-slate-200/70">
          No agenda yet.
          <div className="mt-3 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Import file
            </Button>
            <Button size="sm" onClick={() => setMode("edit")}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Build from scratch
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-0 rounded-2xl border-slate-200/70 overflow-hidden">
          <ol className="divide-y divide-slate-100">
            {items.map((r: any) => {
              const end = r.start_time ? addMinutes(r.start_time, r.duration_min) : "";
              const accent = TYPE_ACCENT[r.session_type] ?? TYPE_ACCENT.other;
              const spNames = [
                ...(r.speaker_ids ?? [])
                  .map((id: string) => speakerNameById.get(id))
                  .filter(Boolean),
                r.speaker_extra,
              ].filter(Boolean);
              const breakLike = isBreakLike(r.session_type);
              return (
                <li key={r.id} className={`flex gap-4 px-5 py-4 border-l-4 ${accent}`}>
                  <div className="w-28 shrink-0 pt-0.5">
                    <div className="text-sm font-semibold text-slate-900 tabular-nums">
                      {r.start_time ?? "—"}
                      {end ? ` – ${end}` : ""}
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">{r.duration_min} min</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 bg-white ring-1 ring-slate-200 rounded-full px-2 py-0.5">
                        {SESSION_LABELS[r.session_type] ?? r.session_type}
                      </span>
                      {r.title && (
                        <span className={`font-semibold ${breakLike ? "text-slate-600" : "text-slate-900"}`}>
                          {r.title}
                        </span>
                      )}
                    </div>
                    {spNames.length > 0 && (
                      <div className="mt-1 text-sm text-slate-700">
                        {spNames.join(", ")}
                      </div>
                    )}
                    {r.av_requirements && (
                      <div className="mt-1 text-xs text-slate-500 italic">
                        AV: {r.av_requirements}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <AgendaImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        eventId={eventId}
        speakers={speakersQ.data ?? []}
        onImported={() => setMode("view")}
      />
    </div>
  );
}
