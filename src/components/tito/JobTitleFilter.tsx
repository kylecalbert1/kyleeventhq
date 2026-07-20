import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function parseKeywordList(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function matchesJobTitleFilters(
  jobTitle: string | null | undefined,
  include: string[],
  exclude: string[],
): boolean {
  const jt = (jobTitle ?? "").toLowerCase();
  if (exclude.length && exclude.some((k) => jt.includes(k))) return false;
  if (include.length) {
    if (!jt) return false;
    if (!include.some((k) => jt.includes(k))) return false;
  }
  return true;
}

export function JobTitleFilter({
  includeText,
  excludeText,
  onIncludeChange,
  onExcludeChange,
  className,
}: {
  includeText: string;
  excludeText: string;
  onIncludeChange: (v: string) => void;
  onExcludeChange: (v: string) => void;
  className?: string;
}) {
  const inc = parseKeywordList(includeText);
  const exc = parseKeywordList(excludeText);
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-3", className)}>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-1">
          Include job titles containing
          {inc.length > 0 && (
            <span className="ml-1.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 px-1.5 py-0.5 text-[10px] font-medium">
              {inc.length}
            </span>
          )}
        </div>
        <Input
          value={includeText}
          onChange={(e) => onIncludeChange(e.target.value)}
          placeholder="e.g. Director, CCO, VP Customer"
          className="h-9"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Comma or newline separated. Case-insensitive substring match. Empty = allow all.
        </p>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-700 mb-1">
          Exclude job titles containing
          {exc.length > 0 && (
            <span className="ml-1.5 rounded-full bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 px-1.5 py-0.5 text-[10px] font-medium">
              {exc.length}
            </span>
          )}
        </div>
        <Input
          value={excludeText}
          onChange={(e) => onExcludeChange(e.target.value)}
          placeholder="e.g. intern, student, analyst"
          className="h-9"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Any match here hides the attendee.
        </p>
      </div>
    </div>
  );
}
