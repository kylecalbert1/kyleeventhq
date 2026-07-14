import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TITO_BASE = "https://api.tito.io/v3";
const ACCOUNT = "sequel-media";

type TitoTicket = {
  id?: number | string;
  slug?: string;
  reference?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company_name?: string;
  state?: string;
  release_id?: number | string;
  release_slug?: string;
  release_title?: string;
  release?: { id?: number | string; slug?: string; title?: string };
  registration_id?: number | string;
  registration_slug?: string;
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

function normalizeJobTitle(t: TitoTicket): string | null {
  const answers = t.answers ?? [];
  for (const a of answers) {
    const q = (a.question?.title ?? a.question_title ?? a.title ?? "").toString().toLowerCase();
    if (!q) continue;
    if (q.includes("job title") || q === "title" || q.includes("role") || q.includes("position")) {
      const r = Array.isArray(a.response) ? a.response.join(", ") : (a.humanized_response ?? a.response);
      if (r && String(r).trim()) return String(r).trim();
    }
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
  .handler(async ({ context }) => {
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
    const dedupedEvents = Array.from(uniqueEvents.values());

    // Upsert events
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

    // 2) For each event, pull tickets (paginated)
    let ticketCount = 0;
    let answerCount = 0;
    for (const ev of events) {
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
              release_id: releaseId ? String(releaseId) : null,
              release_slug: releaseSlug,
              release_title: releaseTitle,
              registration_id:
                t.registration_id != null ? String(t.registration_id) : null,
              state: t.state ?? null,
              raw: t as unknown as import("@/integrations/supabase/types").Json,
            };
          });

        if (rows.length) {
          const { data: upserted, error } = await context.supabase
            .from("tito_tickets")
            .upsert(rows, { onConflict: "tito_ticket_id" })
            .select("id, tito_ticket_id");
          if (error) throw new Error(`tito_tickets upsert: ${error.message}`);
          ticketCount += rows.length;

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
      events: events.length,
      tickets: ticketCount,
      answers: answerCount,
    };
  });

// ============ Sourcing queries ============

const Filters = z.object({
  job_title: z.string().optional(),
  company: z.string().optional(),
  release_titles_include: z.array(z.string()).optional(),
  release_titles_exclude: z.array(z.string()).optional(),
  event_slugs: z.array(z.string()).optional(),
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
