import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, Sparkles, Users, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { eventReconciliationQuery } from "@/lib/queries";
import {
  syncEventFromTito,
  linkSpeakerToTicket,
  backfillSpeakerFromTicket,
} from "@/lib/tito.functions";

export function TitoEventPanel({ eventId, hasTitoSlug }: { eventId: string; hasTitoSlug: boolean }) {
  const qc = useQueryClient();
  const recon = useQuery({ ...eventReconciliationQuery(eventId), enabled: hasTitoSlug });
  const sync = useServerFn(syncEventFromTito);
  const link = useServerFn(linkSpeakerToTicket);
  const backfill = useServerFn(backfillSpeakerFromTicket);

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

  const linkMut = useMutation({
    mutationFn: (v: { speaker_id: string; ticket_id: string }) => link({ data: v }),
    onSuccess: () => {
      toast.success("Linked");
      qc.invalidateQueries({ queryKey: ["eventReconciliation", eventId] });
      qc.invalidateQueries({ queryKey: ["speakers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const backfillMut = useMutation({
    mutationFn: (ticket_id: string) => backfill({ data: { event_id: eventId, ticket_id } }),
    onSuccess: () => {
      toast.success("Added to tracker");
      qc.invalidateQueries({ queryKey: ["eventReconciliation", eventId] });
      qc.invalidateQueries({ queryKey: ["speakers"] });
      qc.invalidateQueries({ queryKey: ["eventSummaries"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const links = recon.data?.links;
  const breakdown = recon.data?.breakdown;

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

        {breakdown && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Speaker pass" value={breakdown.speakerPass} tone="emerald" />
            <Stat label="Speaker guest" value={breakdown.speakerGuest} tone="sky" />
            <Stat label="Delegates" value={breakdown.delegate} tone="slate" />
            <Stat
              label={`Confirmed ${recon.data?.speaker_target ? `/ target ${recon.data.speaker_target}` : ""}`}
              value={recon.data?.confirmed_count ?? 0}
              tone="amber"
            />
          </div>
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

      {/* Reconciliation panel removed from the event detail page (too noisy).
          The underlying reconciliation query/mutations stay intact and are still
          used for the "Registered / Not yet registered" speaker filters. */}

    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "sky" | "slate" | "amber" }) {
  const cls = {
    emerald: "bg-emerald-50 text-emerald-900 ring-emerald-200",
    sky: "bg-sky-50 text-sky-900 ring-sky-200",
    slate: "bg-slate-50 text-slate-900 ring-slate-200",
    amber: "bg-amber-50 text-amber-900 ring-amber-200",
  }[tone];
  return (
    <div className={`rounded-xl ring-1 ${cls} px-3 py-2`}>
      <div className="text-[11px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
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
