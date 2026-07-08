import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createSponsor, updateSponsor, deleteSponsor } from "@/lib/sponsors.functions";
import { BANNER_STATUSES, labels } from "@/lib/status";

type Sponsor = {
  id: string;
  event_id: string;
  name: string;
  spend_tier: string | null;
  session_type: string | null;
  banner_status: "not_started" | "created" | "sent" | "confirmed_live";
  dropbox_link: string | null;
  linkedin_post_confirmed: boolean;
};

export function SponsorFormDialog({
  open,
  onOpenChange,
  sponsor,
  eventId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sponsor?: Sponsor;
  eventId: string;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createSponsor);
  const update = useServerFn(updateSponsor);
  const del = useServerFn(deleteSponsor);

  const [form, setForm] = useState({
    name: "",
    spend_tier: "",
    session_type: "",
    banner_status: "not_started" as Sponsor["banner_status"],
    dropbox_link: "",
    linkedin_post_confirmed: false,
  });

  useEffect(() => {
    if (sponsor) {
      setForm({
        name: sponsor.name,
        spend_tier: sponsor.spend_tier ?? "",
        session_type: sponsor.session_type ?? "",
        banner_status: sponsor.banner_status,
        dropbox_link: sponsor.dropbox_link ?? "",
        linkedin_post_confirmed: sponsor.linkedin_post_confirmed,
      });
    } else {
      setForm({ name: "", spend_tier: "", session_type: "", banner_status: "not_started", dropbox_link: "", linkedin_post_confirmed: false });
    }
  }, [sponsor, open]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        event_id: eventId,
        name: form.name,
        spend_tier: form.spend_tier || null,
        session_type: form.session_type || null,
        banner_status: form.banner_status,
        dropbox_link: form.dropbox_link || null,
        linkedin_post_confirmed: form.linkedin_post_confirmed,
      };
      if (sponsor) return update({ data: { id: sponsor.id, patch: payload } });
      return create({ data: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sponsors"] });
      toast.success(sponsor ? "Sponsor updated" : "Sponsor added");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async () => sponsor ? del({ data: { id: sponsor.id } }) : undefined,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sponsors"] });
      toast.success("Sponsor deleted");
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{sponsor ? "Edit sponsor" : "New sponsor"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <div className="space-y-1.5"><Label className="text-xs">Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="text-xs">Spend tier</Label><Input value={form.spend_tier} onChange={(e) => setForm({ ...form, spend_tier: e.target.value })} placeholder="Gold / Silver / …" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Session type</Label><Input value={form.session_type} onChange={(e) => setForm({ ...form, session_type: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Banner status</Label>
            <Select value={form.banner_status} onValueChange={(v) => setForm({ ...form, banner_status: v as never })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{BANNER_STATUSES.map((s) => <SelectItem key={s} value={s}>{labels.banner[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Dropbox link</Label><Input value={form.dropbox_link} onChange={(e) => setForm({ ...form, dropbox_link: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.linkedin_post_confirmed} onCheckedChange={(v) => setForm({ ...form, linkedin_post_confirmed: !!v })} />LinkedIn post confirmed</label>
          <DialogFooter className="sm:justify-between">
            <div>{sponsor && <Button type="button" variant="destructive" onClick={() => remove.mutate()}>Delete</Button>}</div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>Save</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
