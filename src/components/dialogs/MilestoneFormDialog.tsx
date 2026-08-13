import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createMilestone, updateMilestone, deleteMilestone } from "@/lib/milestones.functions";
import { MILESTONE_STATUSES, MILESTONE_TYPES, labels } from "@/lib/status";
import { eventsQuery } from "@/lib/queries";

type Milestone = {
  id: string;
  event_id: string;
  type: "kickoff" | "washup";
  scheduled_date: string | null;
  doc_link: string | null;
  recap_link: string | null;
  status: "scheduled" | "done";
  key_action_items: string | null;
};

export function MilestoneFormDialog({
  open,
  onOpenChange,
  milestone,
  defaultEventId,
  defaultType,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  milestone?: Milestone;
  defaultEventId?: string;
  defaultType?: "kickoff" | "washup";
}) {
  const qc = useQueryClient();
  const create = useServerFn(createMilestone);
  const update = useServerFn(updateMilestone);
  const del = useServerFn(deleteMilestone);
  const events = useQuery(eventsQuery);

  const [form, setForm] = useState({
    event_id: defaultEventId ?? "",
    type: (defaultType ?? "kickoff") as Milestone["type"],
    scheduled_date: "",
    doc_link: "",
    recap_link: "",
    status: "scheduled" as Milestone["status"],
    key_action_items: "",
  });

  useEffect(() => {
    if (milestone) {
      setForm({
        event_id: milestone.event_id,
        type: milestone.type,
        scheduled_date: milestone.scheduled_date ?? "",
        doc_link: milestone.doc_link ?? "",
        recap_link: milestone.recap_link ?? "",
        status: milestone.status,
        key_action_items: milestone.key_action_items ?? "",
      });
    } else {
      setForm((f) => ({ ...f, event_id: defaultEventId ?? f.event_id, type: defaultType ?? "kickoff" }));
    }
  }, [milestone, open, defaultEventId, defaultType]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        event_id: form.event_id,
        type: form.type,
        scheduled_date: form.scheduled_date || null,
        doc_link: form.doc_link || null,
        recap_link: form.recap_link || null,
        status: form.status,
        key_action_items: form.key_action_items || null,
      };
      if (milestone) return update({ data: { id: milestone.id, patch: payload } });
      return create({ data: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestones"] });
      qc.invalidateQueries({ queryKey: ["eventSummaries"] });
      toast.success(milestone ? "Milestone updated" : "Milestone added");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async () => milestone ? del({ data: { id: milestone.id } }) : undefined,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestones"] });
      qc.invalidateQueries({ queryKey: ["eventSummaries"] });
      toast.success("Milestone deleted");
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{milestone ? "Edit milestone" : "New milestone"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Event</Label>
            <Select value={form.event_id} onValueChange={(v) => setForm({ ...form, event_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
              <SelectContent>
                {(events.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name} · {e.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as never })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MILESTONE_TYPES.map((t) => <SelectItem key={t} value={t}>{labels.milestoneType[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as never })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MILESTONE_STATUSES.map((s) => <SelectItem key={s} value={s}>{labels.milestoneStatus[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Scheduled date</Label><Input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} /></div>
            <div className="space-y-1.5" />
            <div className="space-y-1.5 col-span-2"><Label className="text-xs">Doc link</Label><Input value={form.doc_link} onChange={(e) => setForm({ ...form, doc_link: e.target.value })} /></div>
            <div className="space-y-1.5 col-span-2"><Label className="text-xs">Recap link</Label><Input value={form.recap_link} onChange={(e) => setForm({ ...form, recap_link: e.target.value })} /></div>
            <div className="space-y-1.5 col-span-2"><Label className="text-xs">Key action items / takeaways</Label><Textarea rows={4} value={form.key_action_items} onChange={(e) => setForm({ ...form, key_action_items: e.target.value })} /></div>
          </div>
          <DialogFooter className="sm:justify-between">
            <div>{milestone && <Button type="button" variant="destructive" onClick={() => remove.mutate()}>Delete</Button>}</div>
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
