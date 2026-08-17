import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Check, Sparkles } from "lucide-react";
import { asanaTasksQuery } from "@/lib/queries";

function fmtDate(iso: string | null): string {
  if (!iso) return "no date";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function isOverdue(iso: string | null, completed: boolean): boolean {
  if (completed || !iso) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(iso) < today;
}

export function AsanaTasksCard({
  eventId,
  eventCode,
  asanaProjectGid,
}: {
  eventId: string;
  eventCode?: string | null;
  asanaProjectGid: string | null | undefined;
}) {
  const q = useQuery(asanaTasksQuery({ event_id: eventId }));

  const rows = (q.data ?? []) as any[];
  if (!asanaProjectGid) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          Asana
          <span className="text-[10px] font-normal text-slate-400">
            {rows.filter((r) => !r.completed).length} open · {rows.length} tracked
          </span>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">
          No matching tasks yet. Nightly sync runs at 07:00 UTC.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((t) => {
            const overdue = isOverdue(t.due_on, t.completed);
            const url = `https://app.asana.com/0/${asanaProjectGid}/${t.asana_gid}`;
            return (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
              >
                {t.completed ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full border border-slate-300 shrink-0" />
                )}
                <span
                  className={`text-xs flex-1 truncate ${
                    t.completed ? "line-through text-slate-400" : "text-slate-700"
                  }`}
                >
                  {t.name}
                </span>
                <span
                  className={`text-[10px] tabular-nums shrink-0 ${
                    overdue ? "text-rose-600 font-semibold" : "text-slate-500"
                  }`}
                >
                  {fmtDate(t.due_on)}
                </span>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 hover:text-slate-700 shrink-0"
                  title="Open in Asana"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// Suggestion pill for a website task card: shown when the matching Asana
// task is completed but the local checkbox isn't ticked yet.
export function AsanaSuggestionRow({
  matchingAsanaTaskCompleted,
  localDone,
  onConfirm,
}: {
  matchingAsanaTaskCompleted: boolean;
  localDone: boolean;
  onConfirm: () => void;
}) {
  if (!matchingAsanaTaskCompleted || localDone) return null;
  return (
    <div className="mt-1 flex items-center gap-2 rounded-md bg-amber-50 ring-1 ring-amber-200 px-2 py-1 text-[11px] text-amber-800">
      <Sparkles className="h-3 w-3 shrink-0" />
      <span>Asana shows this done — mark done?</span>
      <Button size="sm" variant="outline" className="h-6 ml-auto text-[11px]" onClick={onConfirm}>
        Confirm
      </Button>
    </div>
  );
}
