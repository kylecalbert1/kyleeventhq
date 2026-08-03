import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ChevronDown, X } from "lucide-react";

export function matchesTicketTypeFilters(
  releaseTitle: string | null | undefined,
  include: string[],
  exclude: string[],
): boolean {
  const rt = releaseTitle ?? "";
  if (exclude.length && exclude.includes(rt)) return false;
  if (include.length && !include.includes(rt)) return false;
  return true;
}

function MultiSelect({
  label,
  tone,
  options,
  value,
  onChange,
  hint,
  placeholder,
  onClearPersisted,
}: {
  label: string;
  tone: "emerald" | "rose";
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  hint: string;
  placeholder: string;
  onClearPersisted?: () => void;
}) {
  const toneText = tone === "emerald" ? "text-emerald-700" : "text-rose-700";
  const badge =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : "bg-rose-50 text-rose-700 ring-rose-200";

  const allSelected = options.length > 0 && options.every((o) => value.includes(o));

  function toggle(opt: string, on: boolean) {
    onChange(on ? [...value, opt] : value.filter((v) => v !== opt));
  }

  return (
    <div>
      <div
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wider mb-1 flex items-center",
          toneText,
        )}
      >
        {label}
        {value.length > 0 && (
          <span
            className={cn(
              "ml-1.5 rounded-full ring-1 ring-inset px-1.5 py-0.5 text-[10px] font-medium",
              badge,
            )}
          >
            {value.length}
          </span>
        )}
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onChange([]);
              onClearPersisted?.();
            }}
            className="ml-auto inline-flex items-center gap-1 normal-case tracking-normal text-[10px] font-medium text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-9 w-full justify-between font-normal"
          >
            <span className="truncate text-left">
              {value.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                value.join(", ")
              )}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          {options.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
              <span className="text-[11px] text-muted-foreground">
                {value.length} of {options.length} selected
              </span>
              <button
                type="button"
                onClick={() =>
                  allSelected ? onChange([]) : onChange([...options])
                }
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            </div>
          )}
          <div className="max-h-72 overflow-y-auto overscroll-contain">
            <div className="p-2 space-y-1">
              {options.length === 0 && (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  No ticket types found for this event.
                </p>
              )}
              {options.map((opt) => (
                <label
                  key={opt}
                  className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 cursor-pointer"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={value.includes(opt)}
                    onCheckedChange={(v) => toggle(opt, !!v)}
                  />
                  <span className="leading-snug">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

export function TicketTypeFilter({
  options,
  include,
  exclude,
  onIncludeChange,
  onExcludeChange,
  onClearPersistedExcludes,
  className,
}: {
  options: string[];
  include: string[];
  exclude: string[];
  onIncludeChange: (v: string[]) => void;
  onExcludeChange: (v: string[]) => void;
  onClearPersistedExcludes?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-3", className)}>
      <MultiSelect
        label="Include ticket types"
        tone="emerald"
        options={options}
        value={include}
        onChange={onIncludeChange}
        placeholder="All ticket types"
        hint="Per-event only, not saved. Empty = allow all."
      />
      <MultiSelect
        label="Exclude ticket types"
        tone="rose"
        options={options}
        value={exclude}
        onChange={onExcludeChange}
        onClearPersisted={onClearPersistedExcludes}
        placeholder="Nothing excluded"
        hint="Saved across every Tito event. Exclude wins over include."
      />
    </div>
  );
}
