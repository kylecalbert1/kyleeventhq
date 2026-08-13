import { PageHelp } from "@/components/PageHelp";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { queryOptions } from "@tanstack/react-query";
import {
  MessageSquare,
  Check,
  Undo2,
  Inbox as InboxIcon,
  Mail,
  RefreshCw,
  Loader2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { WatchedSendersDialog, userSettingsQuery } from "@/components/dialogs/WatchedSendersDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { cn } from "@/lib/utils";
import {
  listSponsorMentions,
  setSponsorMentionActioned,
  scanSponsorMentions,
} from "@/lib/sponsor-inbox.functions";
import { eventsQuery } from "@/lib/queries";
import { openGmailThread, gmailThreadUrl } from "@/lib/gmail";

const mentionsQuery = queryOptions({
  queryKey: ["sponsorMentions"],
  queryFn: () => listSponsorMentions({ data: {} }),
});

export const Route = createFileRoute("/_authenticated/sponsor-inbox")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(mentionsQuery),
      context.queryClient.ensureQueryData(eventsQuery),
    ]),
  component: SponsorInboxPage,
});

function fmt(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SponsorInboxPage() {
  const qc = useQueryClient();
  const mentions = useQuery(mentionsQuery);
  const events = useQuery(eventsQuery);
  const setActioned = useServerFn(setSponsorMentionActioned);
  const [filter, setFilter] = useState<"unactioned" | "all">("unactioned");
  const [sendersOpen, setSendersOpen] = useState(false);
  const settings = useQuery(userSettingsQuery);
  const watchedCount = settings.data?.sponsor_watch_emails?.length ?? 0;
  const scanFn = useServerFn(scanSponsorMentions);

  const scanMutation = useMutation({
    mutationFn: () => scanFn({ data: { lookback_days: 14 } }),
    onSuccess: (r) => {
      if (!r.connected) {
        toast.error("Gmail is not connected");
        return;
      }
      if (r.watched === 0) {
        toast.error("Add at least one watched sender first");
        setSendersOpen(true);
        return;
      }
      toast.success(
        `Scanned ${r.scanned} thread${r.scanned === 1 ? "" : "s"} from ${r.watched} sender${r.watched === 1 ? "" : "s"} · ${r.created} new · ${r.updated} updated`,
      );
      qc.invalidateQueries({ queryKey: ["sponsorMentions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Scan failed"),
  });

  const eventById = useMemo(
    () => Object.fromEntries((events.data ?? []).map((e: any) => [e.id, e])),
    [events.data],
  );

  const mutate = useMutation({
    mutationFn: (v: { id: string; actioned: boolean }) => setActioned({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sponsorMentions"] }),
  });

  const rows = useMemo(() => {
    const all = mentions.data ?? [];
    if (filter === "unactioned") return all.filter((r: any) => !r.actioned);
    return all;
  }, [mentions.data, filter]);

  const unactionedCount = (mentions.data ?? []).filter((r: any) => !r.actioned).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <div className="accent-bar mb-3" />
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <InboxIcon className="h-6 w-6 text-indigo-600" />
            Sponsor Inbox
          </h1>
          <PageHelp
            title={"Sponsor inbox"}
            what={"Sponsor email threads you"ve been copied into, pulled from Gmail so they don"t get lost in your inbox."}
            steps={[
              "Add the senders worth watching under "Watched senders".",
              "Hit "Scan Gmail" to pull in recent threads from those senders.",
              "Assign a thread to an event and mark it handled when done.",
            ]}
          />
          <p className="text-sm text-muted-foreground mt-1">
            Sponsor email threads you've been looped into. Scan Gmail for new
            mentions from your watched senders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => setSendersOpen(true)}
          >
            <Users className="h-4 w-4 mr-1.5" />
            Watched senders ({watchedCount})
          </Button>
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
          >
            {scanMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            Scan Gmail
          </Button>
        </div>
      </header>

      <div className="flex justify-end">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <Button
            size="sm"
            variant={filter === "unactioned" ? "default" : "ghost"}
            onClick={() => setFilter("unactioned")}
          >
            Needs action ({unactionedCount})
          </Button>
          <Button
            size="sm"
            variant={filter === "all" ? "default" : "ghost"}
            onClick={() => setFilter("all")}
          >
            All
          </Button>
        </div>
      </div>

      <WatchedSendersDialog open={sendersOpen} onOpenChange={setSendersOpen} />

      {rows.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <Mail className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">
            {filter === "unactioned"
              ? "Inbox zero - nothing awaiting action."
              : "No sponsor mentions captured yet."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((m: any) => {
            const ev = m.event_id ? eventById[m.event_id] : null;
            return (
              <Card
                key={m.id}
                className={cn(
                  "p-4 transition-opacity",
                  m.actioned && "opacity-60 bg-muted/30",
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3
                        className={cn(
                          "text-sm font-semibold truncate",
                          m.actioned && "line-through text-muted-foreground",
                        )}
                      >
                        {m.subject || "(no subject)"}
                      </h3>
                      {ev?.code && (
                        <StatusPill className="bg-indigo-50 text-indigo-700 ring-indigo-200 text-[11px]">
                          {ev.code}
                        </StatusPill>
                      )}
                      {m.actioned && (
                        <StatusPill className="bg-emerald-100 text-emerald-800 ring-emerald-200 text-[11px]">
                          Actioned
                        </StatusPill>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-3">
                      <span>{m.sender_email ?? "unknown sender"}</span>
                      <span>{fmt(m.message_date)}</span>
                    </div>
                    {m.snippet && (
                      <p className="mt-2 text-sm text-slate-600 line-clamp-2">
                        {m.snippet}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {m.gmail_thread_id && (
                      <a
                        href={gmailThreadUrl(m.gmail_thread_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openGmailThread(m.gmail_thread_id);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 ring-1 ring-rose-200 transition-colors"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Open thread
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant={m.actioned ? "outline" : "default"}
                      onClick={() =>
                        mutate.mutate({ id: m.id, actioned: !m.actioned })
                      }
                      disabled={mutate.isPending}
                    >
                      {m.actioned ? (
                        <>
                          <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                          Reopen
                        </>
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5 mr-1.5" />
                          Mark actioned
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
}
