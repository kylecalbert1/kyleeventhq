import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createSpeaker, updateSpeaker, deleteSpeaker } from "@/lib/speakers.functions";
import { SPEAKER_STATUSES, BANNER_STATUSES, SESSION_FORMATS, labels } from "@/lib/status";
import { qk } from "@/lib/queries";
import { eventsQuery } from "@/lib/queries";

type Speaker = {
  id: string;
  event_id: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  status: "contacted" | "responded" | "confirmed" | "declined";
  session_title: string | null;
  session_format: "keynote" | "panel" | "workshop" | "fireside" | null;
  banner_status: "not_started" | "created" | "sent" | "confirmed_live";
  bio_received: boolean;
  headshot_received: boolean;
  linkedin_url: string | null;
  notes: string | null;
  dropbox_link: string | null;
  linkedin_post_confirmed: boolean;
};

export function SpeakerFormDialog({
  open,
  onOpenChange,
  speaker,
  defaultEventId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  speaker?: Speaker;
  defaultEventId?: string;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createSpeaker);
  const update = useServerFn(updateSpeaker);
  const del = useServerFn(deleteSpeaker);
  const events = useQuery(eventsQuery);

  const [form, setForm] = useState({
    event_id: defaultEventId ?? "",
    name: "",
    company: "",
    title: "",
    status: "contacted" as Speaker["status"],
    session_title: "",
    session_format: "" as "" | Speaker["session_format"],
    banner_status: "not_started" as Speaker["banner_status"],
    bio_received: false,
    headshot_received: false,
    linkedin_url: "",
    notes: "",
    dropbox_link: "",
    linkedin_post_confirmed: false,
  });

  useEffect(() => {
    if (speaker) {
      setForm({
        event_id: speaker.event_id,
        name: speaker.name,
        company: speaker.company ?? "",
        title: speaker.title ?? "",
        status: speaker.status,
        session_title: speaker.session_title ?? "",
        session_format: speaker.session_format ?? "",
        banner_status: speaker.banner_status,
        bio_received: speaker.bio_received,
        headshot_received: speaker.headshot_received,
        linkedin_url: speaker.linkedin_url ?? "",
        notes: speaker.notes ?? "",
        dropbox_link: speaker.dropbox_link ?? "",
        linkedin_post_confirmed: speaker.linkedin_post_confirmed,
      });
    } else {
      setForm((f) => ({ ...f, event_id: defaultEventId ?? f.event_id, name: "", company: "", title: "", session_title: "", notes: "", linkedin_url: "", dropbox_link: "" }));
    }
  }, [speaker, open, defaultEventId]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        event_id: form.event_id,
        name: form.name,
        company: form.company || null,
        title: form.title || null,
        status: form.status,
        session_title: form.session_title || null,
        session_format: (form.session_format || null) as Speaker["session_format"],
        banner_status: form.banner_status,
        bio_received: form.bio_received,
        headshot_received: form.headshot_received,
        linkedin_url: form.linkedin_url || null,
        notes: form.notes || null,
        dropbox_link: form.dropbox_link || null,
        linkedin_post_confirmed: form.linkedin_post_confirmed,
      };
      if (speaker) return update({ data: { id: speaker.id, patch: payload } });
      return create({ data: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["speakers"] });
      qc.invalidateQueries({ queryKey: qk.eventSummaries() });
      toast.success(speaker ? "Speaker updated" : "Speaker added");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async () => speaker ? del({ data: { id: speaker.id } }) : undefined,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["speakers"] });
      qc.invalidateQueries({ queryKey: qk.eventSummaries() });
      toast.success("Speaker deleted");
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{speaker ? "Edit speaker" : "New speaker"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Event</Label>
            <Select value={form.event_id} onValueChange={(v) => setForm({ ...form, event_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
              <SelectContent>
                {(events.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <F label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
          <F label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></F>
          <F label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></F>
          <F label="Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as never })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SPEAKER_STATUSES.map((s) => <SelectItem key={s} value={s}>{labels.speaker[s]}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Session title" full><Input value={form.session_title} onChange={(e) => setForm({ ...form, session_title: e.target.value })} /></F>
          <F label="Session format">
            <Select value={form.session_format || ""} onValueChange={(v) => setForm({ ...form, session_format: v as never })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{SESSION_FORMATS.map((s) => <SelectItem key={s} value={s}>{labels.sessionFormat[s]}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Banner status">
            <Select value={form.banner_status} onValueChange={(v) => setForm({ ...form, banner_status: v as never })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{BANNER_STATUSES.map((s) => <SelectItem key={s} value={s}>{labels.banner[s]}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="LinkedIn URL"><Input value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} /></F>
          <F label="Dropbox link"><Input value={form.dropbox_link} onChange={(e) => setForm({ ...form, dropbox_link: e.target.value })} /></F>
          <div className="col-span-2 flex flex-wrap gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.bio_received} onCheckedChange={(v) => setForm({ ...form, bio_received: !!v })} />Bio received</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.headshot_received} onCheckedChange={(v) => setForm({ ...form, headshot_received: !!v })} />Headshot received</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.linkedin_post_confirmed} onCheckedChange={(v) => setForm({ ...form, linkedin_post_confirmed: !!v })} />LinkedIn post confirmed</label>
          </div>
          <F label="Notes" full><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></F>
          <DialogFooter className="col-span-2 sm:justify-between">
            <div>
              {speaker && (
                <Button type="button" variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending || !form.event_id}>{save.isPending ? "Saving…" : "Save"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
