import { SearchableSelect } from "@/components/ui/searchable-select";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Plus, Trash2, ChevronDown, Copy, ArrowRightLeft, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusPill } from "@/components/StatusPill";
import { toast } from "sonner";
import {
  eventsQuery,
  outreachAccountsQuery,
  teamChecklistQuery,
} from "@/lib/queries";
import {
  createOutreachAccount,
  updateOutreachAccount,
  deleteOutreachAccount,
  carryForwardWeek,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
} from "@/lib/outreach.functions";
import { currentWeekStart, formatWeekLabel, shiftWeek } from "@/lib/weekly";

export const Route = createFileRoute("/_authenticated/outreach")({
  loader: ({ context }) => context.queryClient.ensureQueryData(eventsQuery),
  component: OutreachPage,
});

type Account = {
  id: string;
  week_start: string;
  account_name: string;
  owner: string | null;
  event_id: string | null;
  li_invite_template: string | null;
  inmail_template: string | null;
  camp_a_template: string | null;
  camp_b_template: string | null;
  li_invite_done: boolean;
  inmail_done: boolean;
  camp_a_done: boolean;
  camp_b_done: boolean;
  notes: string | null;
};

const ACTIONS = [
  { key: "li_invite", label: "LinkedIn Invite", color: "bg-sky-500" },
  { key: "inmail", label: "InMail", color: "bg-violet-500" },
  { key: "camp_a", label: "1st connections (A)", color: "bg-amber-500" },
  { key: "camp_b", label: "1st connections (B)", color: "bg-emerald-500" },
] as const;

const CATEGORIES = [
  { key: "sales", label: "Sales actions", color: "border-l-sky-500" },
  { key: "marketing", label: "Marketing actions", color: "border-l-violet-500" },
  { key: "content", label: "Content actions", color: "border-l-amber-500" },
  { key: "community", label: "Community actions", color: "border-l-emerald-500" },
] as const;

