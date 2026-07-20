import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getContactHistoryByEmails,
  getTrackedByEmails,
} from "@/lib/email-sends.functions";

export type ContactHistory = {
  count: number;
  last_sent_at: string | null;
};

export type TrackedInfo = {
  speaker_id: string;
  event_id: string;
  event_name: string | null;
  status: string | null;
  source: string | null;
};

function normalize(emails: (string | null | undefined)[]): string[] {
  const s = new Set<string>();
  for (const e of emails) {
    const em = (e ?? "").trim().toLowerCase();
    if (em) s.add(em);
  }
  return Array.from(s).sort();
}

export function useContactHistory(emails: (string | null | undefined)[]) {
  const normalized = useMemo(() => normalize(emails), [emails]);
  const key = normalized.join("|");
  const q = useQuery({
    queryKey: ["contact-history", key],
    queryFn: () =>
      getContactHistoryByEmails({ data: { emails: normalized } }),
    enabled: normalized.length > 0,
    staleTime: 30_000,
  });
  const map = useMemo(() => {
    const m = new Map<string, ContactHistory>();
    for (const r of q.data ?? []) {
      m.set(r.email, { count: r.count, last_sent_at: r.last_sent_at });
    }
    return m;
  }, [q.data]);
  function lookup(email: string | null | undefined): ContactHistory | null {
    const em = (email ?? "").trim().toLowerCase();
    if (!em) return null;
    return map.get(em) ?? null;
  }
  return { map, lookup, isLoading: q.isLoading };
}

export function useTrackedByEmails(emails: (string | null | undefined)[]) {
  const normalized = useMemo(() => normalize(emails), [emails]);
  const key = normalized.join("|");
  const q = useQuery({
    queryKey: ["tracked-by-emails", key],
    queryFn: () => getTrackedByEmails({ data: { emails: normalized } }),
    enabled: normalized.length > 0,
    staleTime: 30_000,
  });
  const map = useMemo(() => {
    const m = new Map<string, TrackedInfo>();
    for (const r of q.data ?? []) {
      // Keep the first tracked entry per email; if there are multiple, the
      // one with the more advanced status wins so the badge reflects the
      // strongest existing signal.
      const rank = (s: string | null) =>
        s === "confirmed" ? 3 : s === "responded" ? 2 : s === "declined" ? 1 : 0;
      const cur = m.get(r.email);
      if (!cur || rank(r.status) > rank(cur.status)) {
        m.set(r.email, {
          speaker_id: r.speaker_id,
          event_id: r.event_id,
          event_name: r.event_name,
          status: r.status,
          source: r.source,
        });
      }
    }
    return m;
  }, [q.data]);
  function lookup(email: string | null | undefined): TrackedInfo | null {
    const em = (email ?? "").trim().toLowerCase();
    if (!em) return null;
    return map.get(em) ?? null;
  }
  return { map, lookup, isLoading: q.isLoading };
}

export function formatSentShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
