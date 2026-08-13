import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Columns3, Loader2, RefreshCw, ExternalLink, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import { toast } from "sonner";
import {
  ensureEventBoard,
  getEventBoardSummary,
  refreshBoardFromAsana,
} from "@/lib/boards.functions";

function fmt(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Event-page entry point to the speaker board. The board — not the in-app
 * speaker list — is the source of truth for who's confirmed vs prospective,
 * and it can be re-pulled from its saved Asana link on demand.
 */
export function EventSpeakerBoardCard({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const ensure = useServerFn(ensureEventBoard);
  const refresh = useServerFn(refreshBoardFromAsana);

  const summary = useQuery({
    queryKey: ["eventBoardSummary", eventId],
    queryFn: () => getEventBoardSummary({ data: { event_id: eventId } }),
  });
  const board = summary.data?.board as any;
  const linked = Boolean(board?.asana_project_gid);

  const open = useMutation({
    mutationFn: async () => (board ? board : await ensure({ data: { event_id: eventId } })),
    onSuccess: (b: any) => navigate({ to: "/boards/$boardId", params: { boardId: b.id } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't open board"),
  });

  const sync = useMutation({
    mutationFn: () => refresh({ data: { board_id: board.id } }),
    onSuccess: (r: any) => {
      toast.success(`Synced from Asana — ${r.created} new, ${r.matched} updated`);
      qc.invalidateQueries({ queryKey: ["eventBoardSummary", eventId] });
      qc.invalidateQueries({ queryKey: ["speakers", eventId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  return (
    <Card className="p-6 rounded-2xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Columns3 className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">
              Speaker board {linked && <span className="text-muted-foreground font-normal">(synced from Asana)</span>}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
            This board is the current truth for who's confirmed vs prospective for this event.
            {linked
              ? ` Last refreshed from Asana ${fmt(board.asana_last_synced_at) ?? "— never"}.`
              : " Link an Asana board once from the board view to keep it in sync."}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <StatusPill className="bg-emerald-600 text-white ring-emerald-600 font-semibold">
              {summary.data?.confirmed ?? 0} confirmed
            </StatusPill>
            <StatusPill className="bg-sky-600 text-white ring-sky-600 font-semibold">
              {summary.data?.prospective ?? 0} prospective
            </StatusPill>
            {(summary.data?.declined ?? 0) > 0 && (
              <StatusPill className="bg-slate-200 text-slate-700 ring-slate-200">
                {summary.data?.declined} declined
              </StatusPill>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {linked && board?.asana_project_url && (
            <a
              href={board.asana_project_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open in Asana
            </a>
          )}
          {linked && (
            <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
              {sync.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1.5" />
              )}
              Refresh from Asana
            </Button>
          )}
          <Button onClick={() => open.mutate()} disabled={open.isPending}>
            {open.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4 mr-1.5" />
            )}
            Open board
          </Button>
        </div>
      </div>
    </Card>
  );
}