function OutreachPage() {
  const [week, setWeek] = useState(currentWeekStart());
  const [me, setMe] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("outreach_me") ?? "" : "",
  );
  const [onlyMine, setOnlyMine] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("outreach_me", me);
  }, [me]);

  const events = useQuery(eventsQuery);
  const accounts = useQuery(outreachAccountsQuery(week));
  const checklist = useQuery(teamChecklistQuery(week));

  const eventById = useMemo(
    () => Object.fromEntries((events.data ?? []).map((e) => [e.id, e])),
    [events.data],
  );

  const filtered: Account[] = useMemo(() => {
    const list = (accounts.data ?? []) as Account[];
    if (!onlyMine || !me.trim()) return list;
    return list.filter((a) => (a.owner ?? "").toLowerCase() === me.trim().toLowerCase());
  }, [accounts.data, onlyMine, me]);

  const totalActions = filtered.length * 4;
  const doneActions = filtered.reduce(
    (n, a) => n + (a.li_invite_done ? 1 : 0) + (a.inmail_done ? 1 : 0) + (a.camp_a_done ? 1 : 0) + (a.camp_b_done ? 1 : 0),
    0,
  );
  const pct = totalActions === 0 ? 0 : Math.round((doneActions / totalActions) * 100);

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="accent-bar mb-3" />
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Weekly outreach
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Target accounts, actions and team checklists — reset every Monday.</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-md border bg-background">
            <Button variant="ghost" size="sm" onClick={() => setWeek(shiftWeek(week, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="px-3 text-sm font-medium tabular-nums">{formatWeekLabel(week)}</div>
            <Button variant="ghost" size="sm" onClick={() => setWeek(shiftWeek(week, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setWeek(currentWeekStart())}>
            This week
          </Button>
          <CarryForwardButton week={week} />
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" />Add account
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs">My name</Label>
            <Input className="h-8 w-40" placeholder="e.g. Alex" value={me} onChange={(e) => setMe(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={onlyMine} onCheckedChange={(v) => setOnlyMine(!!v)} />
            Only accounts assigned to me
          </label>
          <div className="ml-auto flex items-center gap-3 min-w-[220px]">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-sm font-semibold tabular-nums w-16 text-right">
              {pct}% <span className="text-muted-foreground font-normal">({doneActions}/{totalActions})</span>
            </div>
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="text-sm text-muted-foreground">
            {(accounts.data ?? []).length === 0
              ? "No target accounts for this week yet."
              : "No accounts match this filter."}
          </div>
          {(accounts.data ?? []).length === 0 && (
            <Button variant="outline" className="mt-4" onClick={() => setCreating(true)}>
              Add your first account
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <AccountRow key={a.id} account={a} event={a.event_id ? eventById[a.event_id] : undefined} onEdit={() => setEditing(a)} />
          ))}
        </div>
      )}

      <TeamChecklist week={week} items={(checklist.data ?? []) as ChecklistItem[]} />

      {creating && (
        <AccountFormDialog
          open={creating}
          onOpenChange={setCreating}
          week={week}
          events={events.data ?? []}
        />
      )}
      {editing && (
        <AccountFormDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          week={week}
          events={events.data ?? []}
          account={editing}
        />
      )}
    </div>
  );
}

function CarryForwardButton({ week }: { week: string }) {
  const qc = useQueryClient();
  const carry = useServerFn(carryForwardWeek);
  const m = useMutation({
    mutationFn: () => carry({ data: { from_week: shiftWeek(week, -1), to_week: week } }),
    onSuccess: (r: { count: number }) => {
      toast.success(r.count > 0 ? `Copied ${r.count} accounts from last week` : "Nothing to copy");
      qc.invalidateQueries({ queryKey: ["outreachAccounts", week] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <Button variant="outline" size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
      <ArrowRightLeft className="h-4 w-4 mr-1" />Copy last week
    </Button>
  );
}

function AccountRow({
  account,
  event,
  onEdit,
}: {
  account: Account;
  event?: { code: string; name: string; business_line: "AIAI" | "CSC" };
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateOutreachAccount);
  const [open, setOpen] = useState(false);

  const toggle = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      update({ data: { id: account.id, patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["outreachAccounts", account.week_start] }),
  });

  const done = ACTIONS.filter((a) => (account as unknown as Record<string, boolean>)[`${a.key}_done`]).length;
  const pct = Math.round((done / 4) * 100);

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-base">{account.account_name}</div>
            {event && (
              <StatusPill className="border border-slate-300 text-slate-700 bg-white">
                {event.code}
              </StatusPill>
            )}
            {account.owner && (
              <StatusPill className="bg-indigo-50 text-indigo-700 ring-indigo-200 border border-indigo-200">
                {account.owner}
              </StatusPill>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {event ? event.name : "No linked event"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-24 text-right">
            <div className="text-sm font-semibold tabular-nums">{done}/4</div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
              <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
        {ACTIONS.map((a) => {
          const doneKey = `${a.key}_done` as keyof Account;
          const tmplKey = `${a.key}_template` as keyof Account;
          const isDone = account[doneKey] as boolean;
          const tmpl = account[tmplKey] as string | null;
          return (
            <label
              key={a.key}
              className={`flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors ${isDone ? "bg-emerald-50/60 border-emerald-200" : "hover:bg-muted/40"}`}
            >
              <Checkbox
                checked={isDone}
                onCheckedChange={(v) => toggle.mutate({ [doneKey]: !!v })}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${a.color}`} />
                  <div className={`text-xs font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>
                    {a.label}
                  </div>
                </div>
                {tmpl && (
                  <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{tmpl}</div>
                )}
              </div>
              {tmpl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={async (e) => {
                    e.preventDefault();
                    try {
                      await navigator.clipboard.writeText(tmpl);
                      toast.success("Copied");
                    } catch {
                      toast.error("Copy failed");
                    }
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              )}
            </label>
          );
        })}
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t space-y-3">
          {ACTIONS.map((a) => {
            const tmplKey = `${a.key}_template` as keyof Account;
            const tmpl = (account[tmplKey] as string | null) ?? "";
            return (
              <div key={a.key} className="space-y-1">
                <Label className="text-xs">{a.label} template</Label>
                <Textarea
                  rows={2}
                  defaultValue={tmpl}
                  onBlur={(e) => {
                    if (e.target.value !== tmpl) toggle.mutate({ [tmplKey]: e.target.value });
                  }}
                />
              </div>
            );
          })}
          {account.notes !== null && account.notes !== undefined && (
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={2}
                defaultValue={account.notes ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (account.notes ?? "")) toggle.mutate({ notes: e.target.value });
                }}
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function AccountFormDialog({
  open,
  onOpenChange,
  week,
  events,
  account,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  week: string;
  events: Array<{ id: string; code: string; name: string }>;
  account?: Account;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createOutreachAccount);
  const update = useServerFn(updateOutreachAccount);
  const del = useServerFn(deleteOutreachAccount);

  const [form, setForm] = useState({
    account_name: account?.account_name ?? "",
    owner: account?.owner ?? "",
    event_id: account?.event_id ?? "",
    li_invite_template: account?.li_invite_template ?? "",
    inmail_template: account?.inmail_template ?? "",
    camp_a_template: account?.camp_a_template ?? "",
    camp_b_template: account?.camp_b_template ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        week_start: week,
        account_name: form.account_name,
        owner: form.owner || null,
        event_id: form.event_id || null,
        li_invite_template: form.li_invite_template || null,
        inmail_template: form.inmail_template || null,
        camp_a_template: form.camp_a_template || null,
        camp_b_template: form.camp_b_template || null,
      };
      if (account) return update({ data: { id: account.id, patch: payload } });
      return create({ data: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreachAccounts", week] });
      toast.success(account ? "Updated" : "Added");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (account) await del({ data: { id: account.id } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreachAccounts", week] });
      toast.success("Deleted");
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "New target account"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Account name</Label>
            <Input required value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Owner</Label>
              <Input placeholder="Team member" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Event / product</Label>
              <SearchableSelect
                triggerClassName="w-full"
                placeholder="— none —"
                searchPlaceholder="Search events…"
                value={form.event_id}
                onValueChange={(v) => setForm({ ...form, event_id: v })}
                allowClear
                options={events.map((e) => ({
                  value: e.id,
                  label: `${e.code} — ${e.name}`,
                }))}
              />
            </div>
          </div>
          {ACTIONS.map((a) => {
            const key = `${a.key}_template` as keyof typeof form;
            return (
              <div key={a.key} className="space-y-1.5">
                <Label className="text-xs">{a.label} template</Label>
                <Textarea rows={2} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </div>
            );
          })}
          <DialogFooter className="sm:justify-between">
            <div>
              {account && (
                <Button type="button" variant="destructive" onClick={() => remove.mutate()}>
                  <Trash2 className="h-4 w-4 mr-1" />Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending || !form.account_name}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ChecklistItem = {
  id: string;
  week_start: string;
  category: "sales" | "marketing" | "content" | "community";
  text: string;
  done: boolean;
  position: number;
};

function TeamChecklist({ week, items }: { week: string; items: ChecklistItem[] }) {
  return (
    <Card className="p-5">
      <div className="text-sm font-semibold mb-1">Team checklist</div>
      <div className="text-xs text-muted-foreground mb-4">Shared actions for the week</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CATEGORIES.map((cat) => (
          <ChecklistColumn
            key={cat.key}
            week={week}
            category={cat.key}
            label={cat.label}
            colorClass={cat.color}
            items={items.filter((i) => i.category === cat.key)}
          />
        ))}
      </div>
    </Card>
  );
}

function ChecklistColumn({
  week,
  category,
  label,
  colorClass,
  items,
}: {
  week: string;
  category: "sales" | "marketing" | "content" | "community";
  label: string;
  colorClass: string;
  items: ChecklistItem[];
}) {
  const qc = useQueryClient();
  const create = useServerFn(createChecklistItem);
  const update = useServerFn(updateChecklistItem);
  const del = useServerFn(deleteChecklistItem);
  const [text, setText] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["teamChecklist", week] });

  const add = useMutation({
    mutationFn: () => create({ data: { week_start: week, category, text: text.trim() } }),
    onSuccess: () => {
      setText("");
      invalidate();
    },
  });

  const toggle = useMutation({
    mutationFn: (p: { id: string; done: boolean }) =>
      update({ data: { id: p.id, patch: { done: p.done } } }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: invalidate,
  });

  const done = items.filter((i) => i.done).length;

  return (
    <div className={`rounded-lg border-l-4 border pl-3 pr-2 py-2 ${colorClass}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground tabular-nums">{done}/{items.length}</div>
      </div>
      <div className="space-y-1 mb-2">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground italic px-1 py-1">No tasks yet</div>
        ) : (
          items.map((i) => (
            <div key={i.id} className="flex items-center gap-2 group">
              <Checkbox checked={i.done} onCheckedChange={(v) => toggle.mutate({ id: i.id, done: !!v })} />
              <div className={`flex-1 text-sm ${i.done ? "line-through text-muted-foreground" : ""}`}>{i.text}</div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100" onClick={() => remove.mutate(i.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))
        )}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate(); }}
        className="flex gap-1.5"
      >
        <Input
          className="h-8 text-sm"
          placeholder="Add a task…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button size="sm" type="submit" disabled={!text.trim() || add.isPending}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}
