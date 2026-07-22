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
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <Megaphone className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground">Outreach kit</span>
          <span className="text-xs text-muted-foreground truncate">
            LinkedIn templates & saved Sales Nav searches for this event
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "chip-neutral",
              templateCount === 0 && "opacity-50",
            )}
          >
            {templateCount}/5 templates
          </span>
          <span
            className={cn(
              "chip-neutral",
              linkCount === 0 && "opacity-50",
            )}
          >
            {linkCount} saved {linkCount === 1 ? "search" : "searches"}
          </span>
        </div>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-border">
          <OutreachHub eventId={eventId} />
        </div>
      )}
    </section>
  );
}
