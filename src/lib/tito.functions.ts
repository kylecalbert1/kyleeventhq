import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TITO_BASE = "https://api.tito.io/v3";
const ACCOUNT = "sequel-media";

// Kyle only manages AIAI (AI Accelerator Institute) + CSC (Customer Success
// Collective) brands. Match by case-insensitive SUBSTRING on these keyword
// fragments so variants like "Agentic AI in Financial Services Summit"
// still catch under "agentic ai". Keep fragments distinctive enough that
// unrelated PMA brands (Product Marketing, Sales Enablement, RevOps, CFO,
// AI for Marketers, etc) don't accidentally match.
const AIAI_CSC_KEYWORDS = [
  // AIAI
  "generative ai summit",
  "agentic ai",
  "chief ai officer summit",
  // CSC
  "customer success summit",
  "chief customer officer summit",
  "customer support summit",
];

function matchesAiaiCsc(title: string | undefined | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return AIAI_CSC_KEYWORDS.some((p) => t.includes(p));
}


type TitoTicket = {
  id?: number | string;
  slug?: string;
  reference?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company_name?: string;
  job_title?: string | null;
  state?: string;
  release_id?: number | string;
  release_slug?: string;
  release_title?: string;
  release?: { id?: number | string; slug?: string; title?: string };
  registration_id?: number | string;
  registration_slug?: string;
  billing_address?: {
    city?: string | null;
    country?: string | null;
    country_name?: string | null;
    region?: string | null;
    state?: string | null;
  } | null;
  metadata?: Record<string, unknown> | null;
  answers?: Array<{
    id?: number | string;
    question_id?: number | string;
    question?: { id?: number | string; title?: string };
    question_title?: string;
    title?: string;
    response?: string | string[];
    humanized_response?: string;
  }>;
};

type TitoEvent = {
  id?: number | string;
  slug: string;
  title: string;
  start_date?: string;
  end_date?: string;
};

