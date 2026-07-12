import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Reply, Clock, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { speakersQuery } from "@/lib/queries";
import { daysBetween } from "@/lib/status";

export function NeedsAttentionWidget() {
  const { data } = useQuery(speakersQuery());
  const speakers = data ?? [];
  const now = new Date();

  let replyNeeded = 0;
  let followUp = 0;
  for (const s of speakers as any[]) {
    if (s.status !== "contacted" && s.status !== "responded") continue;
    if (!s.last_message_at) continue;
    const days = daysBetween(new Date(s.last_message_at), now);
    if (days === null) continue;
    if (s.last_message_direction === "inbound" && days > 2) replyNeeded++;
    else if (s.last_message_direction === "outbound" && days > 7) followUp++;
  }

  const clear = replyNeeded === 0 && followUp === 0;

  return (
    <Card className="p-5 h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Needs attention
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">Speaker outreach SLAs</div>
        </div>
      </div>

      {clear ? (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 px-3 py-4">
          <CheckCircle2 className="h-5 w-5" />
          <div className="text-sm font-medium">You're all caught up</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/speakers"
            search={{ attention: "reply" as const }}
            className="group"
          >
            <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-3 transition-all hover:shadow-md hover:-translate-y-0.5 hover:ring-rose-300">
              <div className="flex items-center gap-1.5 text-rose-700 text-xs font-medium">
                <Reply className="h-3.5 w-3.5" /> Reply needed
              </div>
              <div className="mt-1 text-2xl font-semibold text-rose-800 tabular-nums">
                {replyNeeded}
              </div>
              <div className="text-[11px] text-rose-600/80 mt-0.5">
                {replyNeeded === 1 ? "speaker needs a reply" : "speakers need a reply"}
              </div>
            </div>
          </Link>
          <Link
            to="/speakers"
            search={{ attention: "follow_up" as const }}
            className="group"
          >
            <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-3 transition-all hover:shadow-md hover:-translate-y-0.5 hover:ring-amber-300">
              <div className="flex items-center gap-1.5 text-amber-800 text-xs font-medium">
                <Clock className="h-3.5 w-3.5" /> Follow-up
              </div>
              <div className="mt-1 text-2xl font-semibold text-amber-900 tabular-nums">
                {followUp}
              </div>
              <div className="text-[11px] text-amber-700/80 mt-0.5">
                {followUp === 1 ? "speaker needs a follow-up" : "speakers need a follow-up"}
              </div>
            </div>
          </Link>
        </div>
      )}
    </Card>
  );
}
