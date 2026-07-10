import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { OUTREACH_CHANNELS, labels, pillClass, type OutreachChannel } from "@/lib/status";

const barColor: Record<OutreachChannel, string> = {
  linkedin_connect: "bg-sky-500",
  group_message: "bg-violet-500",
  old_attendee_list: "bg-amber-500",
  warm_intro: "bg-emerald-500",
  cold_email: "bg-slate-400",
};

export function ChannelMixPanel({ speakers }: { speakers: Array<{ outreach_channel?: string | null }> }) {
  const counts: Record<OutreachChannel, number> = {
    linkedin_connect: 0,
    group_message: 0,
    old_attendee_list: 0,
    warm_intro: 0,
    cold_email: 0,
  };
  let tagged = 0;
  speakers.forEach((s) => {
    const c = s.outreach_channel as OutreachChannel | null | undefined;
    if (c && c in counts) {
      counts[c] += 1;
      tagged += 1;
    }
  });
  const untagged = speakers.length - tagged;
  const max = Math.max(1, ...Object.values(counts));

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold">Outreach channel mix</div>
          <div className="text-xs text-muted-foreground">
            {tagged} of {speakers.length} speakers tagged
            {untagged > 0 && ` · ${untagged} untagged`}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {OUTREACH_CHANNELS.map((c) => {
          const n = counts[c];
          const pct = (n / max) * 100;
          return (
            <div key={c} className="flex items-center gap-3">
              <div className="w-40 shrink-0">
                <StatusPill className={pillClass.outreachChannel[c]}>
                  {labels.outreachChannel[c]}
                </StatusPill>
              </div>
              <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${barColor[c]} transition-all`} style={{ width: `${pct}%` }} />
              </div>
              <div className="w-8 text-right text-sm tabular-nums font-medium">{n}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
