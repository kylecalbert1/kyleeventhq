import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Megaphone } from "lucide-react";
import { eventOutreachQuery } from "@/lib/queries";
import { OutreachHub } from "./OutreachHub";
import { cn } from "@/lib/utils";

export function OutreachKitCard({
  eventId,
  defaultOpen = false,
}: {
  eventId: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const q = useQuery(eventOutreachQuery(eventId));

  const o = q.data?.outreach;
  const templateCount = [
    o?.inmail_subject,
    o?.inmail_message,
    o?.connect_message,
    o?.colleague_slack,
    o?.colleague_linkedin,
  ].filter((s) => (s ?? "").trim().length > 0).length;
  const linkCount = (q.data?.searches ?? []).length;

  return (
    <section className="surface-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-accent/40 rounded-2xl"
      >
        <div className="flex items-center gap-3 min-w-0">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <Megaphone className="h-4 w-4 text-primary shrink-0" />
          <span className="text-[15px] font-semibold text-foreground">Outreach kit</span>
          <span className="text-[13px] text-muted-foreground truncate">
            LinkedIn templates & saved Sales Nav searches for this event
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold",
              templateCount === 0
                ? "bg-muted text-muted-foreground"
                : templateCount === 5
                  ? "bg-emerald-600 text-white"
                  : "bg-amber-500 text-white",
            )}
          >
            {templateCount}/5 templates
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold",
              linkCount === 0
                ? "bg-muted text-muted-foreground"
                : "bg-indigo-600 text-white",
            )}
          >
            {linkCount} saved {linkCount === 1 ? "search" : "searches"}
          </span>
        </div>
      </button>
      {open && (
        <div className="px-6 pb-6 pt-4 border-t border-border">
          <OutreachHub eventId={eventId} />
        </div>
      )}
    </section>
  );
}
