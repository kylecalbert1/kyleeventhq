import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { pillClass } from "@/lib/status";

type Summary = {
  event: {
    business_line: "AIAI" | "CSC";
    launch_date: string | null;
  };
  speakerCount: number;
  confirmedCount: number;
};

export function CapacityPanel({ summaries }: { summaries: Summary[] }) {
  const lines: Array<{ key: "AIAI" | "CSC"; name: string }> = [
    { key: "AIAI", name: "AI Accelerator Institute" },
    { key: "CSC", name: "Customer Success Collective" },
  ];

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return (
    <Card className="p-5">
      <div className="text-sm font-semibold mb-1">Workload by business line</div>
      <div className="text-xs text-muted-foreground mb-4">Active events in flight right now</div>
      <div className="grid grid-cols-2 gap-4">
        {lines.map((l) => {
          const items = summaries.filter((s) => s.event.business_line === l.key);
          const active = items.filter((s) => {
            if (!s.event.launch_date) return true;
            return new Date(s.event.launch_date) >= now;
          });
          const speakerTotal = active.reduce((n, s) => n + s.speakerCount, 0);
          const speakerOpen = active.reduce((n, s) => n + (s.speakerCount - s.confirmedCount), 0);
          return (
            <div key={l.key} className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-2">
                <StatusPill className={pillClass.businessLine[l.key]}>{l.key}</StatusPill>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{l.name}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Active" value={active.length} />
                <Stat label="Speakers open" value={speakerOpen} tone={speakerOpen > 0 ? "amber" : "green"} />
                <Stat label="Speakers total" value={speakerTotal} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "amber" | "green" }) {
  const color = tone === "amber" ? "text-amber-600" : tone === "green" ? "text-emerald-600" : "text-foreground";
  return (
    <div>
      <div className={`text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
