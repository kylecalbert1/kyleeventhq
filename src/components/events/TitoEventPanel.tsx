import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Sparkles,
  Users,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import { cn } from "@/lib/utils";
import { eventReconciliationQuery, eventReleasesQuery } from "@/lib/queries";
import { syncEventFromTito } from "@/lib/tito.functions";

type ReleaseRow = {
  id: string;
  title: string | null;
  quantity: number | null;
  tickets_count: number | null;
  registration_url: string | null;
};

type GroupKey = "speakers" | "sponsors" | "members" | "other" | "delegates";

const GROUP_LABEL: Record<GroupKey, string> = {
  delegates: "Delegates",
  speakers: "Speakers",
  sponsors: "Sponsors",
  members: "Members",
  other: "Other",
};

/** Classify a Tito release by its name. Case-insensitive, first match wins. */
export function classifyRelease(title: string | null | undefined): GroupKey {
  const t = (title ?? "").toLowerCase();
  if (t.includes("speaker")) return "speakers";
  if (t.includes("sponsor") || t.includes("client")) return "sponsors";
  if (t.includes("member")) return "members";
  if (t.includes("vendor") || t.includes("vip")) return "other";
  return "delegates";
}

export function TitoEventPanel({ eventId, hasTitoSlug }: { eventId: string; hasTitoSlug: boolean }) {
  const qc = useQueryClient();
  const recon = useQuery({ ...eventReconciliationQuery(eventId), enabled: hasTitoSlug });
  const releasesQ = useQuery({ ...eventReleasesQuery(eventId), enabled: hasTitoSlug });
  const sync = useServerFn(syncEventFromTito);
  const [showEmpty, setShowEmpty] = useState(false);

  const syncMut = useMutation({
    mutationFn: () => sync({ data: { event_id: eventId } }),
    onSuccess: (r: any) => {
      toast.success(`Synced: ${r.new} new · ${r.updated} updated · ${r.releases} releases`);
      qc.invalidateQueries({ queryKey: ["eventReleases", eventId] });
      qc.invalidateQueries({ queryKey: ["eventReconciliation", eventId] });
      qc.invalidateQueries({ queryKey: ["eventSummaries"] });
      qc.invalidateQueries({ queryKey: ["speakers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  // Auto-refresh Tito data on mount if last sync is older than 6 hours.
  const autoTriedRef = useRef(false);
  const lastSyncedAt = recon.data?.last_synced_at ?? null;
  useEffect(() => {
    if (!hasTitoSlug || autoTriedRef.current || recon.isLoading) return;
    const stale =
      !lastSyncedAt || Date.now() - new Date(lastSyncedAt).getTime() > 6 * 60 * 60 * 1000;
    if (stale && !syncMut.isPending) {
      autoTriedRef.current = true;
      syncMut.mutate();
    }
  }, [hasTitoSlug, lastSyncedAt, recon.isLoading, syncMut]);

  const staleInfo = useMemo(() => {
    if (!lastSyncedAt) return { label: "Never synced", stale: true };
    const ms = Date.now() - new Date(lastSyncedAt).getTime();
    const stale = ms > 6 * 60 * 60 * 1000;
    return { label: `Last synced ${relTime(ms)}`, stale };
  }, [lastSyncedAt]);

  const grouped = useMemo(() => {
    const rows = ((releasesQ.data ?? []) as ReleaseRow[]).map((r) => ({
      ...r,
      sold: r.tickets_count ?? 0,
      capacity: typeof r.quantity === "number" && r.quantity > 0 ? r.quantity : null,
      group: classifyRelease(r.title),
    }));
    const delegates = rows.filter((r) => r.group === "delegates");
    const primary =
      delegates.length > 0
        ? [...delegates].sort((a, b) => b.sold - a.sold)[0]
        : null;
    const groups = (["delegates", "speakers", "sponsors", "members", "other"] as GroupKey[])
      .map((key) => {
        const items = rows
          .filter((r) => r.group === key && r.id !== primary?.id)
          .sort((a, b) => b.sold - a.sold || (a.title ?? "").localeCompare(b.title ?? ""));
        return { key, items, total: items.reduce((n, r) => n + r.sold, 0) };
      })
      .filter((g) => g.items.length > 0);
    return { primary, groups };
  }, [releasesQ.data]);

  const links = recon.data?.links;

  if (!hasTitoSlug) {
    return (
      <Card className="p-5 rounded-2xl border-dashed border-slate-300 bg-slate-50/60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Tito not linked</div>
            <p className="text-xs text-muted-foreground mt-1">
              Link this event to a Tito event (Edit Event → Tito event) to see release
              links, registration counts and reconciliation.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 rounded-2xl border-slate-200/70">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold">Tito registrations</h2>
            {recon.data?.tito_slug && (
              <a
                href={`https://ti.to/sequel-media/${recon.data.tito_slug}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
              >
                {recon.data.tito_slug} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ring-1 ${
                staleInfo.stale
                  ? "bg-amber-50 text-amber-800 ring-amber-200"
                  : "bg-slate-50 text-slate-600 ring-slate-200"
              }`}
              title={lastSyncedAt ?? undefined}
            >
              {staleInfo.stale && <AlertTriangle className="h-3 w-3" />}
              {staleInfo.label}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              {syncMut.isPending ? "Syncing…" : "Sync from Tito"}
            </Button>
          </div>
        </div>

        {/* Headline: the primary delegate release for this event */}
        {grouped.primary && (
          <div className="mt-4 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-4 py-3.5">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div className="text-sm font-semibold text-slate-900">
                {grouped.primary.title ?? "Delegate pass"}
              </div>
              <div className="text-2xl font-semibold tabular-nums text-slate-900">
                {grouped.primary.sold}
                {grouped.primary.capacity !== null ? (
                  <span className="text-base font-medium text-slate-500">
                    {" "}
                    of {grouped.primary.capacity}
                  </span>
                ) : (
                  <span className="ml-2 text-xs font-medium text-slate-500">
                    sold · no capacity set in Tito
                  </span>
                )}
              </div>
            </div>
            {grouped.primary.capacity !== null && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-indigo-600"
                  style={{
                    width: `${Math.min(100, Math.round((grouped.primary.sold / grouped.primary.capacity) * 100))}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Grouped subtotals, expandable */}
        {grouped.groups.length > 0 && (
          <div className="mt-3 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {grouped.groups.map((g) => (
              <GroupRow key={g.key} label={GROUP_LABEL[g.key]} total={g.total} items={g.items} showEmpty={showEmpty} />
            ))}
          </div>
        )}

        {grouped.groups.length > 0 && (
          <button
            type="button"
            onClick={() => setShowEmpty((v) => !v)}
            className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            {showEmpty ? "Hide empty releases" : "Show empty releases"}
          </button>
        )}

        {(links?.speaker_pass_link || links?.guest_pass_link) && (
          <div className="mt-4 space-y-2">
            {links.speaker_pass_link && (
              <RegLinkRow label="Speaker Pass" url={links.speaker_pass_link} />
            )}
            {links.guest_pass_link && (
              <RegLinkRow label="Speaker Guest" url={links.guest_pass_link} />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function GroupRow({
  label,
  total,
  items,
  showEmpty,
}: {
  label: string;
  total: number;
  items: Array<{ id: string; title: string | null; sold: number; capacity: number | null }>;
  showEmpty: boolean;
}) {
  const [open, setOpen] = useState(false);
  const visible = showEmpty ? items : items.filter((r) => r.sold > 0);
  const hidden = items.length - visible.length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          )}
          {label}
        </span>
        <span className="inline-flex items-center gap-2">
          {!showEmpty && hidden > 0 && (
            <span className="text-[11px] text-slate-400">{hidden} empty hidden</span>
          )}
          <StatusPill className="bg-slate-100 text-slate-700 ring-slate-200 tabular-nums">
            {total} sold
          </StatusPill>
        </span>
      </button>
      {open && (
        <div className="px-4 pb-3">
          {visible.length === 0 ? (
            <div className="text-xs text-slate-400">Nothing sold in this group.</div>
          ) : (
            <div className="space-y-1.5">
              {visible.map((r) => {
                const full = r.capacity !== null && r.sold >= r.capacity;
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-slate-600">{r.title ?? "Release"}</span>
                    <StatusPill
                      className={cn(
                        "tabular-nums",
                        full
                          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                          : r.sold > 0
                            ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
                            : "bg-slate-50 text-slate-500 ring-slate-200",
                      )}
                    >
                      {r.capacity !== null ? `${r.sold} of ${r.capacity}` : `${r.sold} sold`}
                    </StatusPill>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RegLinkRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 w-32 shrink-0">{label}</div>
      <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary truncate hover:underline flex-1">
        {url}
      </a>
      <Button size="sm" variant="outline" onClick={() => copy(url, `${label} link`)}>
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}

async function copy(v: string, label: string) {
  try {
    await navigator.clipboard.writeText(v);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Couldn't copy");
  }
}

function relTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
