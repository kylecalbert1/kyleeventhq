import { useMemo, useState } from "react";
import { Mail, ExternalLink, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { gmailComposeUrl, renderTemplate, firstNameOf } from "@/lib/gmail";

type Speaker = {
  id: string;
  name: string;
  email?: string | null;
  company?: string | null;
};

export function BulkEmailDialog({
  open,
  onOpenChange,
  speakers,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  speakers: Speaker[];
}) {
  const [subject, setSubject] = useState(
    "Quick ask for {{firstName}} — event assets",
  );
  const [body, setBody] = useState(
    "Hey {{firstName}},\n\nHope you're doing well! Could you send over your logo, headshot and short bio when you get a moment? It helps us finalise everything for the event.\n\nThanks so much!",
  );
  const [openedIds, setOpenedIds] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => {
    return speakers.map((s) => {
      const firstName = firstNameOf(s.name);
      const vars = { firstName, name: s.name, company: s.company ?? "" };
      const rSubject = renderTemplate(subject, vars);
      const rBody = renderTemplate(body, vars);
      return {
        ...s,
        firstName,
        rSubject,
        rBody,
        url: s.email
          ? gmailComposeUrl({ to: s.email, subject: rSubject, body: rBody })
          : null,
      };
    });
  }, [speakers, subject, body]);

  const missingEmail = rows.filter((r) => !r.email).length;

  function markOpened(id: string) {
    setOpenedIds((s) => ({ ...s, [id]: true }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email {speakers.length} speaker{speakers.length === 1 ? "" : "s"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            Use <code className="bg-background px-1 py-0.5 rounded">{`{{firstName}}`}</code>{" "}
            as a merge tag. Each speaker gets their own personalized draft — click
            "Open in Gmail" to launch a pre-filled compose window per person.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Subject template</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:row-span-2">
              <Label className="text-xs">Body template</Label>
              <Textarea
                rows={9}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </div>

          {missingEmail > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              {missingEmail} selected speaker{missingEmail === 1 ? " has" : "s have"} no
              email on file and will be skipped.
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Personalized previews
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-lg border p-3 transition-colors ${
                    openedIds[r.id]
                      ? "border-emerald-300 bg-emerald-50/50"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">
                        {r.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.email ?? (
                          <span className="text-amber-700">No email on file</span>
                        )}
                      </div>
                      <div className="mt-2 text-xs font-medium truncate">
                        {r.rSubject}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground whitespace-pre-line line-clamp-3">
                        {r.rBody}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {r.url ? (
                        <Button
                          asChild
                          size="sm"
                          variant={openedIds[r.id] ? "outline" : "default"}
                          onClick={() => markOpened(r.id)}
                        >
                          <a href={r.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            {openedIds[r.id] ? "Opened" : "Open in Gmail"}
                          </a>
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled>
                          No email
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <div className="text-xs text-muted-foreground mr-auto">
            {Object.keys(openedIds).filter((k) => openedIds[k]).length} of{" "}
            {rows.filter((r) => r.email).length} drafts opened
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
