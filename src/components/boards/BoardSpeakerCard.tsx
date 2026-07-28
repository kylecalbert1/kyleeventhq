import { Check, Copy } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { cn } from "@/lib/utils";
import { softCard, outreachAlert } from "@/components/speakers/SpeakerListCard";

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  new: { label: "Interest", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  contacted: { label: "Contacted", cls: "bg-sky-100 text-sky-800 ring-sky-200" },
  in_conversation: { label: "In conversation", cls: "bg-indigo-100 text-indigo-800 ring-indigo-200" },
  responded: { label: "Responded", cls: "bg-violet-100 text-violet-800 ring-violet-200" },
  confirmed: { label: "Confirmed", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  declined: { label: "Declined", cls: "bg-rose-100 text-rose-700 ring-rose-200" },
};

export function onSiteOf(s: any): boolean {
  return !!s?.bio_and_headshot_received;
}

/**
 * The quiet board card. Name, one muted role line, one status chip, an alert
 * chip only when action is genuinely needed, and — for confirmed/registered
 * people — two tiny ticks. Everything else lives in the detail dialog.
 */
export function BoardSpeakerCard({
  s,
  duplicate,
  onOpenDetail,
  onOpenDuplicate,
  onDragStart,
}: {
  s: any;
  duplicate?: boolean;
  onOpenDetail: () => void;
  onOpenDuplicate?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const chip = STATUS_CHIP[s.status as string] ?? STATUS_CHIP.new;
  const alert = outreachAlert(s);
  const showAlert = alert && (alert.type === "reply" || alert.type === "follow_up");
  const roleLine = [s.title, s.company].filter(Boolean).join(" at ");
  const showTicks = s.status === "confirmed";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", s.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.(e);
      }}
      onClick={onOpenDetail}
      className={cn(softCard, "p-3 cursor-pointer active:cursor-grabbing")}
    >
      <div className="text-sm font-semibold leading-tight truncate">{s.name}</div>
      {roleLine && (
        <div className="mt-0.5 text-xs text-muted-foreground truncate">{roleLine}</div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <StatusPill className={cn(chip.cls, "text-[10px]")}>{chip.label}</StatusPill>
        {showAlert && (
          <StatusPill className={cn(alert!.cls, "text-[10px]")}>
            {alert!.icon ? <alert!.icon className="h-3 w-3" /> : null}
            {alert!.label}
          </StatusPill>
        )}
        {duplicate && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDuplicate?.();
            }}
            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
          >
            <Copy className="h-3 w-3" />
            Possible duplicate
          </button>
        )}
      </div>

      {showTicks && (
        <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          <Tick on={onSiteOf(s)} label="On site" />
          <Tick on={!!s.in_tito} label="In Tito" />
        </div>
      )}
    </div>
  );
}

function Tick({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", on ? "text-emerald-700" : "text-slate-400")}>
      <span
        className={cn(
          "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border",
          on ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white",
        )}
      >
        {on && <Check className="h-2.5 w-2.5" />}
      </span>
      {label}
    </span>
  );
}
