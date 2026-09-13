import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { eventTitoLinksQuery } from "@/lib/queries";
import { toast } from "sonner";

type LinkKind = "speaker" | "guest";

export function TitoPassLinksCard({ eventId, hasTitoEvent }: { eventId: string; hasTitoEvent: boolean }) {
  const links = useQuery({
    ...eventTitoLinksQuery(eventId),
    enabled: hasTitoEvent,
  });
  const [copied, setCopied] = useState<LinkKind | null>(null);

  async function copyLink(kind: LinkKind, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Could not copy the link");
    }
  }

  const unavailable = !hasTitoEvent
    ? "Not available — link a Tito event first."
    : "Not available — make sure the Tito release title is configured.";

  const rows: Array<{ kind: LinkKind; label: string; url: string }> = [
    { kind: "speaker", label: "Speaker pass link", url: links.data?.speaker_pass_link ?? "" },
    { kind: "guest", label: "Guest pass link", url: links.data?.guest_pass_link ?? "" },
  ];

  return (
    <Card className="rounded-2xl border-slate-200/70 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Ticket className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Tito pass links</h2>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.kind} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground">{row.label}</div>
              {row.url ? (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{row.url}</div>
              ) : (
                <div className="mt-0.5 text-xs text-muted-foreground">{unavailable}</div>
              )}
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!row.url}
                onClick={() => copyLink(row.kind, row.url)}
              >
                {copied === row.kind ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                Copy
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!row.url} asChild={Boolean(row.url)}>
                {row.url ? (
                  <a href={row.url} target="_blank" rel="noreferrer noopener">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
                  </a>
                ) : (
                  <span><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open</span>
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}