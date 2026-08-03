import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createBoardSpeaker } from "@/lib/boards.functions";

const SOURCES = ["manual", "asana", "tito", "linkedin", "referral", "past speaker"];

export function AddBoardSpeakerDialog({
  open,
  onOpenChange,
  boardId,
  columns,
  defaultColumnId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  boardId: string;
  columns: Array<{ id: string; name: string }>;
  defaultColumnId?: string | null;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createBoardSpeaker);
  const [form, setForm] = useState({
    name: "",
    title: "",
    company: "",
    email: "",
    source: "manual",
    column_id: defaultColumnId ?? columns[0]?.id ?? "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: "",
        title: "",
        company: "",
        email: "",
        source: "manual",
        column_id: defaultColumnId ?? columns[0]?.id ?? "",
      });
    }
  }, [open, defaultColumnId, columns]);

  const m = useMutation({
    mutationFn: () =>
      create({
        data: {
          board_id: boardId,
          column_id: form.column_id,
          name: form.name.trim(),
          title: form.title.trim() || null,
          company: form.company.trim() || null,
          email: form.email.trim() || null,
          source: form.source,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["speakerBoard", boardId] });
      qc.invalidateQueries({ queryKey: ["speakers"] });
      toast.success("Speaker added to the board");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add speaker"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add speaker</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Jane Doe"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Job title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="VP Engineering"
              />
            </div>
            <div>
              <Label className="text-xs">Company</Label>
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Acme"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Email (optional)</Label>
            <Input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="jane@acme.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Source</Label>
              <Select
                value={form.source}
                onValueChange={(v) => setForm({ ...form, source: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Column</Label>
              <Select
                value={form.column_id}
                onValueChange={(v) => setForm({ ...form, column_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={!form.name.trim() || !form.column_id || m.isPending}
          >
            {m.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Add speaker
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