async function titoFetch(path: string, token: string, params?: Record<string, string | number>) {
  const url = new URL(`${TITO_BASE}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Token token=${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Tito ${res.status} ${res.statusText} @ ${path}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function answerText(a: NonNullable<TitoTicket["answers"]>[number]): string {
  const r = Array.isArray(a.response) ? a.response.join(", ") : (a.humanized_response ?? a.response);
  return r ? String(r).trim() : "";
}

function normalizeJobTitle(t: TitoTicket): string | null {
  // Tito exposes job_title as a top-level field on the ticket — this is the
  // canonical source. Fall back to matching a job-title-style question only
  // when the top-level field is empty.
  const top = (t.job_title ?? "").toString().trim();
  if (top) return top;
  for (const a of t.answers ?? []) {
    const q = (a.question?.title ?? a.question_title ?? a.title ?? "").toString().toLowerCase();
    if (!q) continue;
    if (
      q.includes("job title") ||
      q === "title" ||
      q.includes("your role") ||
      q.includes("your position") ||
      q.includes("what do you do") ||
      q.includes("designation")
    ) {
      const v = answerText(a);
      if (v) return v;
    }
  }
  return null;
}

function normalizeLocation(t: TitoTicket): string | null {
  // 1) Custom question answers matching location-style prompts
  for (const a of t.answers ?? []) {
    const q = (a.question?.title ?? a.question_title ?? a.title ?? "").toString().toLowerCase();
    if (!q) continue;
    if (
      q.includes("location") ||
      q.includes("city") ||
      q.includes("country") ||
      q.includes("based in") ||
      q.includes("where are you")
    ) {
      const v = answerText(a);
      if (v) return v;
    }
  }
  // 2) Billing address fallback
  const b = t.billing_address ?? null;
  if (b) {
    const parts = [b.city, b.region ?? b.state, b.country_name ?? b.country]
      .map((x) => (x ?? "").toString().trim())
      .filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  return null;
}


export const titoConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    connected: Boolean(process.env.TITO_API_TOKEN),
  }));

export const syncTito = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ force: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const force = Boolean(data.force);
    const token = process.env.TITO_API_TOKEN;
    if (!token) throw new Error("Missing TITO_API_TOKEN — add it in Project Settings → Secrets.");

    // 1) Enumerate events (current + past)
    const events: TitoEvent[] = [];
    for (const path of [`/${ACCOUNT}/events`, `/${ACCOUNT}/events/past`]) {
      let page = 1;
      while (true) {
        const body = (await titoFetch(path, token, { page, per_page: 100 })) as {
          events?: TitoEvent[];
          meta?: { next_page?: number | null; total_pages?: number };
        };
        const batch = body.events ?? [];
        events.push(...batch);
        const next = body.meta?.next_page;
        if (!next || batch.length === 0) break;
        page = Number(next);
      }
    }

    // Dedupe by slug — an event can appear in both /events and /events/past
    // during the transition window; Postgres rejects two rows with the same
    // conflict key in one INSERT...ON CONFLICT statement.
    const uniqueEvents = new Map<string, TitoEvent>();
    for (const e of events) {
      if (!e.slug) continue;
      uniqueEvents.set(e.slug, e); // last occurrence wins (past overrides current)
    }
    const allEvents = Array.from(uniqueEvents.values());

    // Load manual overrides (include / exclude specific slugs).
    const { data: filterRows, error: filterErr } = await context.supabase
      .from("tito_event_filters" as never)
      .select("event_slug, mode") as unknown as {
        data: Array<{ event_slug: string; mode: "include" | "exclude" }> | null;
        error: { message: string } | null;
      };
    if (filterErr) throw new Error(`tito_event_filters: ${filterErr.message}`);
    const manualInclude = new Set(
      (filterRows ?? []).filter((r) => r.mode === "include").map((r) => r.event_slug),
    );
    const manualExclude = new Set(
      (filterRows ?? []).filter((r) => r.mode === "exclude").map((r) => r.event_slug),
    );

    // AIAI/CSC brands only — exact-phrase keyword match, plus manual overrides.
    const dedupedEvents = allEvents.filter((e) => {
      if (!e.slug) return false;
      if (manualExclude.has(e.slug)) return false;
      if (manualInclude.has(e.slug)) return true;
      return matchesAiaiCsc(e.title);
    });
    const skipped = allEvents.length - dedupedEvents.length;

    // Load prior sync state so we can skip re-fetching past events whose
    // ticket data won't change (unless force=true).
    const { data: priorRows } = await context.supabase
      .from("tito_events")
      .select("slug, last_synced_at, is_past");
    const priorBySlug = new Map(
      (priorRows ?? []).map((r) => [r.slug, r] as const),
    );

    // Upsert event metadata every time (cheap) so newly-added events and
    // events that flipped from upcoming→past get picked up.
    const eventRows = dedupedEvents.map((e) => ({
      slug: e.slug,
      title: e.title ?? e.slug,
      start_date: e.start_date ?? null,
      end_date: e.end_date ?? null,
      is_past: Boolean(e.end_date && new Date(e.end_date) < new Date()),
      last_synced_at: new Date().toISOString(),
    }));
    if (eventRows.length) {
      const { error } = await context.supabase
        .from("tito_events")
        .upsert(eventRows, { onConflict: "slug" });
      if (error) throw new Error(`tito_events upsert: ${error.message}`);
    }

    let ticketCount = 0;
    let answerCount = 0;
    let ticketFetchSkipped = 0;
    for (const ev of dedupedEvents) {
      const isPast = Boolean(ev.end_date && new Date(ev.end_date) < new Date());
      const prior = priorBySlug.get(ev.slug);
      // Skip re-fetching tickets for past events already synced at least once —
      // their attendee list is frozen. Force overrides this.
      if (!force && isPast && prior?.last_synced_at) {
        ticketFetchSkipped++;
        continue;
      }

      let page = 1;
      while (true) {
        const body = (await titoFetch(`/${ACCOUNT}/${ev.slug}/tickets`, token, {
          page,
          per_page: 100,
        })) as {
          tickets?: TitoTicket[];
          meta?: { next_page?: number | null };
        };
        const tickets = body.tickets ?? [];
        if (tickets.length === 0) break;

        const rows = tickets
          .filter((t) => t.id != null)
          .map((t) => {
            const releaseTitle = t.release_title ?? t.release?.title ?? null;
            const releaseSlug = t.release_slug ?? t.release?.slug ?? null;
            const releaseId = t.release_id ?? t.release?.id ?? null;
            return {
              tito_ticket_id: String(t.id),
              event_slug: ev.slug,
              event_title: ev.title,
              name:
                t.name ??
                ([t.first_name, t.last_name].filter(Boolean).join(" ").trim() || null),
              first_name: t.first_name ?? null,
              last_name: t.last_name ?? null,
              email: t.email ?? null,
              company_name: t.company_name ?? null,
              job_title: normalizeJobTitle(t),
              location: normalizeLocation(t),
              release_id: releaseId ? String(releaseId) : null,
              release_slug: releaseSlug,
              release_title: releaseTitle,
              registration_id:
                t.registration_id != null ? String(t.registration_id) : null,
              state: t.state ?? null,
              raw: t as unknown as import("@/integrations/supabase/types").Json,
            };
          });

        // Dedupe by tito_ticket_id in case pagination overlaps or the API
        // returns the same ticket twice within one event's fetch.
        const uniqueRows = new Map<string, (typeof rows)[number]>();
        for (const r of rows) uniqueRows.set(r.tito_ticket_id, r);
        const dedupedRows = Array.from(uniqueRows.values());

        if (dedupedRows.length) {
          const { data: upserted, error } = await context.supabase
            .from("tito_tickets")
            .upsert(dedupedRows, { onConflict: "tito_ticket_id" })
            .select("id, tito_ticket_id");
          if (error) throw new Error(`tito_tickets upsert: ${error.message}`);
          ticketCount += dedupedRows.length;

          // Rebuild answers for these tickets
          const idMap = new Map((upserted ?? []).map((r) => [r.tito_ticket_id, r.id]));
          const ticketDbIds = Array.from(idMap.values());
          if (ticketDbIds.length) {
            await context.supabase
              .from("tito_answers")
              .delete()
              .in("ticket_id", ticketDbIds);
          }

          const answerRows: Array<{
            ticket_id: string;
            question_id: string | null;
            question_title: string | null;
            response: string | null;
          }> = [];
          for (const t of tickets) {
            const dbId = idMap.get(String(t.id));
            if (!dbId) continue;
            for (const a of t.answers ?? []) {
              const qTitle = (a.question?.title ?? a.question_title ?? a.title ?? null) as
                | string
                | null;
              const qId = (a.question?.id ?? a.question_id ?? null) as
                | string
                | number
                | null;
              const resp = Array.isArray(a.response)
                ? a.response.join(", ")
                : ((a.humanized_response ?? a.response ?? "") as string);
              if (!qTitle && !resp) continue;
              answerRows.push({
                ticket_id: dbId,
                question_id: qId != null ? String(qId) : null,
                question_title: qTitle,
                response: resp ? String(resp) : null,
              });
            }
          }
          if (answerRows.length) {
            const { error: ansErr } = await context.supabase
              .from("tito_answers")
              .insert(answerRows);
            if (ansErr) throw new Error(`tito_answers insert: ${ansErr.message}`);
            answerCount += answerRows.length;
          }
        }

        const next = body.meta?.next_page;
        if (!next) break;
        page = Number(next);
      }
    }

    return {
      ok: true,
      events: dedupedEvents.length,
      events_total_seen: allEvents.length,
      events_skipped: skipped,
      events_ticket_fetch_skipped: ticketFetchSkipped,
      tickets: ticketCount,
      answers: answerCount,
      forced: force,
    };

  });

// ============ Event filter overrides ============

export const listTitoEventFilters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("tito_event_filters")
      .select("*")
      .order("mode")
      .order("event_slug");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      event_slug: string;
      mode: "include" | "exclude";
      notes: string | null;
      created_at: string;
    }>;
  });

export const addTitoEventFilter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_slug: z.string().min(1),
        mode: z.enum(["include", "exclude"]),
        notes: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any)
      .from("tito_event_filters")
      .upsert(
        {
          event_slug: data.event_slug.trim(),
          mode: data.mode,
          notes: data.notes ?? null,
        },
        { onConflict: "event_slug,mode" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteTitoEventFilter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("tito_event_filters")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Preview which raw Tito events would match the current AIAI/CSC keyword
// rules + manual overrides — useful to sanity-check the filter list.
export const previewTitoEventClassification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const token = process.env.TITO_API_TOKEN;
    if (!token) throw new Error("Missing TITO_API_TOKEN.");
    const events: TitoEvent[] = [];
    for (const path of [`/${ACCOUNT}/events`, `/${ACCOUNT}/events/past`]) {
      let page = 1;
      while (true) {
        const body = (await titoFetch(path, token, { page, per_page: 100 })) as {
          events?: TitoEvent[];
          meta?: { next_page?: number | null };
        };
        const batch = body.events ?? [];
        events.push(...batch);
        const next = body.meta?.next_page;
        if (!next || batch.length === 0) break;
        page = Number(next);
      }
    }
    const uniq = new Map<string, TitoEvent>();
    for (const e of events) if (e.slug) uniq.set(e.slug, e);

    const { data: filterRows } = (await (context.supabase as any)
      .from("tito_event_filters")
      .select("event_slug, mode")) as {
      data: Array<{ event_slug: string; mode: "include" | "exclude" }> | null;
    };
    const manualInc = new Set((filterRows ?? []).filter((r) => r.mode === "include").map((r) => r.event_slug));
    const manualExc = new Set((filterRows ?? []).filter((r) => r.mode === "exclude").map((r) => r.event_slug));

    return Array.from(uniq.values()).map((e) => {
      const kw = matchesAiaiCsc(e.title);
      const excluded = manualExc.has(e.slug!);
      const included = manualInc.has(e.slug!);
      const willSync = excluded ? false : included || kw;
      return {
        slug: e.slug!,
        title: e.title ?? e.slug!,
        start_date: e.start_date ?? null,
        end_date: e.end_date ?? null,
        keyword_match: kw,
        manual_include: included,
        manual_exclude: excluded,
        will_sync: willSync,
      };
    });
  });


// ============ Sourcing queries ============

const Filters = z.object({
  job_title: z.string().optional(),
  company: z.string().optional(),
  release_titles_include: z.array(z.string()).optional(),
  release_titles_exclude: z.array(z.string()).optional(),
  event_slugs: z.array(z.string()).optional(),
  event_date_from: z.string().optional(), // YYYY-MM-DD, inclusive, on tito_events.start_date
  event_date_to: z.string().optional(),   // YYYY-MM-DD, inclusive, on tito_events.start_date
  apply_exclude_list: z.boolean().optional(),
  limit: z.number().int().min(1).max(2000).optional(),
});


export const listTitoEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tito_events")
      .select("*")
      .order("start_date", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listReleaseTitles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tito_tickets")
      .select("release_title")
      .not("release_title", "is", null)
      .limit(5000);
    if (error) throw new Error(error.message);
    const seen = new Set<string>();
    for (const r of data ?? []) if (r.release_title) seen.add(r.release_title);
    return Array.from(seen).sort();
  });

export const searchTitoTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Filters.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("tito_tickets")
      .select("*")
      .order("event_title", { ascending: true })
      .limit(data.limit ?? 500);

    if (data.company) q = q.ilike("company_name", `%${data.company}%`);
    if (data.job_title) q = q.ilike("job_title", `%${data.job_title}%`);
    if (data.event_slugs?.length) q = q.in("event_slug", data.event_slugs);
    if (data.release_titles_include?.length)
      q = q.in("release_title", data.release_titles_include);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let out = rows ?? [];

    if (data.release_titles_exclude?.length) {
      const ex = new Set(data.release_titles_exclude);
      out = out.filter((r) => !r.release_title || !ex.has(r.release_title));
    }

    if (data.apply_exclude_list) {
      const { data: exc } = await context.supabase
        .from("excluded_companies")
        .select("company_name");
      const excSet = new Set((exc ?? []).map((r) => r.company_name.toLowerCase().trim()));
      out = out.filter(
        (r) => !r.company_name || !excSet.has(r.company_name.toLowerCase().trim()),
      );
    }

    // Also fetch job title from answers if missing (fallback search)
    if (data.job_title) {
      const kw = data.job_title.toLowerCase();
      // If the column already contained the keyword we're fine; otherwise
      // also match rows where an answer contains it.
      const missing = out.filter((r) => !(r.job_title ?? "").toLowerCase().includes(kw));
      if (missing.length && out.length < (data.limit ?? 500)) {
        const ids = missing.map((r) => r.id);
        const { data: ansRows } = await context.supabase
          .from("tito_answers")
          .select("ticket_id, response, question_title")
          .in("ticket_id", ids)
          .ilike("response", `%${data.job_title}%`);
        const hitIds = new Set((ansRows ?? []).map((r) => r.ticket_id));
        out = out.filter(
          (r) => (r.job_title ?? "").toLowerCase().includes(kw) || hitIds.has(r.id),
        );
      }
    }

    return out;
  });

// ============ Exclude list ============

export const listExcludedCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("excluded_companies")
      .select("*")
      .order("company_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addExcludedCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ company_name: z.string().min(1), notes: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("excluded_companies")
      .upsert({ company_name: data.company_name.trim(), notes: data.notes ?? null }, {
        onConflict: "company_name",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteExcludedCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("excluded_companies")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Tagging as speaker candidates ============

export const tagAsSpeakerCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_id: z.string().uuid(),
        ticket_ids: z.array(z.string().uuid()).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: tickets, error } = await context.supabase
      .from("tito_tickets")
      .select("id, name, first_name, last_name, email, company_name, job_title")
      .in("id", data.ticket_ids);
    if (error) throw new Error(error.message);
    if (!tickets?.length) return { added: 0, skipped: 0 };

    // Skip tickets already tagged for this event
    const { data: existing } = await context.supabase
      .from("speakers")
      .select("source_ticket_id")
      .eq("event_id", data.event_id)
      .in("source_ticket_id", data.ticket_ids);
    const existingSet = new Set((existing ?? []).map((r) => r.source_ticket_id).filter(Boolean));

    const rows = tickets
      .filter((t) => !existingSet.has(t.id))
      .map((t) => ({
        event_id: data.event_id,
        name: t.name || [t.first_name, t.last_name].filter(Boolean).join(" ") || "Unnamed",
        company: t.company_name,
        title: t.job_title,
        email: t.email,
        status: "contacted" as const,
        banner_status: "not_started" as const,
        linkedin_post_confirmed: false,
        source: "tito_candidate",
        source_ticket_id: t.id,
      }));

    if (!rows.length) return { added: 0, skipped: tickets.length };

    const { error: insErr } = await context.supabase.from("speakers").insert(rows);
    if (insErr) throw new Error(insErr.message);
    return { added: rows.length, skipped: tickets.length - rows.length };
  });

// ============ AI Draft generator (no sending) ============

export const generateOutreachDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        ticket_ids: z.array(z.string().uuid()).min(1).max(25),
        event_context: z.string().min(1),
        angle: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { data: tickets, error } = await context.supabase
      .from("tito_tickets")
      .select("id, name, first_name, email, company_name, job_title, event_title, release_title")
      .in("id", data.ticket_ids);
    if (error) throw new Error(error.message);
    if (!tickets?.length) return { drafts: [] };

    const listing = tickets
      .map(
        (t, i) =>
          `#${i + 1} | name="${t.first_name || t.name || ""}" | company="${t.company_name ?? ""}" | title="${t.job_title ?? ""}" | attended="${t.event_title ?? ""}" (${t.release_title ?? ""})`,
      )
      .join("\n");

    const prompt = `Write a short, warm, personalized outreach draft (max ~90 words) for each attendee below inviting them as a potential speaker candidate for: "${data.event_context}". ${data.angle ? `Angle: ${data.angle}.` : ""} Reference something concrete (their role/company + the event they previously attended). No hype. Sign-off "Kyle". Return STRICT JSON: {"drafts":[{"n":1,"subject":"...","body":"..."}, ...]} — one per input in order.\n\nAttendees:\n${listing}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You write concise, human outreach drafts. No em-dashes, no clichés." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("AI rate limit — try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted — top up in Settings.");
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content ?? "{}";
    let parsed: { drafts?: Array<{ n?: number; subject?: string; body?: string }> } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      /* ignore */
    }
    const drafts = tickets.map((t, i) => {
      const match = parsed.drafts?.find((d) => Number(d.n) === i + 1);
      return {
        ticket_id: t.id,
        name: t.name || t.first_name || "",
        email: t.email ?? null,
        company: t.company_name ?? null,
        subject: match?.subject ?? `Speaker invitation — ${data.event_context}`,
        body: match?.body ?? "",
      };
    });
    return { drafts };
  });
