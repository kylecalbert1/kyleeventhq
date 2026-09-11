import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lightbulb, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TopicIdeasResultView } from "@/components/speakers/TopicIdeasResult";
import {
  generateTopicIdeasAdhoc,
  type TopicIdeasResult,
} from "@/lib/topic-ideas.functions";
import { createSpeaker, updateSpeaker } from "@/lib/speakers.functions";
import { eventsQuery } from "@/lib/queries";
import { SESSION_FORMATS, SUMMIT_SERIES, labels, type SessionFormatVal, type SummitSeries } from "@/lib/status";

export const Route = createFileRoute("/_authenticated/topic-ideas")({
  head: () => ({
    meta: [
      { title: "Topic ideas — Event Ops" },
      {
        name: "description",
        content:
          "Generate three ranked session topic ideas from a pasted profile, before anyone is added to a speaker board.",
      },
      { property: "og:title", content: "Topic ideas — Event Ops" },
      {
        property: "og:description",
        content: "Ranked session topic ideas from pasted profile text, tailored to the summit and slot format.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TopicIdeasPage,
});

function TopicIdeasPage() {
  const qc = useQueryClient();
  const events = useQuery(eventsQuery);
  const run = useServerFn(generateTopicIdeasAdhoc);
  const create = useServerFn(createSpeaker);
  const update = useServerFn(updateSpeaker);

  const [profile, setProfile] = useState("");
  const [name, setName] = useState("");
  const [series, setSeries] = useState<"" | SummitSeries>("");
  const [eventId, setEventId] = useState<string>("");
  const [eventName, setEventName] = useState("");
  const [format, setFormat] = useState<"" | SessionFormatVal>("");
  const [others, setOthers] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TopicIdeasResult | null>(null);

  const eventList = useMemo(
    () => (events.data ?? []) as Array<{ id: string; name: string; code: string | null }>,
    [events.data],
  );

  const canGenerate = profile.trim().length >= 40 && !busy;

  async function generate() {
    setBusy(true);
    try {
      const res = await run({
        data: {
          profile,
          series: series || null,
          event_id: eventId || null,
          event_name: eventId ? null : eventName || null,
          session_format: format || null,
          speaker_name: name || null,
          other_topics: others || null,
        },
      });
      setResult(res);
      toast.success("Topic ideas ready");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not generate topic ideas");
    } finally {
      setBusy(false);
    }
  }

  async function saveAsSpeaker() {
    if (!eventId) {
      toast.error("Pick one of your tracked events first, a speaker has to belong to an event.");
      return;
    }
    if (!name.trim()) {
      toast.error("Add the person's name first.");
      return;
    }
    setSaving(true);
    try {
      const row: any = await create({
        data: {
          event_id: eventId,
          name: name.trim(),
          status: "new",
          banner_status: "not_started",
          linkedin_post_confirmed: false,
          profile_notes: profile,
          session_format: format || null,
        },
      });
      if (result && row?.id) {
        await update({
          data: {
            id: row.id,
            patch: {
              topic_ideas: result,
              topic_ideas_generated_at: result.generated_at ?? new Date().toISOString(),
            },
          },
        });
      }
      qc.invalidateQueries({ queryKey: ["speakers"] });
      toast.success("Saved as a speaker");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save this speaker");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Topic ideas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          A scratchpad for call prep. Paste someone's profile text and get three ranked session
          ideas. Nothing is saved unless you choose to save them as a speaker.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="profile">Profile text</Label>
            <Textarea
              id="profile"
              rows={14}
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              placeholder="Paste their LinkedIn About section, work history and a few recent posts."
            />
            <p className="text-[11px] text-muted-foreground">
              Recent original posts give much better ideas than the About section alone.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="other-topics">Topics already being pitched (optional)</Label>
            <Textarea
              id="other-topics"
              rows={3}
              value={others}
              onChange={(e) => setOthers(e.target.value)}
              placeholder="One per line, so overlaps get flagged."
            />
          </div>
        </section>

        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name (optional)</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Summit series</Label>
            <Select value={series} onValueChange={(v) => setSeries(v as SummitSeries)}>
              <SelectTrigger>
                <SelectValue placeholder="Pick the audience" />
              </SelectTrigger>
              <SelectContent>
                {SUMMIT_SERIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {labels.summitSeries[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Sets how senior and how technical the ideas should be.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Event</Label>
            <Select
              value={eventId || "none"}
              onValueChange={(v) => setEventId(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="One of your events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not tracked yet</SelectItem>
                {eventList.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                    {e.code ? ` · ${e.code}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!eventId && (
              <Input
                className="mt-2"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="Or type the event name"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Slot format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as SessionFormatVal)}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a format" />
              </SelectTrigger>
              <SelectContent>
                {SESSION_FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {labels.sessionFormat[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button className="w-full" disabled={!canGenerate} onClick={() => void generate()}>
            {result ? (
              <RefreshCw className={`h-4 w-4 mr-1.5 ${busy ? "animate-spin" : ""}`} />
            ) : (
              <Lightbulb className="h-4 w-4 mr-1.5" />
            )}
            {busy ? "Thinking…" : result ? "Regenerate" : "Generate topic ideas"}
          </Button>
          {profile.trim().length < 40 && (
            <p className="text-[11px] text-muted-foreground">
              Paste a bit more profile text to get going.
            </p>
          )}
        </section>
      </div>

      {result && (
        <section className="mt-5 space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Ideas
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => void saveAsSpeaker()}
            >
              <UserPlus className="h-4 w-4 mr-1.5" />
              {saving ? "Saving…" : "Save as speaker"}
            </Button>
          </div>
          <TopicIdeasResultView result={result} />
          {!eventId && (
            <p className="text-[11px] text-muted-foreground">
              Pick one of your tracked events above if you want to save this person as a speaker.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
