import { AlertTriangle } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import type { TopicIdeasResult as Result } from "@/lib/topic-ideas.functions";

export function formatGeneratedAt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function TopicIdeasResultView({
  result,
  generatedAt,
}: {
  result: Result;
  generatedAt?: string | null;
}) {
  const stamp = result.generated_at ?? generatedAt;
  return (
    <div className="space-y-3">
      {result.overlap_note && (
        <div className="flex gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{result.overlap_note}</span>
        </div>
      )}
      {result.fit === "poor" && (
        <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-800 ring-1 ring-inset ring-rose-200">
          {result.fit_note ?? "This background doesn't fit the event's subject matter."}
        </div>
      )}
      {result.fit === "good" && result.fit_note && (
        <div className="text-xs text-muted-foreground">{result.fit_note}</div>
      )}
      <ol className="space-y-2">
        {result.topics.map((t, i) => (
          <li key={i} className="rounded-lg border bg-background p-3">
            <div className="flex items-start gap-2">
              <StatusPill className="bg-primary/10 text-primary ring-primary/20">
                #{t.rank || i + 1}
              </StatusPill>
              <div className="min-w-0">
                <div className="text-sm font-medium leading-snug">{t.title}</div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t.description}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {stamp && (
        <div className="text-[11px] text-muted-foreground">Generated {formatGeneratedAt(stamp)}</div>
      )}
    </div>
  );
}
