import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createWebsiteTask, updateWebsiteTask, deleteWebsiteTask } from "@/lib/website-tasks.functions";
import { WEBSITE_STAGES, WEBSITE_TASK_TYPES, labels } from "@/lib/status";
import { eventsQuery } from "@/lib/queries";

type WebsiteTask = {
  id: string;
  event_id: string;
  task_type: "proof_1" | "proof_2" | "final_signoff" | "launch" | "audit" | "refresh";
  status: "draft" | "proof_1" | "proof_2" | "signed_off" | "live";
  due_date: string | null;
  assignee: string | null;
  protected: boolean;
};

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

  const [form, setForm] = useState({
    event_id: defaultEventId ?? "",
    task_type: "proof_1" as WebsiteTask["task_type"],
    status: "draft" as WebsiteTask["status"],
    due_date: "",
    assignee: "",
    protected: false,
  });

  useEffect(() => {
    if (task) {
      setForm({
        event_id: task.event_id,
        task_type: task.task_type,
        status: task.status,
        due_date: task.due_date ?? "",
        assignee: task.assignee ?? "",
        protected: task.protected,
      });
    } else {
      setForm((f) => ({ ...f, event_id: defaultEventId ?? f.event_id, due_date: "", assignee: "", protected: false }));
    }
  }, [task, open, defaultEventId]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        event_id: form.event_id,
        task_type: form.task_type,
        status: form.status,
        due_date: form.due_date || null,
        assignee: form.assignee || null,
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
    mutationFn: async () => task ? del({ data: { id: task.id } }) : undefined,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["websiteTasks"] });
      toast.success("Task deleted");
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{task ? "Edit website task" : "New website task"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Event</Label>
            <Select value={form.event_id} onValueChange={(v) => setForm({ ...form, event_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
              <SelectContent>
                {(events.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Task type</Label>
              <Select value={form.task_type} onValueChange={(v) => setForm({ ...form, task_type: v as never })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{WEBSITE_TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{labels.websiteTaskType[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as never })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{WEBSITE_STAGES.map((s) => <SelectItem key={s} value={s}>{labels.website[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Due date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Assignee</Label><Input value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.protected} onCheckedChange={(v) => setForm({ ...form, protected: !!v })} />
            Protected (blocks bulk moves without confirmation)
          </label>
          <DialogFooter className="sm:justify-between">
            <div>{task && <Button type="button" variant="destructive" onClick={() => remove.mutate()}>Delete</Button>}</div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending || !form.event_id}>Save</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
