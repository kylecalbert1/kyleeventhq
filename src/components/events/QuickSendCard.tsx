import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MailPlus, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { emailSendsQuery, speakersQuery } from "@/lib/queries";

export type QuickSend = { emails: string[]; templateSlug: string };

/** Template types that count as "already welcomed". */
function isWelcomeType(t: string | null | undefined): boolean {
  const s = (t ?? "").toLowerCase();
  return s.includes("welcome") || s.includes("confirmation") || s === "speaker_confirmation";
}

const CHASE_DAYS = 14;

export function QuickSendCard({
  eventId,
  onQuickSend,
}: {
  eventId: string;
  onQuickSend: (q: QuickSend) => void;
}) {
  const speakersQ = useQuery(speakersQuery(eventId));
  const sendsQ = useQuery(emailSendsQuery(eventId));

  const { welcomeEmails, chaseEmails } = useMemo(() => {
    const speakers = (speakersQ.data ?? []) as Array<{
      email: string | null;
      status: string;
      source: string | null;
      last_inbound_at?: string | null;
    }>;
    const sends = sendsQ.data ?? [];

    // Per-email: most recent send, and whether a welcome-type send exists.
    const lastSentAt = new Map<string, string>();
    const welcomed = new Set<string>();
    for (const s of sends) {
      for (const r of s.email_send_recipients ?? []) {
        const em = (r.recipient_email ?? "").trim().toLowerCase();
        if (!em) continue;
        const prev = lastSentAt.get(em);
        if (!prev || s.sent_at > prev) lastSentAt.set(em, s.sent_at);
        if (isWelcomeType(s.template_type)) welcomed.add(em);
      }
    }

    const cutoff = Date.now() - CHASE_DAYS * 24 * 60 * 60 * 1000;
    const welcome: string[] = [];
    const chase: string[] = [];

    for (const sp of speakers) {
      const em = (sp.email ?? "").trim().toLowerCase();
      if (!em) continue;

      // 1) Everyone linked to this event, whatever their source, with no
      //    welcome-type send logged yet.
      if (!welcomed.has(em) && !welcome.includes(em)) welcome.push(em);

      // 2) Same audience the current_confirmed / confirmed_not_registered
      //    groups cover: confirmed speakers plus Tito-synced registrants.
      const inChaseAudience = sp.status === "confirmed" || (sp.source ?? "") === "tito";
      if (!inChaseAudience) continue;
      const last = lastSentAt.get(em);
      if (!last) continue;
      if (new Date(last).getTime() > cutoff) continue;
      // Skip anyone who has replied since that send.
      const replied = sp.last_inbound_at ? new Date(sp.last_inbound_at).getTime() : 0;
      if (replied && replied > new Date(last).getTime()) continue;
      if (!chase.includes(em)) chase.push(em);
    }

    return { welcomeEmails: welcome, chaseEmails: chase };
  }, [speakersQ.data, sendsQ.data]);

  return (
    <Card className="rounded-2xl border-slate-200/70 p-4">
      <div className="mb-3 flex items-center gap-2">
        <MailPlus className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Quick sends</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!welcomeEmails.length}
          onClick={() =>
            onQuickSend({ emails: welcomeEmails, templateSlug: "welcome_new_joiner" })
          }
        >
          <MailPlus className="mr-1.5 h-3.5 w-3.5" />
          Email new joiners without a welcome email ({welcomeEmails.length})
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!chaseEmails.length}
          onClick={() => onQuickSend({ emails: chaseEmails, templateSlug: "checking_in" })}
        >
          <Clock className="mr-1.5 h-3.5 w-3.5" />
          Chase non-responders ({chaseEmails.length})
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Opens the usual send window with the list already filled in — nothing goes out until you
        review and send.
      </p>
    </Card>
  );
}
