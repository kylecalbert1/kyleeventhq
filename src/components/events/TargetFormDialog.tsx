import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
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
import {
  createEventTarget,
  updateEventTarget,
  type EventTarget,
  type TargetSource,
} from "@/lib/event-targets.functions";

export function TargetFormDialog({
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
            <Label htmlFor="target-value">Target number</Label>
            <Input
              id="target-value"
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Where does the current number come from?</Label>
            <RadioGroup value={source} onValueChange={(v) => setSource(v as TargetSource)}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="manual" id="src-manual" />
                <Label htmlFor="src-manual" className="font-normal">
                  I'll enter this number myself
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
                  Automatically pulled from Tito (delegate ticket sales)
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
