import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SpeakerDetailDialog } from "@/components/dialogs/SpeakerDetailDialog";
import {
  GenerateMessageDialog,
  type DraftTemplate,
} from "@/components/messages/GenerateMessageDialog";
import { messageSenderQuery } from "@/lib/queries";
import { runCommand, addSpeakerFromSuggestion } from "@/lib/command.functions";

type Suggestion = {
  name: string;
  email: string;
  subject: string;
  snippet: string;
  thread_id: string;
  received_at: string;
};

function missingLabel(s: any): string | null {
  const bits: string[] = [];
  if (!s.email) bits.push("email");
  if (s.bio_received === false) bits.push("bio");
  if (s.headshot_received === false) bits.push("headshot");
  return bits.length ? `missing: ${bits.join(", ")}` : null;
}

export function CommandBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const eventId = pathname.match(/^\/events\/([0-9a-f-]{36})/i)?.[1] ?? null;

  const [text, setText] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [openSpeaker, setOpenSpeaker] = useState<any | null>(null);

  const sender = useQuery(messageSenderQuery);

  const run = useMutation({
    mutationFn: () => runCommand({ data: { text: text.trim(), eventId } }),
    onSuccess: (r: any) => {
      setError(null);
      setResult(r);
      setSuggestions(r?.intent === "scan_gmail_for_event" ? (r.suggestions ?? []) : []);
    },
    onError: (e: any) => {
      setResult(null);
      setError(e?.message ?? "Something went wrong running that command.");
    },
  });

  const add = useMutation({
    mutationFn: (s: Suggestion) =>
      addSpeakerFromSuggestion({
        data: { eventId: result?.event?.id, name: s.name, email: s.email },
      }),
    onSuccess: (_d, s) => {
      setSuggestions((prev) => prev.filter((x) => x.email !== s.email));
      toast.success(`${s.name} added to the speaker board`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not add that person"),
  });

  function dismissAll() {
    setResult(null);
    setError(null);
    setSuggestions([]);
  }

  return (
    <div className="border-b border-border bg-background">
      <div className="px-4 py-2.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && !run.isPending) run.mutate();
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask or tell me to do something..."
            className="h-9 text-sm"
            aria-label="Command bar"
          />
          <Button type="submit" size="sm" className="h-9 px-3 text-xs" disabled={run.isPending || !text.trim()}>
            {run.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run"}
          </Button>
          {(result || error) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-9 px-2 text-xs text-muted-foreground"
              onClick={dismissAll}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </form>

        {run.isPending && (
          <div className="mt-2 text-xs text-muted-foreground">Working on it…</div>
        )}

        {error && !run.isPending && (
          <div className="mt-2 rounded-md border border-border px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {!run.isPending && result?.intent === "unknown" && (
          <div className="mt-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
            {result.clarification}
          </div>
        )}

        {!run.isPending && result?.intent === "search_speakers" && (
          <div className="mt-2 rounded-md border border-border">
            {(result.speakers ?? []).length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No speakers matched.</div>
            ) : (
              <ul className="divide-y divide-border">
                {result.speakers.map((s: any) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setOpenSpeaker(s)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-accent"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-foreground">{s.name}</span>
                        {s.events?.code ? (
                          <span className="ml-2 text-muted-foreground">{s.events.code}</span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
                        {missingLabel(s) && <span>{missingLabel(s)}</span>}
                        <span>{s.status}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!run.isPending && result?.intent === "scan_gmail_for_event" && (
          <div className="mt-2 rounded-md border border-border">
            {result.connected === false ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Gmail isn't connected.</div>
            ) : suggestions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No new people found in Gmail for {result.event?.name}.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {suggestions.map((s) => (
                  <li key={s.thread_id + s.email} className="px-3 py-2.5">
                    <div className="text-xs font-medium text-foreground">
                      {s.name} <span className="font-normal text-muted-foreground">{s.email}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{s.subject}</div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{s.snippet}</div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-7 px-3 text-xs"
                        disabled={add.isPending}
                        onClick={() => add.mutate(s)}
                      >
                        {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add to speaker board"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => setSuggestions((prev) => prev.filter((x) => x.email !== s.email))}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!run.isPending && result?.intent === "compose_message" && (
          <div className="mt-2 text-xs text-muted-foreground">
            Drafted using the same generator as Describe a message on the event page — review before
            sending.
          </div>
        )}
      </div>

      <SpeakerDetailDialog
        open={!!openSpeaker}
        onOpenChange={(o) => !o && setOpenSpeaker(null)}
        speaker={openSpeaker}
        event={
          openSpeaker?.events
            ? { id: openSpeaker.event_id, code: openSpeaker.events.code, name: openSpeaker.events.name }
            : null
        }
        onEdit={() => {}}
        onEmail={() => {}}
      />

      {result?.intent === "compose_message" && (
        <GenerateMessageDialog
          open={result?.intent === "compose_message"}
          onOpenChange={(v) => !v && dismissAll()}
          template={{
            id: null,
            name: result.draft.name,
            stream: result.draft.stream,
            typical_weeks: result.draft.typical_weeks,
            event_format: result.draft.event_format,
            subject: result.draft.subject,
            body_markdown: result.draft.body_markdown,
          } as DraftTemplate}
          event={result.event}
          userFirstName={sender.data?.firstName ?? "Team"}
        />
      )}
    </div>
  );
}
