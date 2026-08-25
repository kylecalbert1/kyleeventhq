import { PageHelp } from "@/components/PageHelp";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Users, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { emailSendsQuery, eventsQuery } from "@/lib/queries";
import { TEMPLATE_LABELS, type TemplateType } from "@/lib/email-sends.functions";
import { cn } from "@/lib/utils";
import { fuzzyFilter } from "@/lib/fuzzy-search";
import {
  SentMessagePanel,
  RecipientsPanel,
} from "@/components/email-history/SentMessagePanel";

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

const PAGE_SIZE = 25;

type PresetKey = "today" | "3d" | "7d" | "30d" | "90d" | "all" | "custom";

const PRESETS: Array<{ key: PresetKey; label: string; days: number | null }> = [
  { key: "today", label: "Today", days: 0 },
  { key: "3d", label: "Last 3 days", days: 3 },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtClock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function SentMessagesPage() {
  const sendsQ = useQuery(emailSendsQuery());
  const eventsQ = useQuery(eventsQuery);

  const [eventFilter, setEventFilter] = useState<string>("all");
  const [preset, setPreset] = useState<PresetKey>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [grouped, setGrouped] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const eventNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of eventsQ.data ?? []) {
      m.set(e.id, e.code ? `${e.name} · ${e.code}` : e.name);
    }
    return m;
  }, [eventsQ.data]);

  const eventOptions = useMemo(
    () => [
      { value: "none", label: "No event", keywords: "untagged unassigned" },
      ...(eventsQ.data ?? []).map((e) => ({
        value: e.id,
        label: e.code ? `${e.name} · ${e.code}` : e.name,
        keywords: `${e.code ?? ""} ${e.name}`,
      })),
    ],
    [eventsQ.data],
  );

  const sends = sendsQ.data ?? [];

  function applyPreset(p: PresetKey) {
    setPreset(p);
    const found = PRESETS.find((x) => x.key === p);
    if (!found) return;
    if (found.days === null) {
      setFrom("");
      setTo("");
    } else {
      setFrom(isoDaysAgo(found.days));
      setTo("");
    }
  }

  const filtered = useMemo(() => {
    const base = sends.filter((s) => {
      if (eventFilter === "none" && s.event_id) return false;
      if (eventFilter !== "all" && eventFilter !== "none" && s.event_id !== eventFilter)
        return false;
      const day = s.sent_at.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
    return fuzzyFilter(base, search, (s) => [
      s.subject,
      TEMPLATE_LABELS[s.template_type],
      s.event_id ? eventNameById.get(s.event_id) : null,
      ...s.email_send_recipients.flatMap((r) => [r.recipient_name, r.recipient_email]),
    ]);
  }, [sends, eventFilter, from, to, search, eventNameById]);

  // Any filter change resets pagination back to the first page.
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [eventFilter, from, to, search, grouped]);

  const page = filtered.slice(0, visible);
  const hasMore = filtered.length > page.length;
  const totalRecipients = filtered.reduce((n, s) => n + s.recipient_count, 0);
  const hasFilters = eventFilter !== "all" || !!from || !!to || !!search;

  const groups = useMemo(() => {
    const m = new Map<string, { label: string; rows: typeof page }>();
    for (const s of page) {
      const key = s.event_id ?? "__none";
      const label = s.event_id ? (eventNameById.get(s.event_id) ?? "Unknown event") : "No event";
      if (!m.has(key)) m.set(key, { label, rows: [] });
      m.get(key)!.rows.push(s);
    }
    return Array.from(m.values()).sort((a, b) => {
      if (a.label === "No event") return 1;
      if (b.label === "No event") return -1;
      return a.label.localeCompare(b.label);
    });
  }, [page, eventNameById]);

  const toggle = (id: string) => setExpanded((x) => ({ ...x, [id]: !x[id] }));

  function Row({ s }: { s: (typeof page)[number] }) {
    const isOpen = !!expanded[s.id];
    const evName = s.event_id ? eventNameById.get(s.event_id) : null;
    return (
      <li className="px-4">
        <button
          type="button"
          onClick={() => toggle(s.id)}
          className="group w-full flex items-baseline gap-3 py-2.5 text-left"
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground opacity-50 group-hover:opacity-100" />
          )}
          <span className="w-[112px] shrink-0 tabular-nums text-xs text-muted-foreground">
            {fmtDate(s.sent_at)}
          </span>
          <span className="w-[46px] shrink-0 tabular-nums text-xs text-muted-foreground">
            {fmtClock(s.sent_at)}
          </span>
          <span className="flex-1 min-w-0 truncate text-sm font-medium text-foreground">
            {s.subject}
          </span>
          {!grouped && (
            <span className="hidden lg:block w-[220px] shrink-0 truncate text-xs text-muted-foreground">
              {evName ?? "No event"}
            </span>
          )}
          <span className="hidden md:block w-[150px] shrink-0 truncate text-xs text-muted-foreground">
            {TEMPLATE_LABELS[s.template_type]}
          </span>
          <span className="w-[54px] shrink-0 inline-flex items-center justify-end gap-1 tabular-nums text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {s.recipient_count}
          </span>
        </button>
        {isOpen && (
          <div className="pb-3 pl-7 space-y-2">
            <SentMessagePanel subject={s.subject} body={s.body} />
            <RecipientsPanel recipients={s.email_send_recipients} />
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Sent messages</h1>
          <PageHelp
            title={"Sent messages"}
            what={
              "A searchable log of every email sent from this app, across all events, with the exact subject and body that went out."
            }
            steps={[
              "Pick a date preset, an event, or type to search subjects, people and templates.",
              "Switch to grouped view to read the log event by event.",
              "Expand a row to read the message exactly as recipients saw it.",
            ]}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {filtered.length} send{filtered.length === 1 ? "" : "s"} · {totalRecipients} recipient
          {totalRecipients === 1 ? "" : "s"}
        </p>
      </header>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              placeholder="Search subject, template, event or recipient…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SearchableSelect
            options={eventOptions}
            value={eventFilter}
            onValueChange={(v) => setEventFilter(v || "all")}
            allOption={{ value: "all", label: "All events" }}
            allowClear
            triggerClassName="h-9 w-[260px]"
            searchPlaceholder="Search events…"
            placeholder="All events"
          />
          <div className="inline-flex rounded-lg border border-border p-0.5">
            <button
              type="button"
              onClick={() => setGrouped(false)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium",
                !grouped ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              Chronological
            </button>
            <button
              type="button"
              onClick={() => setGrouped(true)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium",
                grouped ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              Group by event
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                preset === p.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPreset("custom")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              preset === "custom"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            Custom range
          </button>
          {preset === "custom" && (
            <div className="flex items-center gap-2 pl-2">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                className="h-8 w-[150px]"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                className="h-8 w-[150px]"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          )}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setEventFilter("all");
                setSearch("");
                applyPreset("all");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {sendsQ.isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No sends match these filters.
        </p>
      ) : grouped ? (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.label} className="space-y-1">
              <div className="flex items-baseline justify-between border-b border-border pb-1.5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {g.rows.length} send{g.rows.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="divide-y divide-border/60">
                {g.rows.map((s) => (
                  <Row key={s.id} s={s} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <Card className="surface-card rounded-2xl overflow-hidden py-0">
          <ul className="divide-y divide-border/60">
            {page.map((s) => (
              <Row key={s.id} s={s} />
            ))}
          </ul>
        </Card>
      )}

      {hasMore && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
            View more ({filtered.length - page.length} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}
