import { HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Small "?" affordance next to a page title. Opens a short, plain-language
 * explainer so a first-time user understands what the page is for.
 */
export function PageHelp({
  title,
  what,
  steps,
}: {
  title: string;
  what: string;
  steps?: string[];
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`How ${title} works`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground align-middle transition-colors hover:bg-accent hover:text-foreground"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          How this works
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-4">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {what}
        </p>
        {steps && steps.length > 0 && (
          <ol className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        )}
      </PopoverContent>
    </Popover>
  );
}
