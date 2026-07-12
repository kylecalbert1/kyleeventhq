import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createEvent, updateEvent, deleteEvent } from "@/lib/events.functions";
import { BUSINESS_LINES, EVENT_FORMATS, WEBSITE_STAGES, SELF_STATUSES, labels } from "@/lib/status";
import { qk } from "@/lib/queries";

type EventRow = {
  id: string;
  code: string;
  name: string;
  business_line: "AIAI" | "CSC";
  format: "in_person" | "virtual";
  event_date: string | null;
  venue: string | null;
  kickoff_date: string | null;
  washup_date: string | null;
  website_status: "draft" | "proof_1" | "proof_2" | "signed_off" | "live";
  launch_date: string | null;
  owner: string | null;
  proof1_due?: string | null;
  proof2_due?: string | null;
  final_signoff_due?: string | null;
  self_status?: "on_track" | "needs_attention" | "off_track";
  asana_project_gid?: string | null;
};

export function EventFormDialog({
  open,
  onOpenChange,
  event,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event?: EventRow;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createEvent);
  const update = useServerFn(updateEvent);
  const del = useServerFn(deleteEvent);

  const [form, setForm] = useState({
    code: "",
    name: "",
    business_line: "AIAI" as "AIAI" | "CSC",
    format: "in_person" as "in_person" | "virtual",
    event_date: "",
    venue: "",
    kickoff_date: "",
    washup_date: "",
    website_status: "draft" as EventRow["website_status"],
    launch_date: "",
    owner: "",
    proof1_due: "",
    proof2_due: "",
    final_signoff_due: "",
    self_status: "on_track" as "on_track" | "needs_attention" | "off_track",
    asana_link: "",
  });

  useEffect(() => {
    if (event) {
      setForm({
        code: event.code,
        name: event.name,
        business_line: event.business_line,
        format: event.format,
        event_date: event.event_date ?? "",
        venue: event.venue ?? "",
        kickoff_date: event.kickoff_date ?? "",
        washup_date: event.washup_date ?? "",
        website_status: event.website_status,
        launch_date: event.launch_date ?? "",
        owner: event.owner ?? "",
        proof1_due: event.proof1_due ?? "",
        proof2_due: event.proof2_due ?? "",
        final_signoff_due: event.final_signoff_due ?? "",
        self_status: event.self_status ?? "on_track",
        asana_link: event.asana_project_gid ?? "",
      });
    } else {
      setForm({
        code: "",
        name: "",
        business_line: "AIAI",
        format: "in_person",
        event_date: "",
        venue: "",
        kickoff_date: "",
        washup_date: "",
        website_status: "draft",
        launch_date: "",
        owner: "",
        proof1_due: "",
        proof2_due: "",
        final_signoff_due: "",
        self_status: "on_track",
        asana_link: "",
      });
    }
  }, [event, open]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        event_date: form.event_date || null,
        venue: form.venue || null,
        kickoff_date: form.kickoff_date || null,
        washup_date: form.washup_date || null,
        launch_date: form.launch_date || null,
        owner: form.owner || null,
        proof1_due: form.proof1_due || null,
        proof2_due: form.proof2_due || null,
        final_signoff_due: form.final_signoff_due || null,
      };
      if (event) return update({ data: { id: event.id, patch: payload } });
      return create({ data: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventSummaries() });
      qc.invalidateQueries({ queryKey: qk.events() });
      if (event) qc.invalidateQueries({ queryKey: qk.event(event.id) });
      toast.success(event ? "Event updated" : "Event created");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!event) return;
      return del({ data: { id: event.id } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventSummaries() });
      qc.invalidateQueries({ queryKey: qk.events() });
      toast.success("Event deleted");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "New event"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="grid grid-cols-2 gap-4"
        >
          <Field label="Code">
            <Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Name">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Business line">
            <Select value={form.business_line} onValueChange={(v) => setForm({ ...form, business_line: v as never })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUSINESS_LINES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Format">
            <Select value={form.format} onValueChange={(v) => setForm({ ...form, format: v as never })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_FORMATS.map((f) => <SelectItem key={f} value={f}>{labels.format[f]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Event date">
            <Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
          </Field>
          <Field label="Launch date">
            <Input type="date" value={form.launch_date} onChange={(e) => setForm({ ...form, launch_date: e.target.value })} />
          </Field>
          <Field label="Kickoff date">
            <Input type="date" value={form.kickoff_date} onChange={(e) => setForm({ ...form, kickoff_date: e.target.value })} />
          </Field>
          <Field label="Washup date">
            <Input type="date" value={form.washup_date} onChange={(e) => setForm({ ...form, washup_date: e.target.value })} />
          </Field>
          <Field label="Venue" full>
            <Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
          </Field>
          <Field label="Website status">
            <Select value={form.website_status} onValueChange={(v) => setForm({ ...form, website_status: v as never })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEBSITE_STAGES.map((s) => <SelectItem key={s} value={s}>{labels.website[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Owner">
            <Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
          </Field>
          <Field label="Self status">
            <Select value={form.self_status} onValueChange={(v) => setForm({ ...form, self_status: v as never })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SELF_STATUSES.map((s) => <SelectItem key={s} value={s}>{labels.selfStatus[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Proof 1 due">
            <Input type="date" value={form.proof1_due} onChange={(e) => setForm({ ...form, proof1_due: e.target.value })} />
          </Field>
          <Field label="Proof 2 due">
            <Input type="date" value={form.proof2_due} onChange={(e) => setForm({ ...form, proof2_due: e.target.value })} />
          </Field>
          <Field label="Final sign-off due" full>
            <Input type="date" value={form.final_signoff_due} onChange={(e) => setForm({ ...form, final_signoff_due: e.target.value })} />
          </Field>
          <DialogFooter className="col-span-2 flex justify-between sm:justify-between">
            <div>
              {event && (
                <Button type="button" variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
