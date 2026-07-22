import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Reply, Clock, AtSign, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { replyQueueQuery } from "@/routes/_authenticated/reply-needed";

export function NeedsAttentionWidget() {
  const { data } = useQuery(replyQueueQuery);
  const rows = data?.rows ?? [];

  let replyNeeded = 0;
  let mentions = 0;
  let followUp = 0;
  for (const r of rows) {
    if (r.reason === "speaker_reply") replyNeeded++;
    else if (r.reason === "mention") mentions++;
    else if (r.reason === "follow_up") followUp++;
  }

  const clear = rows.length === 0;

  return (
    <Card className="p-5 h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Needs attention
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">Reply queue</div>
        </div>
      </div>

      {clear ? (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 px-3 py-4">
          <CheckCircle2 className="h-5 w-5" />
          <div className="text-sm font-medium">You're all caught up</div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Tile
            to="/reply-needed"
            search={{ filter: "speaker_reply" as const }}
            label="Reply needed"
            count={replyNeeded}
            icon={Reply}
            tone="rose"
          />
          <Tile
            to="/reply-needed"
            search={{ filter: "mention" as const }}
            label="Mentions"
            count={mentions}
            icon={AtSign}
            tone="indigo"
          />
          <Tile
            to="/reply-needed"
            search={{ filter: "follow_up" as const }}
            label="Follow up"
            count={followUp}
            icon={Clock}
            tone="amber"
          />
        </div>
      )}
    </Card>
  );
}

const TONES = {
  rose: {
    wrap: "bg-rose-50 ring-rose-200 hover:ring-rose-300",
    head: "text-rose-700",
    num: "text-rose-800",
  },
  indigo: {
    wrap: "bg-indigo-50 ring-indigo-200 hover:ring-indigo-300",
    head: "text-indigo-700",
    num: "text-indigo-800",
  },
  amber: {
    wrap: "bg-amber-50 ring-amber-200 hover:ring-amber-300",
    head: "text-amber-800",
    num: "text-amber-900",
  },
} as const;

function Tile({
  to,
  search,
  label,
  count,
  icon: Icon,
  tone,
}: {
  to: string;
  search: any;
  label: string;
  count: number;
  icon: typeof Reply;
  tone: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <Link to={to} search={search} className="group">
      <div className={`rounded-lg ring-1 px-3 py-3 transition-all hover:shadow-md hover:-translate-y-0.5 ${t.wrap}`}>
        <div className={`flex items-center gap-1.5 text-xs font-medium ${t.head}`}>
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${t.num}`}>
          {count}
        </div>
      </div>
    </Link>
  );
}
