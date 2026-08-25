import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyRelease } from "@/lib/tito-release-group";

export type TargetSource = "manual" | "tito_delegate_tickets";

export type WeeklyPoint = { week_start: string; count: number };

export type BreakdownItem = {
  title: string;
  tickets_count: number;
  price: number | null;
  revenue: number | null;
};

export type EventTarget = {
  id: string;
  event_id: string;
  label: string;
  target_value: number;
  source: TargetSource;
  manual_current_value: number | null;
  show_on_card: boolean;
  position: number;
  current_value: number;
  unavailable?: boolean;
  weekly?: WeeklyPoint[];
  needed_per_week?: number;
  recent_avg_per_week?: number;
  tone?: "green" | "amber" | "red";
  met?: boolean;
  breakdown?: BreakdownItem[];
  total_revenue?: number | null;
  currency?: "$" | "£";
};

function mondayOf(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7; // 0 = Monday
  x.setUTCDate(x.getUTCDate() - day);
  return x;
}

function lastWeeks(n: number): string[] {
  const start = mondayOf(new Date());
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() - i * 7);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function weeksUntil(eventDate: string | null | undefined): number {
  if (!eventDate) return 1;
  const ms = new Date(eventDate).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)));
}

type ReleaseRow = {
  title: string | null;
  tickets_count: number | null;
  event_slug: string;
  raw?: any;
};

function primaryDelegateRelease(rows: ReleaseRow[]) {
  const delegates = rows.filter((r) => classifyRelease(r.title) === "delegates");
  if (delegates.length === 0) return null;
  return [...delegates].sort((a, b) => (b.tickets_count ?? 0) - (a.tickets_count ?? 0))[0]!;
}

function currencyFromLocation(location: string | null | undefined): "$" | "£" {
  const t = (location ?? "").toLowerCase();
  const ukTerms = ["london", "manchester", "edinburgh", "birmingham", "uk", "united kingdom"];
  if (ukTerms.some((term) => t.includes(term))) return "£";
  return "$";
}

export const listEventTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<EventTarget[]> => {
    const { data: rows, error } = await context.supabase
      .from("event_targets")
      .select("*")
      .eq("event_id", data.event_id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: ev } = await context.supabase
      .from("events")
      .select("id, tito_slug, event_date")
      .eq("id", data.event_id)
      .maybeSingle();

    const slug = ev?.tito_slug ?? null;
    let releases: ReleaseRow[] = [];
    if (slug) {
      const { data: rel } = await context.supabase
        .from("tito_releases")
        .select("title, tickets_count, event_slug")
        .eq("event_slug", slug);
      releases = (rel ?? []) as ReleaseRow[];
    }
    const primary = releases.length ? primaryDelegateRelease(releases) : null;

    let weekly: WeeklyPoint[] = [];
    if (slug && primary?.title) {
      const weeks = lastWeeks(10);
      const since = weeks[0]!;
      const { data: tickets } = await context.supabase
        .from("tito_tickets")
        .select("created_at")
        .eq("event_slug", slug)
        .eq("release_title", primary.title)
        .gte("created_at", `${since}T00:00:00Z`);
      const buckets = new Map<string, number>(weeks.map((w) => [w, 0]));
      for (const t of tickets ?? []) {
        const key = mondayOf(new Date(t.created_at as string)).toISOString().slice(0, 10);
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
      weekly = weeks.map((w) => ({ week_start: w, count: buckets.get(w) ?? 0 }));
    }

    return (rows ?? []).map((r: any): EventTarget => {
      const base = {
        id: r.id as string,
        event_id: r.event_id as string,
        label: r.label as string,
        target_value: Number(r.target_value),
        source: r.source as TargetSource,
        manual_current_value:
          r.manual_current_value === null ? null : Number(r.manual_current_value),
        show_on_card: Boolean(r.show_on_card),
        position: Number(r.position),
      };

      if (base.source !== "tito_delegate_tickets") {
        const current = base.manual_current_value ?? 0;
        return { ...base, current_value: current, met: current >= base.target_value };
      }

      if (!slug || !primary) {
        return { ...base, current_value: 0, unavailable: true, weekly: [] };
      }

      const current = primary.tickets_count ?? 0;
      const met = current >= base.target_value;
      const needed = met
        ? 0
        : (base.target_value - current) / weeksUntil(ev?.event_date ?? null);
      const last3 = weekly.slice(-3);
      const recent = last3.length
        ? last3.reduce((n, w) => n + w.count, 0) / last3.length
        : 0;
      const tone: "green" | "amber" | "red" = met
        ? "green"
        : recent >= needed
          ? "green"
          : recent >= 0.7 * needed
            ? "amber"
            : "red";

      return {
        ...base,
        current_value: current,
        weekly,
        needed_per_week: Math.max(0, Math.round(needed * 10) / 10),
        recent_avg_per_week: Math.round(recent * 10) / 10,
        tone,
        met,
      };
    });
  });

