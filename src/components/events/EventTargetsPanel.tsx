import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, Target as TargetIcon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StatusPill } from "@/components/StatusPill";
import { eventTargetsQuery } from "@/lib/queries";
import {
  createEventTarget,
  updateEventTarget,
  deleteEventTarget,
  type EventTarget,
  type TargetSource,
} from "@/lib/event-targets.functions";

const toneBar: Record<"green" | "amber" | "red", string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
};

export function EventTargetsPanel({
  eventId,
  hasTitoSlug,
}: {
  eventId: string;
  hasTitoSlug: boolean;
}) {
  const qc = useQueryClient();
  const targets = useQuery(eventTargetsQuery(eventId));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EventTarget | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["eventTargets", eventId] });
    qc.invalidateQueries({ queryKey: ["cardTargets"] });
  };

  const del = useServerFn(deleteEventTarget);
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Target deleted");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const rows = targets.data ?? [];

  return (
    <Card className="p-5 rounded-2xl border-slate-200/70">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <TargetIcon className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold">Targets</h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add target
        </Button>
      </div>

      {targets.isLoading ? (
        <div className="mt-4 text-xs text-muted-foreground">Loading targets…</div>
      ) : rows.length === 0 ? (
        <div className="mt-4 text-xs text-muted-foreground">
          No targets yet. Add one to track ticket sales or any number you care about.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((t) => (
            <TargetCard
              key={t.id}
              target={t}
              onEdit={() => {
                setEditing(t);
                setFormOpen(true);
              }}
              onDelete={() => {
                if (window.confirm(`Delete target "${t.label}"?`)) delMut.mutate(t.id);
              }}
              onSaved={invalidate}
            />
          ))}
        </div>
      )}

      <TargetFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        eventId={eventId}
        hasTitoSlug={hasTitoSlug}
        target={editing}
        onSaved={invalidate}
      />
    </Card>
  );
}

function TargetCard({
  target,
  onEdit,
  onDelete,
  onSaved,
}: {
  target: EventTarget;
  onEdit: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const update = useServerFn(updateEventTarget);
  const [value, setValue] = useState(String(target.manual_current_value ?? 0));

  const saveCurrent = async () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n === (target.manual_current_value ?? 0)) return;
    try {
      await update({ data: { id: target.id, patch: { manual_current_value: n } } });
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  };

  const pct =
    target.target_value > 0
      ? Math.min(100, Math.round((target.current_value / target.target_value) * 100))
      : 0;
  const bar = target.source === "tito_delegate_tickets" ? toneBar[target.tone ?? "green"] : "bg-slate-700";
  const maxWeek = Math.max(1, ...(target.weekly ?? []).map((w) => w.count));

  return (
    <div className="rounded-xl ring-1 ring-slate-200 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{target.label}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {target.source === "tito_delegate_tickets"
              ? "Live from Tito — delegate tickets"
              : "Manual"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {target.met && (
            <StatusPill className="bg-emerald-50 text-emerald-800 ring-emerald-200">
              Target met
            </StatusPill>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit target">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete target">
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-end gap-2">
        {target.source === "manual" ? (
          <Input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={saveCurrent}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="h-9 w-24 text-lg font-semibold tabular-nums"
          />
        ) : (
          <span className="text-2xl font-semibold tabular-nums text-slate-900">
            {target.current_value}
          </span>
        )}
        <span className="text-base font-medium text-slate-500 pb-0.5">
          of {target.target_value}
        </span>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>

      {target.source === "tito_delegate_tickets" && target.unavailable && (
        <div className="mt-2 text-xs text-muted-foreground">
          No Tito delegate release found for this event yet.
        </div>
      )}

      {target.source === "tito_delegate_tickets" && !target.unavailable && (
        <>
          {(target.weekly ?? []).length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] text-muted-foreground mb-1.5">Last 10 weeks</div>
              <div className="flex items-end gap-1.5 h-16">
                {(target.weekly ?? []).map((w) => (
                  <div key={w.week_start} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t bg-slate-400"
                        style={{ height: `${(w.count / maxWeek) * 100}%` }}
                        title={`${w.week_start}: ${w.count}`}
                      />
                    </div>
                    <div className="text-[9px] tabular-nums text-slate-400">{w.count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!target.met && (
            <p className="mt-2 text-xs text-slate-600">
              You need about {target.needed_per_week} tickets a week from here to hit target
              {typeof target.recent_avg_per_week === "number" &&
                ` (recent average ${target.recent_avg_per_week} a week)`}
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TargetFormDialog({
  open,
  onOpenChange,
  eventId,
  hasTitoSlug,
  target,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  hasTitoSlug: boolean;
  target: EventTarget | null;
  onSaved: () => void;
}) {
  const create = useServerFn(createEventTarget);
  const update = useServerFn(updateEventTarget);
  const [label, setLabel] = useState("");
  const [targetValue, setTargetValue] = useState("100");
  const [source, setSource] = useState<TargetSource>("manual");
  const [current, setCurrent] = useState("0");
  const [showOnCard, setShowOnCard] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);

  // Seed form when opening / switching target.
  const seedKey = open ? (target?.id ?? "new") : null;
  if (seedKey && seedKey !== seeded) {
    setSeeded(seedKey);
    setLabel(target?.label ?? "");
    setTargetValue(String(target?.target_value ?? 100));
    setSource(target?.source ?? "manual");
    setCurrent(String(target?.manual_current_value ?? 0));
    setShowOnCard(target?.show_on_card ?? true);
  }
  if (!open && seeded !== null) setSeeded(null);

  const save = async () => {
    if (!label.trim()) return toast.error("Give the target a label");
    const tv = Number(targetValue);
    if (!Number.isFinite(tv)) return toast.error("Target must be a number");
    setSaving(true);
    try {
      if (target) {
        await update({
          data: {
            id: target.id,
            patch: {
              label: label.trim(),
              target_value: tv,
              source,
              show_on_card: showOnCard,
              ...(source === "manual" ? { manual_current_value: Number(current) || 0 } : {}),
            },
          },
        });
      } else {
        await create({
          data: {
            event_id: eventId,
            label: label.trim(),
            target_value: tv,
            source,
            manual_current_value: source === "manual" ? Number(current) || 0 : null,
            show_on_card: showOnCard,
          },
        });
      }
      toast.success(target ? "Target updated" : "Target added");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save target");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{target ? "Edit target" : "Add target"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="target-label">Label</Label>
            <Input
              id="target-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Delegate tickets"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="target-value">Target</Label>
            <Input
              id="target-value"
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Source</Label>
            <RadioGroup value={source} onValueChange={(v) => setSource(v as TargetSource)}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="manual" id="src-manual" />
                <Label htmlFor="src-manual" className="font-normal">
                  Manual
                </Label>
              </div>
              <div
                className="flex items-center gap-2"
                title={hasTitoSlug ? undefined : "This event isn't linked to a Tito event"}
              >
                <RadioGroupItem
                  value="tito_delegate_tickets"
                  id="src-tito"
                  disabled={!hasTitoSlug}
                />
                <Label
                  htmlFor="src-tito"
                  className={`font-normal ${hasTitoSlug ? "" : "text-slate-400"}`}
                >
                  Live from Tito — delegate tickets
                </Label>
              </div>
            </RadioGroup>
          </div>
          {source === "manual" && (
            <div className="space-y-1.5">
              <Label htmlFor="target-current">Current value</Label>
              <Input
                id="target-current"
                type="number"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="target-card"
              checked={showOnCard}
              onCheckedChange={(v) => setShowOnCard(v === true)}
            />
            <Label htmlFor="target-card" className="font-normal">
              Show on event card
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
