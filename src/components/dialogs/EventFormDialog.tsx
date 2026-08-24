import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";
import { createEvent, updateEvent, deleteEvent } from "@/lib/events.functions";
import { BUSINESS_LINES, EVENT_FORMATS, WEBSITE_STAGES, SELF_STATUSES, labels } from "@/lib/status";
import { qk, titoEventsPickerQuery } from "@/lib/queries";

function parseAsanaGid(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const m = v.match(/\/project\/(\d+)/);
  if (m) return m[1];
  if (/^\d+$/.test(v)) return v;
  return v;
}

function looksLikeAsanaUrl(input: string): boolean {
  const v = input.trim();
  if (!v) return true;
  if (/^\d+$/.test(v)) return true;
  return /\/project\/\d+/.test(v);
}

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
  speaker_target?: number | null;
  external_agenda_url?: string | null;
  tito_slug?: string | null;
  event_site_url?: string | null;
  venue_url?: string | null;
  venue_address?: string | null;
  registration_time?: string | null;
  sessions_start_time?: string | null;
  venue_notes?: string | null;
  join_instructions?: string | null;
  dietary_url?: string | null;
  room_block_url?: string | null;
  room_block_notes?: string | null;
  sales_contact_name?: string | null;
  sales_contact_email?: string | null;
  sales_contact_booking_link?: string | null;
};

