import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lightbulb, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopicIdeasResultView } from "@/components/speakers/TopicIdeasResult";
import { generateTopicIdeas, type TopicIdeasResult } from "@/lib/topic-ideas.functions";

export function TopicIdeasCard({ speaker }: { speaker: any }) {
  const qc = useQueryClient();
  const run = useServerFn(generateTopicIdeas);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<TopicIdeasResult | null>(null);

  const stored = (local ?? (speaker.topic_ideas as TopicIdeasResult | null)) ?? null;
  const hasProfile = ((speaker.profile_notes || speaker.notes || "") as string).trim().length >= 40;

  async function generate() {
    setBusy(true);
    try {
      const result = await run({ data: { speaker_id: speaker.id } });
      setLocal(result);
      toast.success("Topic ideas ready");
      qc.invalidateQueries({ queryKey: ["speakers"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not generate topic ideas");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Topic ideas
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Three ranked session ideas from the pasted profile text, tailored to this event and slot
            format.
          </p>
        </div>
        <Button
          size="sm"
          variant={stored ? "outline" : "default"}
          disabled={busy || !hasProfile}
          onClick={() => void generate()}
        >
          {stored ? (
            <RefreshCw className={`h-4 w-4 mr-1.5 ${busy ? "animate-spin" : ""}`} />
          ) : (
            <Lightbulb className="h-4 w-4 mr-1.5" />
          )}
          {busy ? "Thinking…" : stored ? "Regenerate" : "Generate topic ideas"}
        </Button>
      </div>

      {!hasProfile && (
        <div className="text-xs text-muted-foreground">
          Paste their LinkedIn About section, work history or recent posts into Profile notes first.
        </div>
      )}

      {stored && (
        <TopicIdeasResultView result={stored} generatedAt={speaker.topic_ideas_generated_at} />
      )}
    </section>
  );
}
            <div className="flex gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{stored.overlap_note}</span>
            </div>
          )}
          {stored.fit === "poor" && (
            <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-800 ring-1 ring-inset ring-rose-200">
              {stored.fit_note ?? "This background doesn't fit the event's subject matter."}
            </div>
          )}
          {stored.fit === "good" && stored.fit_note && (
            <div className="text-xs text-muted-foreground">{stored.fit_note}</div>
          )}
          <ol className="space-y-2">
            {stored.topics.map((t, i) => (
              <li key={i} className="rounded-lg border bg-background p-3">
                <div className="flex items-start gap-2">
                  <StatusPill className="bg-primary/10 text-primary ring-primary/20">
                    #{t.rank || i + 1}
                  </StatusPill>
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-snug">{t.title}</div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {t.description}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {(stored.generated_at ?? speaker.topic_ideas_generated_at) && (
            <div className="text-[11px] text-muted-foreground">
              Generated {fmt(stored.generated_at ?? speaker.topic_ideas_generated_at)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
