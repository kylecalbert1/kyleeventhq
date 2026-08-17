import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHelp } from "@/components/PageHelp";
import { messageTemplatesQuery } from "@/lib/queries";
import {
  createMessageTemplate,
  updateMessageTemplate,
  duplicateMessageTemplate,
  deleteMessageTemplate,
  type MessageTemplate,
} from "@/lib/message-templates.functions";
import {
  STREAMS,
  streamMeta,
  typicalWeeksLabel,
  markdownToHtml,
  PLACEHOLDER_HELP,
  type Stream,
} from "@/lib/message-render";
import { messageBlocksQuery } from "@/lib/queries";
import {
  createMessageBlock,
  updateMessageBlock,
  deleteMessageBlock,
  type MessageBlock,
} from "@/lib/message-templates.functions";
import { InsertBlockMenu } from "@/components/messages/InsertBlockMenu";

export const Route = createFileRoute("/_authenticated/message-templates")({
  head: () => ({
    meta: [
      { title: "Message templates | Event Command Center" },
      {
        name: "description",
        content:
          "The global library of pre and post event Tito messages: edit the copy, the timing and the recipient stream once and reuse it on every summit.",
      },
      { property: "og:title", content: "Message templates | Event Command Center" },
      {
        property: "og:description",
        content:
          "Edit the reusable Tito message cadence for every AIAI and CSC event in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MessageTemplatesPage,
});

type Draft = {
  id?: string;
  name: string;
  stream: Stream;
  typical_weeks: string;
  business_line: string;
  event_format: string;
  subject: string;
  body_markdown: string;
  tito_filter_hint: string;
  position: number;
};

const emptyDraft: Draft = {
  name: "",
  stream: "attendees",
  typical_weeks: "",
  business_line: "all",
  event_format: "all",
  subject: "",
  body_markdown: "",
  tito_filter_hint: "",
  position: 0,
};

function MessageTemplatesPage() {
  const templates = useQuery(messageTemplatesQuery);
  const [editing, setEditing] = useState<Draft | null>(null);

  const qc = useQueryClient();
  const dup = useServerFn(duplicateMessageTemplate);
  const del = useServerFn(deleteMessageTemplate);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["messageTemplates"] });

  const duplicate = useMutation({
    mutationFn: (id: string) => dup({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Duplicated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Template removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const grouped = useMemo(() => {
    const rows = templates.data ?? [];
    return STREAMS.map((stream) => {
      const list = rows
        .filter((t) => t.stream === stream)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
      return { stream, list };
    }).filter((g) => g.list.length > 0);
  }, [templates.data]);

  function openEdit(t: MessageTemplate) {
    setEditing({
      id: t.id,
      name: t.name,
      stream: t.stream,
      typical_weeks: (t.typical_weeks ?? []).join(", "),
      business_line: t.business_line ?? "all",
      event_format: t.event_format ?? "all",
      subject: t.subject,
      body_markdown: t.body_markdown,
      tito_filter_hint: t.tito_filter_hint,
      position: t.position,
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8 md:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Message templates
              </h1>
              <PageHelp
                title="Message templates"
                what="One global library of the recurring messages you send in Tito before and after every event. Each template has a stream, a target week and copy with placeholders that get filled per event."
                steps={[
                  "Edit a template's copy, timing or scope here once and every event picks it up.",
                  "Use [[double brackets]] for values this app fills from the event record.",
                  "Leave {{curly braces}} alone, those are Tito's own merge tags.",
                  "Open an event and use its Messages panel to generate and copy the finished text.",
                ]}
              />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Shared by every event. Tito has no messages API, so this produces copy-paste
              ready text, it never sends.
            </p>
          </div>
          <Button onClick={() => setEditing({ ...emptyDraft })}>
            <Plus className="mr-1.5 h-4 w-4" />
            New template
          </Button>
        </div>

        <PlaceholderCheatSheet />

        <BlocksSection />

        {grouped.map(({ stream, list }) => {
          const meta = streamMeta[stream];
          return (
            <section key={stream} className="surface-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                <h2 className="text-sm font-semibold text-foreground">{meta.label}</h2>
                <span className="text-xs text-muted-foreground">({list.length})</span>
              </div>
              <div className="divide-y divide-border rounded-xl border border-border">
                {list.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{t.name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.chip}`}
                        >
                          {typicalWeeksLabel(t.typical_weeks) ?? "Any time"}
                        </span>
                        {t.business_line && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                            {t.business_line} only
                          </span>
                        )}
                        {t.event_format && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                            {t.event_format === "virtual" ? "Virtual only" : "In person only"}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {t.subject}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => openEdit(t)}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => duplicate.mutate(t.id)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive hover:text-destructive"
                        onClick={() => remove.mutate(t.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {templates.data && templates.data.length === 0 && (
          <div className="surface-card p-8 text-center text-sm text-muted-foreground">
            No templates yet. Create your first one.
          </div>
        )}
      </div>

      <TemplateEditorDialog
        draft={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          invalidate();
          setEditing(null);
        }}
      />
    </div>
  );
}

/** "12, 8, 6" -> [12, 8, 6]. Blank or junk -> null. */
function parseTypicalWeeks(raw: string): number[] | null {
  const nums = raw
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.round(n));
  const unique = [...new Set(nums)].sort((a, b) => b - a);
  return unique.length ? unique : null;
}

function PlaceholderCheatSheet() {
  return (
    <div className="surface-card p-5">
      <h2 className="text-sm font-semibold text-foreground">Placeholders</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {"[[double square brackets]]"} are filled by this app from the event record before you
        copy. {"{{curly braces}}"} are Tito's own merge tags and pass through completely
        untouched, including block helpers like{" "}
        <code className="font-mono">{"{{#any_incomplete_tickets}}"}</code>.
      </p>
      <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {PLACEHOLDER_HELP.map((p) => (
          <div key={p.key} className="flex items-baseline gap-2 text-xs">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              [[{p.key}]]
            </code>
            <span className="text-muted-foreground">{p.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateEditorDialog({
  draft,
  onClose,
  onSaved,
}: {
  draft: Draft | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const create = useServerFn(createMessageTemplate);
  const update = useServerFn(updateMessageTemplate);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [form, setForm] = useState<Draft | null>(draft);

  // Re-seed the local form whenever a different template is opened.
  const [seededId, setSeededId] = useState<string | undefined>(draft?.id);
  if (draft && (form === null || seededId !== draft.id)) {
    setForm(draft);
    setSeededId(draft.id);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const payload = {
        name: form.name,
        stream: form.stream,
        typical_weeks: parseTypicalWeeks(form.typical_weeks),
        business_line:
          form.business_line === "all" ? null : (form.business_line as "AIAI" | "CSC"),
        event_format:
          form.event_format === "all"
            ? null
            : (form.event_format as "in_person" | "virtual"),
        subject: form.subject,
        body_markdown: form.body_markdown,
        tito_filter_hint: form.tito_filter_hint,
        position: form.position ?? 0,
      };
      if (form.id) return update({ data: { id: form.id, patch: payload } });
      return create({ data: payload });
    },
    onSuccess: () => {
      toast.success("Template saved");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!draft || !form) return null;

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit template" : "New template"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Stream</Label>
            <Select
              value={form.stream}
              onValueChange={(v) => setForm({ ...form, stream: v as Stream })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STREAMS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {streamMeta[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Typical weeks (hint only)</Label>
            <Input
              placeholder="12, 8, 6, 4, 3, 2"
              value={form.typical_weeks}
              onChange={(e) => setForm({ ...form, typical_weeks: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">
              When this type usually goes out. 12 = twelve weeks before, 0 = event day, -3 =
              three weeks after. Blank means any time. This never creates a schedule.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Business line</Label>
            <Select
              value={form.business_line}
              onValueChange={(v) => setForm({ ...form, business_line: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Both</SelectItem>
                <SelectItem value="AIAI">AIAI</SelectItem>
                <SelectItem value="CSC">CSC</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Format</Label>
            <Select
              value={form.event_format}
              onValueChange={(v) => setForm({ ...form, event_format: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Both</SelectItem>
                <SelectItem value="in_person">In person</SelectItem>
                <SelectItem value="virtual">Virtual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Tito filter hint</Label>
            <Input
              placeholder="Filter to Speaker Pass + Speaker Guest releases"
              value={form.tito_filter_hint}
              onChange={(e) => setForm({ ...form, tito_filter_hint: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Body (markdown)</Label>
              <InsertBlockMenu
                textareaRef={bodyRef}
                value={form.body_markdown}
                onChange={(v) => setForm({ ...form, body_markdown: v })}
              />
            </div>
            <Textarea
              ref={bodyRef}
              rows={20}
              className="font-mono text-[12.5px]"
              value={form.body_markdown}
              onChange={(e) => setForm({ ...form, body_markdown: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Live preview</Label>
            <div
              className="min-h-[200px] rounded-md border border-input bg-muted/30 px-3 py-2 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_p]:my-2 [&_ul]:my-2"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(form.body_markdown) }}
            />
            <p className="text-[11px] text-muted-foreground">
              Placeholders are shown raw here. Open an event's Messages panel to see them
              resolved.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- reusable content blocks ---------------- */

type BlockDraft = { id?: string; name: string; body_markdown: string; position: number };

function BlocksSection() {
  const qc = useQueryClient();
  const blocks = useQuery(messageBlocksQuery);
  const [editing, setEditing] = useState<BlockDraft | null>(null);
  const del = useServerFn(deleteMessageBlock);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["messageBlocks"] });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Block removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <section className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Content blocks</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Short reusable chunks you can drop into any template or into a message while you
            generate it. They can use {"[[placeholders]]"} too.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditing({ name: "", body_markdown: "", position: 0 })}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New block
        </Button>
      </div>

      <div className="mt-3 divide-y divide-border rounded-xl border border-border">
        {(blocks.data ?? []).map((b: MessageBlock) => (
          <div key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">{b.name}</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {b.body_markdown}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() =>
                  setEditing({
                    id: b.id,
                    name: b.name,
                    body_markdown: b.body_markdown,
                    position: b.position,
                  })
                }
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-destructive hover:text-destructive"
                onClick={() => remove.mutate(b.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {(blocks.data ?? []).length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No blocks yet.
          </div>
        )}
      </div>

      <BlockEditorDialog
        draft={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          invalidate();
          setEditing(null);
        }}
      />
    </section>
  );
}

function BlockEditorDialog({
  draft,
  onClose,
  onSaved,
}: {
  draft: BlockDraft | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const create = useServerFn(createMessageBlock);
  const update = useServerFn(updateMessageBlock);
  const [form, setForm] = useState<BlockDraft | null>(draft);
  const [seededId, setSeededId] = useState<string | undefined>(draft?.id);
  if (draft && (form === null || seededId !== draft.id)) {
    setForm(draft);
    setSeededId(draft.id);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const payload = {
        name: form.name,
        body_markdown: form.body_markdown,
        position: form.position ?? 0,
      };
      if (form.id) return update({ data: { id: form.id, patch: payload } });
      return create({ data: payload });
    },
    onSuccess: () => {
      toast.success("Block saved");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!draft || !form) return null;

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit block" : "New block"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Body (markdown)</Label>
            <Textarea
              rows={8}
              className="font-mono text-[12.5px]"
              value={form.body_markdown}
              onChange={(e) => setForm({ ...form, body_markdown: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Preview</Label>
            <div
              className="min-h-[60px] rounded-md border border-input bg-muted/30 px-3 py-2 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_p]:my-2 [&_ul]:my-2"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(form.body_markdown) }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
