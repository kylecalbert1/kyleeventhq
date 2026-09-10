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
