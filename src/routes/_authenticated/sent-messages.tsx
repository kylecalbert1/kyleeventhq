import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Mail,
  Users,
  Clock,
  ChevronDown,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import { emailSendsQuery, eventsQuery } from "@/lib/queries";
import { TEMPLATE_LABELS, type TemplateType } from "@/lib/email-sends.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sent-messages")({
  component: SentMessagesPage,
  head: () => ({
    meta: [
      { title: "Sent messages | Event Command Center" },
      {
        name: "description",
        content:
          "Every email sent from Event Command Center across all events, filterable by event and date range.",
      },
      { property: "og:title", content: "Sent messages | Event Command Center" },
      {
        property: "og:description",
        content:
          "Every email sent from Event Command Center across all events, filterable by event and date range.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-sm text-muted-foreground">Nothing here.</div>
  ),
});

const templatePillCls: Record<TemplateType, string> = {
  confirmation: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  banner_reminder: "bg-amber-100 text-amber-900 ring-amber-200",
  bio_headshot_reminder: "bg-teal-100 text-teal-800 ring-teal-200",
  follow_up: "bg-sky-100 text-sky-800 ring-sky-200",
  custom: "bg-slate-100 text-slate-700 ring-slate-200",
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function SentMessagesPage() {
  const sendsQ = useQuery(emailSendsQuery());
  const eventsQ = useQuery(eventsQuery);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const eventNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of eventsQ.data ?? []) {
      m.set(e.id, e.code ? `${e.code} - ${e.name}` : e.name);
    }
    return m;
  }, [eventsQ.data]);

  const sends = sendsQ.data ?? [];

  const filtered = useMemo(() => {
    return sends.filter((s) => {
      if (eventFilter === "none" && s.event_id) return false;
      if (eventFilter !== "all" && eventFilter !== "none" && s.event_id !== eventFilter)
        return false;
      const day = s.sent_at.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [sends, eventFilter, from, to]);

  const totalRecipients = filtered.reduce((n, s) => n + s.recipient_count, 0);
  const hasFilters = eventFilter !== "all" || !!from || !!to;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Sent messages
          </h1>
          <p className="text-sm text-muted-foreground">
            Every email logged across all events - {filtered.length} send
            {filtered.length === 1 ? "" : "s"}, {totalRecipients} recipient
            {totalRecipients === 1 ? "" : "s"}.
          </p>
        </div>
      </header>

      <Card className="surface-card rounded-2xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 min-w-[220px]">
            <Label className="text-xs">Event</Label>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                <SelectItem value="none">No event</SelectItem>
                {(eventsQ.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.code ? `${e.code} - ${e.name}` : e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              className="h-9 w-[160px]"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              className="h-9 w-[160px]"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFrom(isoDaysAgo(14));
                setTo("");
              }}
            >
              <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
              Last 2 weeks
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFrom(isoDaysAgo(30));
                setTo("");
              }}
            >
              Last 30 days
            </Button>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEventFilter("all");
                  setFrom("");
                  setTo("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="surface-card rounded-2xl overflow-hidden">
        {sendsQ.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-sm text-muted-foreground text-center">
            No sends match these filters.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((s) => {
              const isOpen = !!expanded[s.id];
              const evName = s.event_id ? eventNameById.get(s.event_id) : null;
              return (
                <li key={s.id} className="px-5 py-3">
                  <button
                    type="button"
                    className="w-full flex items-start gap-3 text-left"
                    onClick={() =>
                      setExpanded((x) => ({ ...x, [s.id]: !x[s.id] }))
                    }
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400 mt-1 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 mt-1 shrink-0" />
                    )}
                    <Mail className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill
                          className={cn(
                            templatePillCls[s.template_type],
                            "text-[11px] font-semibold",
                          )}
                        >
                          {TEMPLATE_LABELS[s.template_type]}
                        </StatusPill>
                        <span className="text-sm font-medium text-slate-900 truncate">
                          {s.subject}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {fmtTime(s.sent_at)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" /> {s.recipient_count}{" "}
                          recipient{s.recipient_count === 1 ? "" : "s"}
                        </span>
                        <span className="truncate">
                          {evName ?? "No event"}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-2 ml-6 rounded-lg bg-slate-50 border border-slate-200/70 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                        Recipients
                      </div>
                      {s.email_send_recipients.length === 0 ? (
                        <span className="text-xs text-slate-500">-</span>
                      ) : (
                        <ul className="grid gap-1 sm:grid-cols-2">
                          {s.email_send_recipients.map((r) => (
                            <li
                              key={r.id}
                              className="text-xs text-slate-700 truncate"
                            >
                              <span className="font-medium">
                                {r.recipient_name ?? "Unknown"}
                              </span>
                              {r.recipient_email ? (
                                <span className="text-slate-500">
                                  {" "}
                                  · {r.recipient_email}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
