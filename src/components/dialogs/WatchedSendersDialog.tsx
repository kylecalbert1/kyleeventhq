import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getUserSettings, updateUserSettings } from "@/lib/user-settings.functions";

export const userSettingsQuery = queryOptions({
  queryKey: ["userSettings"],
  queryFn: () => getUserSettings(),
});

export function WatchedSendersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const settings = useQuery(userSettingsQuery);
  const save = useServerFn(updateUserSettings);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (settings.data) setEmails(settings.data.sponsor_watch_emails ?? []);
  }, [settings.data]);

  const mutation = useMutation({
    mutationFn: (list: string[]) => save({ data: { sponsor_watch_emails: list } }),
    onSuccess: () => {
      toast.success("Watched senders saved");
      qc.invalidateQueries({ queryKey: ["userSettings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  function add() {
    const v = draft.trim().toLowerCase();
    if (!v) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      toast.error("Enter a valid email address");
      return;
    }
    if (emails.includes(v)) {
      setDraft("");
      return;
    }
    const next = [...emails, v];
    setEmails(next);
    setDraft("");
    mutation.mutate(next);
  }

  function remove(email: string) {
    const next = emails.filter((e) => e !== email);
    setEmails(next);
    mutation.mutate(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Watched senders</DialogTitle>
          <DialogDescription>
            Gmail scans only look at threads from these addresses where you're a
            recipient or CC. Empty list means nothing is scanned.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="name@company.com"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button onClick={add} disabled={mutation.isPending} className="shrink-0">
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {emails.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No watched senders yet.
            </p>
          ) : (
            emails.map((e) => (
              <div
                key={e}
                className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
              >
                <span className="text-sm truncate">{e}</span>
                <button
                  type="button"
                  onClick={() => remove(e)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  aria-label={`Remove ${e}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
