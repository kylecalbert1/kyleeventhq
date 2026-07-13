import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { StatusPill } from "@/components/StatusPill";
import { WebsiteTaskFormDialog } from "@/components/dialogs/WebsiteTaskFormDialog";
import { websiteTasksQuery } from "@/lib/queries";
import { updateWebsiteTask } from "@/lib/website-tasks.functions";
import { WEBSITE_STAGES, labels, pillClass } from "@/lib/status";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/website")({
  loader: ({ context }) => context.queryClient.ensureQueryData(websiteTasksQuery()),
  component: WebsiteBoard,
});

function WebsiteBoard() {
  const qc = useQueryClient();
  const tasks = useQuery(websiteTasksQuery());
  const update = useServerFn(updateWebsiteTask);
  const [editing, setEditing] = useState<null | { open: boolean; task?: any }>(null);
  const [confirmMove, setConfirmMove] = useState<null | { task: any; to: string }>(null);

  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      update({ data: { id, patch: { status: status as never } } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["websiteTasks"] });
      qc.invalidateQueries({ queryKey: ["eventSummaries"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const grouped: Record<string, any[]> = { draft: [], proof_1: [], proof_2: [], amendments: [], signed_off: [], live: [] };
  (tasks.data ?? []).forEach((t: any) => grouped[t.status]?.push(t));

  function requestMove(task: any, to: string) {
    if (task.status === to) return;
    if (task.protected) setConfirmMove({ task, to });
    else move.mutate({ id: task.id, status: to });
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Website production</h1>
          <p className="text-sm text-muted-foreground">Move each event through proofing to live. Protected cards need confirmation.</p>
        </div>
        <Button onClick={() => setEditing({ open: true })}><Plus className="h-4 w-4 mr-1.5" />Add task</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
        {WEBSITE_STAGES.map((stage) => (
          <div key={stage} className="min-w-0">
            <div className="flex items-center justify-between px-1 mb-2">
              <StatusPill className={pillClass.website[stage]}>{labels.website[stage]}</StatusPill>
              <div className="text-xs text-muted-foreground">{grouped[stage].length}</div>
            </div>
            <div className="space-y-2 min-h-16">
              {grouped[stage].map((t: any) => (
                <Card key={t.id} className="p-3 hover:shadow-sm cursor-pointer" onClick={() => setEditing({ open: true, task: t })}>
                  <div className="flex items-start gap-2">
                    {t.protected && <Lock className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[10px] text-muted-foreground">{t.events?.code ?? "—"}</div>
                      <div className="font-medium text-sm truncate">{t.events?.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">{t.title || "Website task"}</div>
                      <div className="flex justify-between text-[11px] text-muted-foreground mt-2">
                        <span>{t.due_date ? new Date(t.due_date).toLocaleDateString() : "No due"}</span>
                        <span className="flex gap-1">
                          {t.buddy_proof_done && <span title="Buddy proof">B</span>}
                          {t.marketer_proof_done && <span title="Marketer proof">M</span>}
                          {t.amendments_actioned_done && <span title="Amendments actioned">A</span>}
                          {t.final_signoff_done && <span title="Final sign-off">F</span>}
                        </span>
                      </div>

                      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                        <Select value={t.status} onValueChange={(v) => requestMove(t, v)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {WEBSITE_STAGES.map((s) => <SelectItem key={s} value={s}>{labels.website[s]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {editing && <WebsiteTaskFormDialog open={editing.open} onOpenChange={(o) => setEditing(o ? editing : null)} task={editing.task} />}

      <AlertDialog open={!!confirmMove} onOpenChange={(o) => !o && setConfirmMove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move a protected task?</AlertDialogTitle>
            <AlertDialogDescription>
              This task is marked protected. Moving it may affect a locked-in schedule. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmMove) move.mutate({ id: confirmMove.task.id, status: confirmMove.to });
                setConfirmMove(null);
              }}
            >Move anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
