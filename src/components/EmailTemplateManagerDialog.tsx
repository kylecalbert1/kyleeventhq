import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Copy, Trash2, Save, Loader2, Pencil } from "lucide-react";
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
import { RichTextEmailEditor } from "@/components/RichTextEmailEditor";
import { toEmailHtml } from "@/lib/email-format";
import { Badge } from "@/components/ui/badge";
import { emailTemplatesQuery } from "@/lib/queries";
import {
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  duplicateEmailTemplate,
  type EmailTemplate,
} from "@/lib/email-templates.functions";
import { cn } from "@/lib/utils";

export function EmailTemplateManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const q = useQuery(emailTemplatesQuery);
  const qc = useQueryClient();
  const create = useServerFn(createEmailTemplate);
  const update = useServerFn(updateEmailTemplate);
  const remove = useServerFn(deleteEmailTemplate);
  const dup = useServerFn(duplicateEmailTemplate);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const templates = q.data ?? [];
  const selected = templates.find((t) => t.id === selectedId) ?? null;

  useEffect(() => {
    if (open && templates.length && !selectedId) {
      setSelectedId(templates[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, templates.length]);

  useEffect(() => {
    if (selected) {
      setName(selected.name);
      setSubject(selected.subject);
      // Older seeded templates are stored as plain text with `**bold**`
      // markdown and `\n` line breaks; coerce to HTML so the rich-text
      // editor displays them correctly. New edits are saved as HTML.
      setBody(toEmailHtml(selected.body));
    }
  }, [selected?.id]);

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await update({ data: { id: selected.id, patch: { name, subject, body } } });
      await qc.invalidateQueries({ queryKey: ["emailTemplates"] });
    } finally {
      setSaving(false);
    }
  }
  async function addNew() {
    const row = await create({ data: { name: "New template", subject: "", body: "" } });
    await qc.invalidateQueries({ queryKey: ["emailTemplates"] });
    setSelectedId(row.id);
  }
  async function duplicate(t: EmailTemplate) {
    const row = await dup({ data: { id: t.id } });
    await qc.invalidateQueries({ queryKey: ["emailTemplates"] });
    setSelectedId(row.id);
  }
  async function del(t: EmailTemplate) {
    if (!window.confirm(`${t.is_seed ? "Archive" : "Delete"} "${t.name}"?`)) return;
    await remove({ data: { id: t.id } });
    await qc.invalidateQueries({ queryKey: ["emailTemplates"] });
    if (selectedId === t.id) setSelectedId(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" /> Email templates
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[260px_1fr] gap-0 h-[70vh]">
          <aside className="border-r border-slate-200 bg-slate-50/60 overflow-y-auto">
            <div className="p-3">
              <Button size="sm" onClick={addNew} className="w-full">
                <Plus className="h-3.5 w-3.5 mr-1" /> New template
              </Button>
            </div>
            <ul className="px-2 pb-3 space-y-0.5">
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      "w-full text-left rounded-lg px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center justify-between gap-2",
                      selectedId === t.id && "bg-white shadow-sm ring-1 ring-slate-200",
                    )}
                  >
                    <span className="truncate">{t.name}</span>
                    {t.is_seed && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        seed
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <section className="p-6 overflow-y-auto space-y-4">
            {!selected ? (
              <div className="text-sm text-muted-foreground">Select a template.</div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Name
                  </Label>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => duplicate(selected)}>
                      <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => del(selected)} className="text-red-600">
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> {selected.is_seed ? "Archive" : "Delete"}
                    </Button>
                  </div>
                </div>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Subject</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Body</Label>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="mt-1 min-h-[280px] font-mono text-sm"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Placeholders: {"{{first_name}} {{company}} {{job_title}} {{event_name}} {{event_date}} {{venue}} {{session_title}} {{speaker_pass_link}} {{guest_pass_link}} {{past_event_name}}"}
                  </p>
                </div>
              </>
            )}
          </section>
        </div>
        <DialogFooter className="px-6 py-3 border-t bg-slate-50">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={save} disabled={!selected || saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