export const createEventTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_id: z.string().uuid(),
        label: z.string().min(1),
        target_value: z.number(),
        source: z.enum(["manual", "tito_delegate_tickets"]).default("manual"),
        manual_current_value: z.number().nullable().optional(),
        show_on_card: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("event_targets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", data.event_id);
    const { data: row, error } = await context.supabase
      .from("event_targets")
      .insert({
        event_id: data.event_id,
        label: data.label,
        target_value: data.target_value,
        source: data.source,
        manual_current_value:
          data.source === "manual" ? (data.manual_current_value ?? 0) : null,
        show_on_card: data.show_on_card,
        position: count ?? 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateEventTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.object({
          label: z.string().min(1).optional(),
          target_value: z.number().optional(),
          manual_current_value: z.number().nullable().optional(),
          show_on_card: z.boolean().optional(),
          source: z.enum(["manual", "tito_delegate_tickets"]).optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch = { ...data.patch };
    if (patch.source === "tito_delegate_tickets") patch.manual_current_value = null;
    const { error } = await context.supabase
      .from("event_targets")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteEventTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("event_targets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type CardTarget = {
  id: string;
  event_id: string;
  label: string;
  target_value: number;
  current_value: number;
  unavailable?: boolean;
};

export const listCardTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Record<string, CardTarget[]>> => {
    const { data: rows, error } = await context.supabase
      .from("event_targets")
      .select("*")
      .eq("show_on_card", true)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return {};

    const eventIds = Array.from(new Set(rows.map((r: any) => r.event_id as string)));
    const { data: events } = await context.supabase
      .from("events")
      .select("id, tito_slug")
      .in("id", eventIds);
    const slugByEvent = new Map<string, string | null>(
      (events ?? []).map((e: any) => [e.id as string, (e.tito_slug as string | null) ?? null]),
    );
    const slugs = Array.from(
      new Set(Array.from(slugByEvent.values()).filter((s): s is string => Boolean(s))),
    );

    const bySlug = new Map<string, ReleaseRow[]>();
    if (slugs.length > 0) {
      const { data: rel } = await context.supabase
        .from("tito_releases")
        .select("title, tickets_count, event_slug")
        .in("event_slug", slugs);
      for (const r of (rel ?? []) as ReleaseRow[]) {
        const list = bySlug.get(r.event_slug) ?? [];
        list.push(r);
        bySlug.set(r.event_slug, list);
      }
    }

    const out: Record<string, CardTarget[]> = {};
    for (const r of rows as any[]) {
      const eventId = r.event_id as string;
      const source = r.source as TargetSource;
      let current = 0;
      let unavailable = false;
      if (source === "manual") {
        current = r.manual_current_value === null ? 0 : Number(r.manual_current_value);
      } else {
        const slug = slugByEvent.get(eventId) ?? null;
        const primary = slug ? primaryDelegateRelease(bySlug.get(slug) ?? []) : null;
        if (!primary) unavailable = true;
        else current = primary.tickets_count ?? 0;
      }
      const item: CardTarget = {
        id: r.id as string,
        event_id: eventId,
        label: r.label as string,
        target_value: Number(r.target_value),
        current_value: current,
        ...(unavailable ? { unavailable: true } : {}),
      };
      (out[eventId] ??= []).push(item);
    }
    return out;
  });
