import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Mail, Users, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { emailSendsQuery } from "@/lib/queries";
import { TEMPLATE_LABELS, type TemplateType } from "@/lib/email-sends.functions";
import { cn } from "@/lib/utils";

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${fmt(iso)} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

const templatePillCls: Record<TemplateType, string> = {
  confirmation: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  banner_reminder: "bg-amber-100 text-amber-900 ring-amber-200",
  bio_headshot_reminder: "bg-teal-100 text-teal-800 ring-teal-200",
  follow_up: "bg-sky-100 text-sky-800 ring-sky-200",
  custom: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function SendHistoryPanel({
  eventId,
  defaultOpen = false,
  title = "Send history",
}: {
  eventId?: string;
  defaultOpen?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const q = useQuery(emailSendsQuery(eventId));

  const sends = q.data ?? [];
  const latest = sends[0];
  const headerSummary = latest
    ? `${sends.length} batch${sends.length === 1 ? "" : "es"} (latest: ${TEMPLATE_LABELS[latest.template_type]}, ${latest.recipient_count} people, ${fmt(latest.sent_at)})`
    : `${sends.length} batches`;

  return (
    <Card className="rounded-2xl border-slate-200/70 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50/60 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
        )}
        <Mail className="h-4 w-4 text-indigo-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900">
            {title}
            {sends.length > 0 && (
              <span className="ml-1.5 text-slate-500 font-normal">— {headerSummary}</span>
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {q.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : sends.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No sends logged yet. When you send an email through the compose dialog, it'll show up here.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sends.map((s) => {
                const isOpen = !!expanded[s.id];
                return (
                  <li key={s.id} className="px-5 py-3">
                    <button
                      type="button"
                      className="w-full flex items-start gap-3 text-left"
                      onClick={() => setExpanded((x) => ({ ...x, [s.id]: !x[s.id] }))}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400 mt-1 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400 mt-1 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill
                            className={cn(templatePillCls[s.template_type], "text-[11px] font-semibold")}
                          >
                            {TEMPLATE_LABELS[s.template_type]}
                          </StatusPill>
                          <span className="text-sm font-medium text-slate-900 truncate">
                            {s.subject}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3" /> {s.recipient_count} recipient
                            {s.recipient_count === 1 ? "" : "s"}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {fmtTime(s.sent_at)}
                          </span>
                        </div>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="mt-2 ml-6 rounded-lg bg-slate-50 border border-slate-200/70 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                          Recipients
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {s.email_send_recipients.length === 0 ? (
                            <span className="text-xs text-slate-500">—</span>
                          ) : (
                            s.email_send_recipients.map((r) => (
                              <span
                                key={r.id}
                                className="inline-flex items-center rounded-full bg-white ring-1 ring-slate-200 px-2 py-0.5 text-[11px] text-slate-700"
                                title={r.recipient_email ?? undefined}
                              >
                                {r.recipient_name ?? r.recipient_email ?? "Unknown"}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
