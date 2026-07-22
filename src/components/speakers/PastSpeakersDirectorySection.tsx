import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Tag, Settings, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { pastSpeakersQuery, eventsQuery } from "@/lib/queries";
import {
  tagDirectoryForEvent,
  listTitoEventsAdmin,
  updateTitoEventBusinessLine,
} from "@/lib/directory.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function PastSpeakersDirectorySection() {
  const [includeAttendees, setIncludeAttendees] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [tagOpen, setTagOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const dirQ = useQuery(pastSpeakersQuery(includeAttendees));
  const rows = dirQ.data ?? [];

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = rows;
    if (!term) return base;
    // Multi-term AND across name/company/email
    const terms = term.split(/\s+/).filter(Boolean);
    return base.filter((p) => {
      const hay = `${p.name} ${p.company ?? ""} ${p.email} ${p.job_title ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [rows, q]);

  const selectedRows = filtered.filter((p) => selected[p.key]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="accent-bar mb-2" />
          <h2 className="text-sm font-semibold">
            Past speakers directory{" "}
            <span className="text-muted-foreground">({rows.length})</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Everyone who held a Speaker Pass or was confirmed at a past AIAI/CSC event.
            Use this to re-recruit for future events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer px-2 py-1 rounded-md hover:bg-muted/60">
            <Checkbox
              checked={includeAttendees}
              onCheckedChange={(v) => setIncludeAttendees(!!v)}
            />
            Search all attendees
          </label>
          <Button variant="ghost" size="sm" onClick={() => setAdminOpen(true)} title="Manage event tags">
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 h-9"
          placeholder="Search name, company, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {selectedRows.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
          <div className="text-sm">
            {selectedRows.length} selected
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected({})}>Clear</Button>
            <Button size="sm" onClick={() => setTagOpen(true)}>
              <Tag className="h-3.5 w-3.5 mr-1.5" />
              Tag for event
            </Button>
          </div>
        </div>
      )}

      {dirQ.isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {q ? `No matches for "${q}".` : "No past speakers yet."}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.slice(0, 300).map((p) => (
            <Card key={p.key} className="p-4 rounded-2xl border-slate-200/70 shadow-sm">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={!!selected[p.key]}
                  onCheckedChange={(v) => setSelected({ ...selected, [p.key]: !!v })}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-sm truncate">{p.name}</div>
                    {p.is_past_speaker && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-200 bg-emerald-50 text-emerald-700">
                        Past speaker
                      </Badge>
                    )}
                    {p.possibleDuplicateOfKey && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-200 bg-amber-50 text-amber-800">
                        Possible duplicate
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[p.job_title, p.company].filter(Boolean).join(" · ") || p.email}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{p.email}</div>
                  {p.most_recent_past_speaker_event && (
                    <div className="mt-1.5 text-[11px] text-slate-600">
                      Last spoke at <span className="font-medium">{p.most_recent_past_speaker_event}</span>
                      {p.most_recent_past_speaker_at
                        ? ` · ${new Date(p.most_recent_past_speaker_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`
                        : ""}
                    </div>
                  )}
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {p.appearances.length} event{p.appearances.length === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <TagForEventDialog
        open={tagOpen}
        onOpenChange={setTagOpen}
        people={selectedRows.map((p) => ({
          name: p.name,
          email: p.email,
          company: p.company,
          title: p.job_title,
          past_event_name: p.most_recent_past_speaker_event,
        }))}
        onDone={() => {
          setSelected({});
          setTagOpen(false);
        }}
      />
      <ManageEventTagsDialog open={adminOpen} onOpenChange={setAdminOpen} />
    </section>
  );
}

function TagForEventDialog({
  open,
  onOpenChange,
  people,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  people: Array<{
    name: string;
    email: string;
    company: string | null;
    title: string | null;
    past_event_name: string | null;
  }>;
  onDone: () => void;
}) {
  const events = useQuery(eventsQuery);
  const [target, setTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const tag = useServerFn(tagDirectoryForEvent);
  const qc = useQueryClient();

  const options = (events.data ?? [])
    .filter((e) => {
      if (!e.event_date) return true;
      return new Date(e.event_date).getTime() >= Date.now();
    })
    .map((e) => ({ value: e.id, label: `${e.code} — ${e.name}` }));

  async function submit() {
    if (!target || people.length === 0) return;
    setBusy(true);
    try {
      const res = await tag({ data: { target_event_id: target, people } });
      await qc.invalidateQueries({ queryKey: ["speakers"] });
      toast.success(`Tagged ${res.inserted} · skipped ${res.skipped} already tracked`);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to tag");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tag {people.length} for event</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Each person will be added to that event's Prospective section with status New.
          </p>
          <SearchableSelect
            options={options}
            value={target}
            onChange={setTarget}
            placeholder="Select event…"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!target || busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Tag className="h-4 w-4 mr-1" />}
            Tag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageEventTagsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const list = useServerFn(listTitoEventsAdmin);
  const upd = useServerFn(updateTitoEventBusinessLine);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["titoEventsAdmin"], queryFn: () => list(), enabled: open });
  const [filter, setFilter] = useState<"AIAI" | "CSC" | "other" | "all">("all");

  const rows = (q.data ?? []).filter((r: any) => filter === "all" || r.business_line === filter);

  async function set(id: string, val: "AIAI" | "CSC" | "other") {
    await upd({ data: { id, business_line: val } });
    await qc.invalidateQueries({ queryKey: ["titoEventsAdmin"] });
    await qc.invalidateQueries({ queryKey: ["pastSpeakers"] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Manage event tags</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-3 flex gap-1.5">
          {(["all", "AIAI", "CSC", "other"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs",
                filter === k
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              {k === "all" ? "All" : k}
            </button>
          ))}
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-6 pb-6">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="py-2">Event</th>
                <th className="py-2">Start</th>
                <th className="py-2">Business line</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3">{r.title}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {r.start_date ? new Date(r.start_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2">
                    <div className="inline-flex rounded-md border border-slate-200">
                      {(["AIAI", "CSC", "other"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => set(r.id, v)}
                          className={cn(
                            "px-2 py-1 text-xs",
                            r.business_line === v
                              ? "bg-slate-900 text-white"
                              : "text-slate-600 hover:bg-slate-50",
                          )}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
