import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Link2, CheckCircle2, Circle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  createWebsiteTask,
  updateWebsiteTask,
  deleteWebsiteTask,
} from "@/lib/website-tasks.functions";
import { getAsanaProofingDueDates } from "@/lib/asana.functions";
import { eventsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

type WebsiteTask = {
  id: string;
  event_id: string;
  title: string | null;
  markup_url: string | null;
  status: "draft" | "proof_1" | "proof_2" | "amendments" | "signed_off" | "live";
  due_date: string | null;
  buddy_proof_done: boolean;
  buddy_proof_date: string | null;
  marketer_proof_done: boolean;
  marketer_proof_date: string | null;
  amendments_actioned_done: boolean;
  amendments_actioned_date: string | null;
  final_signoff_done: boolean;
  final_signoff_date: string | null;
  protected: boolean;
};

function deriveStatus(f: {
  buddy_proof_done: boolean;
  marketer_proof_done: boolean;
  amendments_actioned_done: boolean;
  final_signoff_done: boolean;
  status: WebsiteTask["status"];
}): WebsiteTask["status"] {
  if (f.status === "live") return "live";
  if (f.final_signoff_done) return "signed_off";
  if (f.amendments_actioned_done) return "amendments";
  if (f.marketer_proof_done) return "proof_2";
  if (f.buddy_proof_done) return "proof_1";
  return "draft";
}

export function WebsiteTaskFormDialog({
  open,
  onOpenChange,
  task,
  defaultEventId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: WebsiteTask;
  defaultEventId?: string;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createWebsiteTask);
  const update = useServerFn(updateWebsiteTask);
  const del = useServerFn(deleteWebsiteTask);
  const events = useQuery(eventsQuery);
  const fetchAsana = useServerFn(getAsanaProofingDueDates);
  const currentEventId = task?.event_id ?? defaultEventId;
  const asanaQuery = useQuery({
    queryKey: ["asanaProofingDues", currentEventId ?? "none"],
    queryFn: () => fetchAsana({ data: { event_id: currentEventId! } }),
    enabled: !!currentEventId && open,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  const asanaDues = asanaQuery.data?.dues;

  const [form, setForm] = useState({
    event_id: defaultEventId ?? "",
    title: "",
    markup_url: "",
    status: "draft" as WebsiteTask["status"],
    due_date: "",
    buddy_proof_done: false,
    buddy_proof_date: "",
    marketer_proof_done: false,
    marketer_proof_date: "",
    amendments_actioned_done: false,
    amendments_actioned_date: "",
    final_signoff_done: false,
    final_signoff_date: "",
    protected: false,
  });

  useEffect(() => {
    if (task) {
      setForm({
        event_id: task.event_id,
        title: task.title ?? "",
        markup_url: task.markup_url ?? "",
        status: task.status,
        due_date: task.due_date ?? "",
        buddy_proof_done: task.buddy_proof_done ?? false,
        buddy_proof_date: task.buddy_proof_date ?? "",
        marketer_proof_done: task.marketer_proof_done ?? false,
        marketer_proof_date: task.marketer_proof_date ?? "",
        amendments_actioned_done: task.amendments_actioned_done ?? false,
        amendments_actioned_date: task.amendments_actioned_date ?? "",
        final_signoff_done: task.final_signoff_done ?? false,
        final_signoff_date: task.final_signoff_date ?? "",
        protected: task.protected,
      });
    } else {
      setForm((f) => ({
        ...f,
        event_id: defaultEventId ?? f.event_id,
        title: "",
        markup_url: "",
        status: "draft",
        due_date: "",
        buddy_proof_done: false,
        buddy_proof_date: "",
        marketer_proof_done: false,
        marketer_proof_date: "",
        amendments_actioned_done: false,
        amendments_actioned_date: "",
        final_signoff_done: false,
        final_signoff_date: "",
        protected: false,
      }));
    }
  }, [task, open, defaultEventId]);

  const derivedStatus = useMemo(() => deriveStatus(form), [form]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        event_id: form.event_id,
        title: form.title.trim() || null,
        markup_url: form.markup_url.trim() || null,
        status: derivedStatus,
        due_date: form.due_date || null,
        buddy_proof_done: form.buddy_proof_done,
        buddy_proof_date: form.buddy_proof_done ? form.buddy_proof_date || null : null,
        marketer_proof_done: form.marketer_proof_done,
        marketer_proof_date: form.marketer_proof_done ? form.marketer_proof_date || null : null,
        amendments_actioned_done: form.amendments_actioned_done,
        amendments_actioned_date: form.amendments_actioned_done ? form.amendments_actioned_date || null : null,
        final_signoff_done: form.final_signoff_done,
        final_signoff_date: form.final_signoff_done ? form.final_signoff_date || null : null,
        protected: form.protected,
      };
      if (task) return update({ data: { id: task.id, patch: payload } });
      return create({ data: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["websiteTasks"] });
      toast.success(task ? "Task updated" : "Task added");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async () => (task ? del({ data: { id: task.id } }) : undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["websiteTasks"] });
      toast.success("Task deleted");
      onOpenChange(false);
    },
  });

  const hasMarkup = form.markup_url.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit website task" : "New website task"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="space-y-5"
        >
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-slate-500">Event</Label>
            <Select
              value={form.event_id}
              onValueChange={(v) => setForm({ ...form, event_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select event" />
              </SelectTrigger>
              <SelectContent>
                {(events.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} · {e.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-slate-500">Title (optional)</Label>
            <Input
              placeholder="e.g. Homepage refresh, Speaker page copy"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" /> Markup.io link
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://app.markup.io/w/thealliance/…"
                value={form.markup_url}
                onChange={(e) => setForm({ ...form, markup_url: e.target.value })}
              />
              {hasMarkup && (
                <a
                  href={form.markup_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Reuse the same link through every proofing round.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-slate-500">Proofing stages</Label>
              {asanaDues && (
                <span className="text-[10px] text-slate-500">Dates on right pulled live from Asana</span>
              )}
            </div>
            <StageRow
              label="1st website proof (buddy)"
              checked={form.buddy_proof_done}
              date={form.buddy_proof_date}
              asanaDue={asanaDues?.buddy_proof ?? null}
              onCheck={(v) =>
                setForm({
                  ...form,
                  buddy_proof_done: v,
                  buddy_proof_date: v && !form.buddy_proof_date
                    ? new Date().toISOString().slice(0, 10)
                    : form.buddy_proof_date,
                })
              }
              onDate={(v) => setForm({ ...form, buddy_proof_date: v })}
            />
            <StageRow
              label="2nd website proof (marketing)"
              checked={form.marketer_proof_done}
              date={form.marketer_proof_date}
              asanaDue={asanaDues?.marketer_proof ?? null}
              onCheck={(v) =>
                setForm({
                  ...form,
                  marketer_proof_done: v,
                  marketer_proof_date: v && !form.marketer_proof_date
                    ? new Date().toISOString().slice(0, 10)
                    : form.marketer_proof_date,
                })
              }
              onDate={(v) => setForm({ ...form, marketer_proof_date: v })}
            />
            <StageRow
              label="Marketing amendments actioned"
              checked={form.amendments_actioned_done}
              date={form.amendments_actioned_date}
              asanaDue={asanaDues?.amendments_actioned ?? null}
              onCheck={(v) =>
                setForm({
                  ...form,
                  amendments_actioned_done: v,
                  amendments_actioned_date: v && !form.amendments_actioned_date
                    ? new Date().toISOString().slice(0, 10)
                    : form.amendments_actioned_date,
                })
              }
              onDate={(v) => setForm({ ...form, amendments_actioned_date: v })}
            />
            <StageRow
              label="Final sign-off (line manager)"
              checked={form.final_signoff_done}
              date={form.final_signoff_date}
              asanaDue={asanaDues?.final_signoff ?? null}
              onCheck={(v) =>
                setForm({
                  ...form,
                  final_signoff_done: v,
                  final_signoff_date: v && !form.final_signoff_date
                    ? new Date().toISOString().slice(0, 10)
                    : form.final_signoff_date,
                })
              }
              onDate={(v) => setForm({ ...form, final_signoff_date: v })}
            />
          </div>


          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-slate-500">Due date</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-slate-500">Live?</Label>
              <label className="flex items-center gap-2 h-10 text-sm">
                <Checkbox
                  checked={form.status === "live"}
                  onCheckedChange={(v) =>
                    setForm({ ...form, status: v ? "live" : derivedStatus })
                  }
                />
                Page is live on site
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600">
            <Checkbox
              checked={form.protected}
              onCheckedChange={(v) => setForm({ ...form, protected: !!v })}
            />
            Protected (require confirmation before moving between stages)
          </label>

          <DialogFooter className="sm:justify-between">
            <div>
              {task && (
                <Button type="button" variant="destructive" onClick={() => remove.mutate()}>
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending || !form.event_id}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StageRow({
  label,
  checked,
  date,
  onCheck,
  onDate,
  asanaDue,
}: {
  label: string;
  checked: boolean;
  date: string | null;
  onCheck: (v: boolean) => void;
  onDate: (v: string) => void;
  asanaDue?: string | null;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
        checked ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white",
      )}
    >
      <button
        type="button"
        onClick={() => onCheck(!checked)}
        className="shrink-0"
        aria-label={label}
      >
        {checked ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        ) : (
          <Circle className="h-5 w-5 text-slate-300" />
        )}
      </button>
      <div className="flex-1 text-sm font-medium text-slate-700 min-w-0">
        <div className="truncate">{label}</div>
        {asanaDue && (
          <div className="text-[10px] font-normal text-slate-500">
            Asana due {new Date(asanaDue).toLocaleDateString()}
          </div>
        )}
      </div>
      <Input
        type="date"
        value={date ?? ""}
        onChange={(e) => onDate(e.target.value)}
        disabled={!checked}
        className="h-8 w-36 text-xs"
      />
    </div>
  );
}
