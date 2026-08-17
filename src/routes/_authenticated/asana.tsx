import { PageHelp } from "@/components/PageHelp";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, ExternalLink, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { asanaTasksQuery, eventsQuery } from "@/lib/queries";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/asana")({
  head: () => ({
    meta: [
      { title: "Asana tasks · Event Command Centre" },
      { name: "description", content: "Synced Asana milestone tasks across all events with website filter and overdue highlighting." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    event: typeof s.event === "string" ? s.event : undefined,
    website: s.website === "false" ? false : true,
    hideDone: s.hideDone === "false" ? false : true,
  }),
  component: AsanaPage,
});

function isOverdue(iso: string | null, completed: boolean) {
  if (completed || !iso) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(iso) < today;
}
function fmtDate(iso: string | null) {
  if (!iso) return "no date";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function AsanaPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const events = useQuery(eventsQuery);
  const q = useQuery(
    asanaTasksQuery({
      event_id: search.event ?? null,
      website_only: search.website,
      hide_completed: search.hideDone,
    }),
  );


  const rows = (q.data ?? []) as any[];
  const eventOptions = useMemo(() => events.data ?? [], [events.data]);

  function setSearch(patch: Partial<typeof search>) {
    navigate({ search: { ...search, ...patch } as any, replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-8 space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-amber-500" />
              Asana tasks
            </h1>
            <PageHelp
              title={"Asana tasks"}
              what={"A read-only mirror of the milestone tasks in Asana (kick-off, proofs, launch), synced nightly. Nothing you do here writes back to Asana."}
              steps={[
                "Browse by event to see what’s due next.",
                "Use it as a reference while planning — edit the real task in Asana.",
                "Dates feed the kickoff/launch info shown elsewhere in the app.",
              ]}
            />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Read-only mirror of milestone tasks. Nightly sync at 07:00 UTC.
          </p>
        </div>

        <Card className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Event:</span>
            <Select
              value={search.event ?? "__all"}
              onValueChange={(v) => setSearch({ event: v === "__all" ? undefined : v })}
            >
              <SelectTrigger className="h-8 text-xs w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All events</SelectItem>
                {eventOptions.map((ev: any) => (
                  <SelectItem key={ev.id} value={ev.id}>
                    {ev.name} · {ev.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={search.website} onCheckedChange={(v) => setSearch({ website: !!v })} />
            Website tasks only
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={search.hideDone} onCheckedChange={(v) => setSearch({ hideDone: !!v })} />
            Hide completed
          </label>
        </Card>

        <Card className="divide-y">
          {rows.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500 italic">
              No tasks match. Try widening the filter.
            </div>
          )}
          {rows.map((t) => {
            const overdue = isOverdue(t.due_on, t.completed);
            const projectGid = t.events?.asana_project_gid;
            const url = projectGid ? `https://app.asana.com/0/${projectGid}/${t.asana_gid}` : null;
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                {t.completed ? (
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full border border-slate-300 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className={`text-sm truncate ${t.completed ? "line-through text-slate-400" : ""}`}>
                    {t.name}
                  </div>
                  {t.events && (
                    <Link
                      to="/events/$eventId"
                      params={{ eventId: t.event_id }}
                      className="text-[11px] text-slate-500 hover:text-slate-700"
                    >
                      {t.events.name} <span className="font-mono">· {t.events.code}</span>
                    </Link>
                  )}
                </div>
                <span
                  className={`text-xs tabular-nums shrink-0 ${
                    overdue ? "text-rose-600 font-semibold" : "text-slate-500"
                  }`}
                >
                  {fmtDate(t.due_on)}
                </span>
                {url && (
                  <a href={url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-700 shrink-0">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
