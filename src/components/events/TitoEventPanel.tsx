import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, LinkIcon, Sparkles, UserPlus, Link2, Users } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  eventReleasesQuery,
  eventReconciliationQuery,
} from "@/lib/queries";
import {
  syncEventFromTito,
  linkSpeakerToTicket,
  backfillSpeakerFromTicket,
} from "@/lib/tito.functions";

export function TitoEventPanel({ eventId, hasTitoSlug }: { eventId: string; hasTitoSlug: boolean }) {
  const qc = useQueryClient();
  const releases = useQuery({ ...eventReleasesQuery(eventId), enabled: hasTitoSlug });
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
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

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

        {(releases.data?.length ?? 0) > 0 && (
          <details className="mt-4">
            <summary className="text-xs text-muted-foreground cursor-pointer">
              All releases ({releases.data?.length})
            </summary>
            <div className="mt-2 space-y-1">
              {releases.data?.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                  <span>{r.title} {r.state ? <span className="text-muted-foreground">· {r.state}</span> : null}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {typeof r.tickets_count === "number" ? `${r.tickets_count} sold` : "-"}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </Card>

      {recon.data && (
        <Card className="p-5 rounded-2xl border-slate-200/70">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-indigo-600" /> Reconciliation
          </h2>

          <ReconGroup
            title="Confirmed but not registered on Tito"
            help="These confirmed speakers have no Speaker Pass / Speaker Guest ticket. Nudge them to register."
            count={recon.data.needsRegistration.length}
          >
            {recon.data.needsRegistration.map((s: any) => (
              <RowLine key={s.id}
                left={<>
                  <div className="font-medium text-sm">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.email ?? "no email"}</div>
                </>}
                right={
                  links?.speaker_pass_link ? (
                    <Button size="sm" variant="outline" onClick={() => copy(links.speaker_pass_link!, "Speaker Pass link")}>
                      <Copy className="h-3 w-3 mr-1" /> Copy link
                    </Button>
                  ) : null
                }
              />
            ))}
          </ReconGroup>

          <ReconGroup
            title="Speaker Pass/Guest holders not in tracker"
            help="They registered on Tito but aren't in your speaker list. Backfill with one click."
            count={recon.data.notInTracker.length}
          >
            {recon.data.notInTracker.map((t: any) => {
              const label = t.name ?? [t.first_name, t.last_name].filter(Boolean).join(" ");
              return (
                <RowLine key={t.id}
                  left={<>
                    <div className="font-medium text-sm">{label}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.email ?? "-"} · {t.release_title ?? "-"}
                    </div>
                  </>}
                  right={
                    <Button size="sm" variant="outline"
                      onClick={() => backfillMut.mutate(t.id)}
                      disabled={backfillMut.isPending}
                    >
                      <UserPlus className="h-3 w-3 mr-1" /> Add to tracker
                    </Button>
                  }
                />
              );
            })}
          </ReconGroup>

          <ReconGroup
            title="Likely matches (different email)"
            help="Same name, different email. Confirm to link the tracker speaker to the Tito ticket."
            count={recon.data.likelyMatches.length}
          >
            {recon.data.likelyMatches.map((m: any) => (
              <RowLine key={`${m.speaker.id}-${m.ticket.id}`}
                left={<>
                  <div className="font-medium text-sm">{m.speaker.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Tracker: {m.speaker.email ?? "-"} · Tito: {m.ticket.email ?? "-"} · {(m.score * 100).toFixed(0)}% match
                  </div>
                </>}
                right={
                  <Button size="sm" variant="outline"
                    onClick={() => linkMut.mutate({ speaker_id: m.speaker.id, ticket_id: m.ticket.id })}
                    disabled={linkMut.isPending}
                  >
                    <LinkIcon className="h-3 w-3 mr-1" /> Confirm link
                  </Button>
                }
              />
            ))}
          </ReconGroup>

          {recon.data.unreachable.length > 0 && (
            <ReconGroup
              title="Confirmed speakers with no email"
              help="Can't be reconciled or emailed. Add an email in the speaker record."
              count={recon.data.unreachable.length}
            >
              {recon.data.unreachable.map((s: any) => (
                <RowLine key={s.id}
                  left={<div className="font-medium text-sm">{s.name}</div>}
                  right={null}
                />
              ))}
            </ReconGroup>
          )}
        </Card>
      )}
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

function ReconGroup({ title, help, count, children }: { title: string; help: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(count > 0 && count <= 5);
  return (
    <div className="border-t border-slate-100 pt-3 mt-3 first:border-0 first:mt-0 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <div className="text-sm font-medium">{title} <span className="text-muted-foreground">({count})</span></div>
          <div className="text-xs text-muted-foreground">{help}</div>
        </div>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open && count > 0 && <div className="mt-2 space-y-1">{children}</div>}
    </div>
  );
}

function RowLine({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg hover:bg-slate-50">
      <div className="min-w-0 flex-1">{left}</div>
      {right}
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
