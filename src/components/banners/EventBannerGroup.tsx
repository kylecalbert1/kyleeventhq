import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import {
  BANNER_STATUSES,
  labels,
  pillClass,
  type BannerStatusVal,
} from "@/lib/status";
import {
  ExternalLink,
  FolderOpen,
  Building2,
  Pencil,
  Lock,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type BannerRow = {
  kind: "speaker" | "sponsor";
  id: string;
  event_id: string;
  name: string;
  banner_status: BannerStatusVal;
  linkedin_post_confirmed: boolean;
};

export function EventBannerGroup({
  event,
  rows,
  onPatchRow,
  onPatchEvent,
  compact,
}: {
  event: any;
  rows: BannerRow[];
  onPatchRow: (r: BannerRow, patch: any) => void;
  onPatchEvent: (patch: any) => void;
  /** When embedded inside another card (e.g. event detail tabs), drop the outer Card chrome. */
  compact?: boolean;
}) {
  const counts = BANNER_STATUSES.reduce<Record<BannerStatusVal, BannerRow[]>>(
    (acc, s) => ({ ...acc, [s]: rows.filter((r) => r.banner_status === s) }),
    {} as any,
  );

  const inner = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          {!compact && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {event.code}
              </span>
              <h2 className="text-lg font-semibold tracking-tight">{event.name}</h2>
            </div>
          )}
          <div className={cn("flex items-center gap-2", !compact && "mt-1.5")}>
            <ProgressBar
              sent={counts.sent.length + counts.confirmed_live.length}
              total={rows.length}
            />
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {counts.sent.length + counts.confirmed_live.length}/{rows.length} sent
            </span>
          </div>
        </div>

        <div className="min-w-[320px] flex-1 max-w-xl">
          <DropboxLinkField
            value={event.banner_dropbox_link ?? ""}
            onSave={(v) => onPatchEvent({ banner_dropbox_link: v || null })}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-md">
          No speakers or sponsors yet for this event.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BANNER_STATUSES.map((status) => (
            <BannerColumn
              key={status}
              status={status}
              rows={counts[status]}
              onPatchRow={onPatchRow}
            />
          ))}
        </div>
      )}
    </>
  );

  if (compact) return <div>{inner}</div>;

  return (
    <Card className="p-5 md:p-6 bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.05)]">
      {inner}
    </Card>
  );
}

function DropboxLinkField({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(!value);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
    setEditing(!value);
  }, [value]);

  const dirty = draft.trim() !== value;

  if (!editing && value) {
    return (
      <div>
        <label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
          <FolderOpen className="h-3.5 w-3.5" /> Shared Dropbox folder
        </label>
        <div className="flex items-center gap-2">
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-1.5 rounded-full bg-sky-50 hover:bg-sky-100 ring-1 ring-sky-200 px-3 py-1.5 text-xs font-medium text-sky-800 max-w-[300px] transition-colors"
            title={value}
          >
            <Lock className="h-3 w-3 shrink-0" />
            <span className="truncate">{prettyLink(value)}</span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-70 group-hover:opacity-100" />
          </a>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3 w-3 mr-1" /> Edit
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
        <FolderOpen className="h-3.5 w-3.5" /> Shared Dropbox folder (all banners)
      </label>
      <div className="flex gap-2">
        <Input
          className="h-9"
          placeholder="Paste one Dropbox folder URL for this event"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button
          size="sm"
          className="h-9"
          onClick={() => {
            onSave(draft.trim());
            if (draft.trim()) setEditing(false);
          }}
          disabled={!dirty && !!value}
        >
          <Check className="h-3.5 w-3.5 mr-1" /> Save
        </Button>
        {value && (
          <Button
            size="sm"
            variant="ghost"
            className="h-9"
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function prettyLink(url: string) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + u.pathname;
  } catch {
    return url;
  }
}

function BannerColumn({
  status,
  rows,
  onPatchRow,
}: {
  status: BannerStatusVal;
  rows: BannerRow[];
  onPatchRow: (r: BannerRow, patch: any) => void;
}) {
  return (
    <div className="bg-muted/40 rounded-lg p-3 min-h-[120px]">
      <div className="flex items-center justify-between mb-3">
        <StatusPill className={pillClass.banner[status]}>{labels.banner[status]}</StatusPill>
        <span className="text-xs text-muted-foreground font-medium">{rows.length}</span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <BannerCard key={`${r.kind}-${r.id}`} row={r} onPatch={(patch) => onPatchRow(r, patch)} />
        ))}
        {rows.length === 0 && (
          <div className="text-[11px] text-muted-foreground/70 italic px-1">-</div>
        )}
      </div>
    </div>
  );
}

function BannerCard({ row, onPatch }: { row: BannerRow; onPatch: (patch: any) => void }) {
  const initials = row.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const isSponsor = row.kind === "sponsor";
  const accentBorder = {
    not_started: "border-l-slate-300",
    created: "border-l-amber-400",
    sent: "border-l-sky-400",
    confirmed_live: "border-l-emerald-500",
  }[row.banner_status];
  return (
    <div
      className={cn(
        "bg-white border border-l-4 border-slate-200/70 rounded-xl p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_2px_8px_rgba(15,23,42,0.04)] hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_6px_16px_rgba(15,23,42,0.06)] transition-all",
        accentBorder,
      )}
    >
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ring-1",
            isSponsor
              ? "bg-violet-100 text-violet-700 ring-violet-200"
              : "bg-sky-100 text-sky-700 ring-sky-200",
          )}
          title={isSponsor ? "Sponsor" : "Speaker"}
        >
          {isSponsor ? <Building2 className="h-3.5 w-3.5" /> : initials || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate leading-tight">{row.name}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {row.kind}
          </div>
        </div>
      </div>
      <div className="mt-2">
        <Select
          value={row.banner_status}
          onValueChange={(v) => onPatch({ banner_status: v })}
        >
          <SelectTrigger
            className={cn(
              "h-7 text-xs px-2 w-full font-medium border-0 ring-1 focus:ring-2",
              pillClass.banner[row.banner_status],
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BANNER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {labels.banner[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
        <Checkbox
          className="h-3.5 w-3.5"
          checked={row.linkedin_post_confirmed}
          onCheckedChange={(v) => onPatch({ linkedin_post_confirmed: !!v })}
        />
        LinkedIn post
      </label>
    </div>
  );
}

function ProgressBar({ sent, total }: { sent: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((sent / total) * 100);
  return (
    <div className="h-1.5 w-32 rounded-full bg-muted overflow-hidden">
      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