const initial = {
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
  speaker_target: 15,
  external_agenda_url: "",
  tito_slug: "",
  sales_contact_name: "",
  sales_contact_email: "",
  sales_contact_booking_link: "",
  event_site_url: "",
  venue_url: "",
  venue_address: "",
  registration_time: "",
  sessions_start_time: "",
  venue_notes: "",
  join_instructions: "",
  dietary_url: "",
  room_block_url: "",
  room_block_notes: "",
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
  const titoEvents = useQuery({ ...titoEventsPickerQuery, enabled: open });

  const [form, setForm] = useState(initial);

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
        speaker_target: event.speaker_target ?? 15,
        external_agenda_url: event.external_agenda_url ?? "",
        tito_slug: event.tito_slug ?? "",
        sales_contact_name: event.sales_contact_name ?? "",
        sales_contact_email: event.sales_contact_email ?? "",
        sales_contact_booking_link: event.sales_contact_booking_link ?? "",
        event_site_url: event.event_site_url ?? "",
        venue_url: event.venue_url ?? "",
        venue_address: event.venue_address ?? "",
        registration_time: event.registration_time ?? "",
        sessions_start_time: event.sessions_start_time ?? "",
        venue_notes: event.venue_notes ?? "",
        join_instructions: event.join_instructions ?? "",
        dietary_url: event.dietary_url ?? "",
        room_block_url: event.room_block_url ?? "",
        room_block_notes: event.room_block_notes ?? "",
      });
    } else {
      setForm(initial);
    }
  }, [event, open]);

  const save = useMutation({
    mutationFn: async () => {
      const { asana_link, ...rest } = form;
      const payload = {
        ...rest,
        event_date: form.event_date || null,
        venue: form.venue || null,
        kickoff_date: form.kickoff_date || null,
        washup_date: form.washup_date || null,
        launch_date: form.launch_date || null,
        owner: form.owner || null,
        proof1_due: form.proof1_due || null,
        proof2_due: form.proof2_due || null,
        final_signoff_due: form.final_signoff_due || null,
        asana_project_gid: parseAsanaGid(asana_link),
        speaker_target: Number(form.speaker_target) || 15,
        external_agenda_url: form.external_agenda_url.trim() || null,
        tito_slug: form.tito_slug.trim() || null,
        sales_contact_name: form.sales_contact_name.trim() || null,
        sales_contact_email: form.sales_contact_email.trim() || null,
        sales_contact_booking_link: form.sales_contact_booking_link.trim() || null,
        event_site_url: form.event_site_url.trim() || null,
        venue_url: form.venue_url.trim() || null,
        venue_address: form.venue_address.trim() || null,
        registration_time: form.registration_time.trim() || null,
        sessions_start_time: form.sessions_start_time.trim() || null,
        venue_notes: form.venue_notes.trim() || null,
        join_instructions: form.join_instructions.trim() || null,
        dietary_url: form.dietary_url.trim() || null,
        room_block_url: form.room_block_url.trim() || null,
        room_block_notes: form.room_block_notes.trim() || null,
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

  const titoOptions = useMemo(() => {
    const rows = titoEvents.data ?? [];
    // Rank: future events first, then most recent past.
    const now = Date.now();
    const sorted = [...rows].sort((a, b) => {
      const ad = a.start_date ? new Date(a.start_date).getTime() : 0;
      const bd = b.start_date ? new Date(b.start_date).getTime() : 0;
      const aFuture = ad >= now ? 0 : 1;
      const bFuture = bd >= now ? 0 : 1;
      if (aFuture !== bFuture) return aFuture - bFuture;
      return bd - ad;
    });
    return sorted.map((e) => ({
      value: e.slug,
      label: e.title,
      keywords: `${e.slug} ${e.start_date ?? ""}`,
    }));
  }, [titoEvents.data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
          <Field label="Speaker target">
            <Input
              type="number"
              min={0}
              value={form.speaker_target}
              onChange={(e) => setForm({ ...form, speaker_target: Number(e.target.value) })}
            />
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
          <Field label="Tito event (optional - leave empty for virtual events)" full>
            <div className="flex items-center gap-2">
              <SearchableSelect
                triggerClassName="flex-1 h-10"
                placeholder="Search Tito events…"
                searchPlaceholder="Search by name or slug…"
                value={form.tito_slug}
                onValueChange={(v) => setForm({ ...form, tito_slug: v })}
                allOption={{ value: "", label: "- Not linked -" }}
                options={titoOptions}
              />
              {form.tito_slug && (
                <a
                  href={`https://ti.to/sequel-media/${form.tito_slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary underline whitespace-nowrap"
                >
                  Open in Tito
                </a>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Links this event to its Tito registration so releases, ticket counts and reconciliation show up on the event page.
            </p>
          </Field>
          <Field label="Delegate sales contact (optional)" full>
            <div className="grid grid-cols-3 gap-3">
              <Input
                placeholder="Name"
                value={form.sales_contact_name}
                onChange={(e) => setForm({ ...form, sales_contact_name: e.target.value })}
              />
              <Input
                type="email"
                placeholder="Email"
                value={form.sales_contact_email}
                onChange={(e) => setForm({ ...form, sales_contact_email: e.target.value })}
              />
              <Input
                type="url"
                placeholder="Booking link"
                value={form.sales_contact_booking_link}
                onChange={(e) => setForm({ ...form, sales_contact_booking_link: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Used by the {"{{sales_contact_name}}"}, {"{{sales_contact_email}}"} and{" "}
              {"{{sales_contact_booking_link}}"} merge tags in email templates.
            </p>
          </Field>
          <Field label="Asana Timeline project link (optional)" full>
            <Input
              type="url"
              placeholder="https://app.asana.com/1/…/project/1213875920325118/timeline"
              value={form.asana_link}
              onChange={(e) => setForm({ ...form, asana_link: e.target.value })}
            />
            {form.asana_link && !looksLikeAsanaUrl(form.asana_link) ? (
              <p className="text-xs text-amber-600">
                This doesn't look like an Asana project URL - we'll save it as-is.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Link this once to auto-sync launch and kickoff dates from Asana.
              </p>
            )}
          </Field>
          <Field label="External agenda link (optional)" full>
            <Input
              type="url"
              placeholder="https://docs.google.com/document/d/…  or Sheets / Notion / etc."
              value={form.external_agenda_url}
              onChange={(e) => setForm({ ...form, external_agenda_url: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              If your agenda is hosted elsewhere, paste the link. Shown as an "Open" button on the Agenda page.
            </p>
          </Field>

          <div className="col-span-2 mt-2 rounded-xl border border-border bg-muted/30 p-4 space-y-4">
            <div>
              <div className="text-sm font-semibold text-foreground">Message details</div>
              <p className="text-xs text-muted-foreground">
                These fill the {"[[placeholders]]"} in the Tito message templates. Leave blank
                and the generator will tell you what is missing.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Event site URL">
                <Input
                  type="url"
                  placeholder="https://…"
                  value={form.event_site_url}
                  onChange={(e) => setForm({ ...form, event_site_url: e.target.value })}
                />
              </Field>
              <Field label="Venue URL">
                <Input
                  type="url"
                  placeholder="https://…"
                  value={form.venue_url}
                  onChange={(e) => setForm({ ...form, venue_url: e.target.value })}
                />
              </Field>
              <Field label="Venue address" full>
                <Input
                  placeholder="123 Example Street, London, EC1A 1AA"
                  value={form.venue_address}
                  onChange={(e) => setForm({ ...form, venue_address: e.target.value })}
                />
              </Field>
              <Field label="Registration time">
                <Input
                  placeholder="8AM"
                  value={form.registration_time}
                  onChange={(e) => setForm({ ...form, registration_time: e.target.value })}
                />
              </Field>
              <Field label="Sessions start time">
                <Input
                  placeholder="9"
                  value={form.sessions_start_time}
                  onChange={(e) => setForm({ ...form, sessions_start_time: e.target.value })}
                />
              </Field>
              <Field label="Venue notes (in person)" full>
                <Textarea
                  rows={2}
                  placeholder="Please remember to bring your government issued ID to access the venue."
                  value={form.venue_notes}
                  onChange={(e) => setForm({ ...form, venue_notes: e.target.value })}
                />
              </Field>
              <Field label="Dietary requirements URL" full>
                <Input
                  type="url"
                  placeholder="https://…"
                  value={form.dietary_url}
                  onChange={(e) => setForm({ ...form, dietary_url: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  The form where attendees submit dietary requirements and accessibility needs.
                </p>
              </Field>
              <Field label="Join instructions (virtual)" full>
                <Textarea
                  rows={2}
                  placeholder="Your Goldcast join link is in your confirmation email. Click it on the day to enter the event."
                  value={form.join_instructions}
                  onChange={(e) => setForm({ ...form, join_instructions: e.target.value })}
                />
              </Field>
            </div>
          </div>

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
