import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Copy, Plus, Trash2, ExternalLink, Save, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { eventOutreachQuery } from "@/lib/queries";
import {
  upsertEventOutreach,
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
} from "@/lib/outreach-hub.functions";

async function copy(text: string, label: string) {
  if (!text) return toast.error("Nothing to copy");
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Couldn't copy");
  }
}

function Field({
  label,
  value,
  onChange,
  multiline,
  rows = 4,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-slate-700">{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => copy(value, label)}
        >
          <Copy className="h-3 w-3 mr-1" /> Copy
        </Button>
      </div>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="font-mono text-[13px] leading-relaxed"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

export function OutreachHub({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const q = useQuery(eventOutreachQuery(eventId));
  const upsertFn = useServerFn(upsertEventOutreach);
  const createFn = useServerFn(createSavedSearch);
  const updateFn = useServerFn(updateSavedSearch);
  const deleteFn = useServerFn(deleteSavedSearch);

  const initial = useMemo(
    () => ({
      inmail_subject: q.data?.outreach?.inmail_subject ?? "",
      inmail_message: q.data?.outreach?.inmail_message ?? "",
      connect_message: q.data?.outreach?.connect_message ?? "",
      colleague_slack: q.data?.outreach?.colleague_slack ?? "",
      colleague_linkedin: q.data?.outreach?.colleague_linkedin ?? "",
    }),
    [q.data?.outreach],
  );

  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);

  const dirty =
    form.inmail_subject !== initial.inmail_subject ||
    form.inmail_message !== initial.inmail_message ||
    form.connect_message !== initial.connect_message ||
    form.colleague_slack !== initial.colleague_slack ||
    form.colleague_linkedin !== initial.colleague_linkedin;

  const save = useMutation({
    mutationFn: async () => upsertFn({ data: { event_id: eventId, patch: form } }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["eventOutreach", eventId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const addSearch = useMutation({
    mutationFn: async () =>
      createFn({
        data: {
          event_id: eventId,
          label: "New saved search",
          url: "",
          position: (q.data?.searches?.length ?? 0) + 1,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eventOutreach", eventId] }),
  });

  const patchSearch = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) =>
      updateFn({ data: { id, patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eventOutreach", eventId] }),
  });

  const removeSearch = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eventOutreach", eventId] }),
  });

  const addSnippet = useMutation({
    mutationFn: async () =>
      createSnippetFn({
        data: {
          event_id: eventId,
          label: "New message type",
          description: "",
          body: "",
          position: (q.data?.snippets?.length ?? 0) + 1,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eventOutreach", eventId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const patchSnippet = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) =>
      updateSnippetFn({ data: { id, patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eventOutreach", eventId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const removeSnippet = useMutation({
    mutationFn: async (id: string) => deleteSnippetFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eventOutreach", eventId] });
      toast.success("Removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-6">
      <Card className="p-5 rounded-2xl border-slate-200/70 border-l-4 border-l-indigo-500">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">LinkedIn outreach</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Templates you paste into InMail and connection requests.
            </p>
          </div>
          <Button
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
            className="rounded-full"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
        <div className="space-y-4">
          <Field
            label="InMail subject"
            value={form.inmail_subject}
            onChange={(v) => setForm((f) => ({ ...f, inmail_subject: v }))}
            placeholder="Subject line…"
          />
          <Field
            label="InMail message"
            multiline
            rows={7}
            value={form.inmail_message}
            onChange={(v) => setForm((f) => ({ ...f, inmail_message: v }))}
            placeholder="Long-form InMail body. Use *FN* as a first-name placeholder."
          />
          <Field
            label="Connection request message"
            multiline
            rows={5}
            value={form.connect_message}
            onChange={(v) => setForm((f) => ({ ...f, connect_message: v }))}
            placeholder="Short connection note (LinkedIn limit ~300 chars)."
          />
        </div>
      </Card>

      <Card className="p-5 rounded-2xl border-slate-200/70 border-l-4 border-l-amber-500">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-900">Colleague outreach</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Slack ask for a colleague to run Dux Soup, and the message they send from their profile.
          </p>
        </div>
        <div className="space-y-4">
          <Field
            label="Slack message to colleague"
            multiline
            rows={4}
            value={form.colleague_slack}
            onChange={(v) => setForm((f) => ({ ...f, colleague_slack: v }))}
          />
          <Field
            label="LinkedIn message colleague sends"
            multiline
            rows={7}
            value={form.colleague_linkedin}
            onChange={(v) => setForm((f) => ({ ...f, colleague_linkedin: v }))}
          />
        </div>
      </Card>

      <Card className="p-5 rounded-2xl border-slate-200/70 border-l-4 border-l-sky-500">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Custom message types</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Your own reusable messages for this event — VIP invites, "more information"
              replies, anything else. Add or remove them as you like.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => addSnippet.mutate()}
            disabled={addSnippet.isPending}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New message type
          </Button>
        </div>
        {(q.data?.snippets ?? []).length === 0 ? (
          <div className="text-xs text-slate-500 py-4 text-center">
            No custom message types yet.
          </div>
        ) : (
          <div className="space-y-3">
            {(q.data?.snippets ?? []).map((s: any) => (
              <SnippetCard
                key={s.id}
                row={s}
                onPatch={(patch) => patchSnippet.mutate({ id: s.id, patch })}
                onDelete={() => removeSnippet.mutate(s.id)}
                saving={patchSnippet.isPending}
              />
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5 rounded-2xl border-slate-200/70 border-l-4 border-l-emerald-500">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Saved searches</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Sales Navigator lists you use to source speakers for this event.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => addSearch.mutate()}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add
          </Button>
        </div>
        {(q.data?.searches ?? []).length === 0 && (
          <div className="text-xs text-slate-500 py-4 text-center">No saved searches yet.</div>
        )}
        <div className="space-y-2">
          {(q.data?.searches ?? []).map((s: any, idx: number, arr: any[]) => (
            <SearchRow
              key={s.id}
              row={s}
              onPatch={(patch) => patchSearch.mutate({ id: s.id, patch })}
              onDelete={() => removeSearch.mutate(s.id)}
              onMoveUp={
                idx === 0
                  ? undefined
                  : () => {
                      const prev = arr[idx - 1];
                      patchSearch.mutate({ id: s.id, patch: { position: prev.position } });
                      patchSearch.mutate({ id: prev.id, patch: { position: s.position } });
                    }
              }
              onMoveDown={
                idx === arr.length - 1
                  ? undefined
                  : () => {
                      const next = arr[idx + 1];
                      patchSearch.mutate({ id: s.id, patch: { position: next.position } });
                      patchSearch.mutate({ id: next.id, patch: { position: s.position } });
                    }
              }
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

function SearchRow({
  row,
  onPatch,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  row: { id: string; label: string; url: string | null };
  onPatch: (patch: { label?: string; url?: string }) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [label, setLabel] = useState(row.label);
  const [url, setUrl] = useState(row.url ?? "");
  useEffect(() => {
    setLabel(row.label);
    setUrl(row.url ?? "");
  }, [row.label, row.url]);
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-slate-200/70 bg-white">
      <div className="flex flex-col">
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={onMoveUp} disabled={!onMoveUp}>
          <ArrowUp className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={onMoveDown} disabled={!onMoveDown}>
          <ArrowDown className="h-3 w-3" />
        </Button>
      </div>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label !== row.label && onPatch({ label })}
        placeholder="e.g. CCOs, SF Bay Area, 10,000+"
        className="flex-1 min-w-[180px]"
      />
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => url !== (row.url ?? "") && onPatch({ url })}
        placeholder="Sales Nav URL"
        className="flex-[2]"
      />
      {url && (
        <Button asChild variant="ghost" size="sm">
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => copy(url, "URL")}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5 text-red-500" />
      </Button>
    </div>
  );
}
