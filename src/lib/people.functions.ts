import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The global People directory.
 *
 * Merges everyone we have seen — via Tito registrations OR via our speaker
 * tracker — into one record per unique email (case-insensitive). Rows with
 * no email are grouped under a synthetic key based on name+company so they
 * still show up somewhere; those are always flagged as low-confidence.
 *
 * Same name + two different emails = returned as *two* separate rows plus a
 * `possibleDuplicateOfKey` pointer on each, so the UI can offer a
 * confirm-merge action instead of silently collapsing them.
 */

export type PersonAppearance = {
  kind: "tito" | "tracker";
  event_slug: string | null; // for tito
  event_id: string | null; // for tracker
  event_title: string; // human-readable
  event_start: string | null;
  business_line: "AIAI" | "CSC" | "other" | null;
  release_title: string | null; // tito ticket release ("Speaker Pass", etc)
  tracker_status: string | null; // speaker.status when kind=tracker
  is_past: boolean; // event date has passed
  source_id: string; // ticket.id or speaker.id
};

export type PersonRow = {
  key: string; // stable per person (lowercased email or synthetic)
  name: string;
  emails: string[]; // deduped, all lowercased forms we have seen
  primary_email: string | null;
  companies: string[];
  primary_company: string | null;
  job_titles: string[];
  primary_job_title: string | null;
  event_count: number;
  past_speaker_count: number; // Speaker Pass tickets OR confirmed tracker at past events
  is_confirmed_anywhere: boolean;
  is_past_speaker: boolean;
  appearances: PersonAppearance[];
  possibleDuplicateOfKey: string | null; // same name, different email → merge suggestion
};

type Filters = {
  include_other: boolean;
  business_line: "any" | "AIAI" | "CSC" | "other";
  year: number | null;
  release_kind: "any" | "speaker" | "attendee";
  tracker_status: "any" | "past_speaker" | "confirmed" | "in_tracker" | "not_in_tracker";
};

function normEmail(e: string | null | undefined): string {
  return (e ?? "").trim().toLowerCase();
}

function isSpeakerRelease(title: string | null | undefined): boolean {
  const t = (title ?? "").toLowerCase();
  return t.includes("speaker pass") || t.includes("speaker guest") || t.includes("guest pass");
}

export const listPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        include_other: z.boolean().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const includeOther = !!data.include_other;

    const [ticketsRes, speakersRes, titoEventsRes, eventsRes] = await Promise.all([
      context.supabase
        .from("tito_tickets")
        .select(
          "id,name,first_name,last_name,email,company_name,job_title,event_slug,release_title,release_slug,state",
        )
        .limit(50000),
      context.supabase
        .from("speakers")
        .select("id,name,email,company,title,event_id,status"),
      context.supabase
        .from("tito_events")
        .select("slug,title,start_date,end_date,business_line"),
      context.supabase
        .from("events")
        .select("id,code,name,event_date,business_line,tito_slug"),
    ]);
    if (ticketsRes.error) throw new Error(ticketsRes.error.message);
    if (speakersRes.error) throw new Error(speakersRes.error.message);
    if (titoEventsRes.error) throw new Error(titoEventsRes.error.message);
    if (eventsRes.error) throw new Error(eventsRes.error.message);

    const titoBySlug = new Map<string, any>();
    for (const e of titoEventsRes.data ?? []) titoBySlug.set(e.slug, e);

    // Tracker events keyed by our own uuid.
    const eventById = new Map<string, any>();
    for (const e of eventsRes.data ?? []) eventById.set(e.id, e);

    const today = Date.now();
    const isPast = (d: string | null | undefined) =>
      !!d && new Date(d).getTime() < today;

    // Filter tickets to only mapped brand events unless caller wants everything.
    const ticketRows = (ticketsRes.data ?? []).filter((t) => {
      if (t.state === "void" || t.state === "cancelled") return false;
      const ev = titoBySlug.get(t.event_slug);
      if (!ev) return false;
      if (!includeOther && ev.business_line === "other") return false;
      return true;
    });

    // Build map: key -> PersonRow.
    const rows = new Map<string, PersonRow>();
    const ensure = (key: string, seedName: string): PersonRow => {
      let r = rows.get(key);
      if (!r) {
        r = {
          key,
          name: seedName,
          emails: [],
          primary_email: null,
          companies: [],
          primary_company: null,
          job_titles: [],
          primary_job_title: null,
          event_count: 0,
          past_speaker_count: 0,
          is_confirmed_anywhere: false,
          is_past_speaker: false,
          appearances: [],
          possibleDuplicateOfKey: null,
        };
        rows.set(key, r);
      }
      return r;
    };
    const pushUnique = (arr: string[], v: string | null | undefined) => {
      const s = (v ?? "").trim();
      if (!s) return;
      if (!arr.some((x) => x.toLowerCase() === s.toLowerCase())) arr.push(s);
    };

    // 1) Tito tickets.
    for (const t of ticketRows) {
      const email = normEmail(t.email);
      const nm = (t.name ?? [t.first_name, t.last_name].filter(Boolean).join(" ")).trim() || "(no name)";
      const key = email || `noemail:${nm.toLowerCase()}::${(t.company_name ?? "").toLowerCase()}`;
      const r = ensure(key, nm);
      if (r.name === "(no name)" && nm !== "(no name)") r.name = nm;
      if (email) pushUnique(r.emails, email);
      pushUnique(r.companies, t.company_name);
      pushUnique(r.job_titles, t.job_title);
      const ev = titoBySlug.get(t.event_slug);
      const past = isPast(ev?.start_date);
      const speakerRel = isSpeakerRelease(t.release_title);
      r.appearances.push({
        kind: "tito",
        event_slug: t.event_slug,
        event_id: null,
        event_title: ev?.title ?? t.event_slug,
        event_start: ev?.start_date ?? null,
        business_line: (ev?.business_line ?? "other") as PersonRow["appearances"][number]["business_line"],
        release_title: t.release_title ?? null,
        tracker_status: null,
        is_past: past,
        source_id: t.id,
      });
      if (speakerRel && past) r.past_speaker_count++;
    }

    // 2) Tracker speakers.
    for (const s of speakersRes.data ?? []) {
      const email = normEmail(s.email);
      const nm = (s.name ?? "").trim() || "(no name)";
      const key = email || `noemail:${nm.toLowerCase()}::${(s.company ?? "").toLowerCase()}`;
      const r = ensure(key, nm);
      if (r.name === "(no name)" && nm !== "(no name)") r.name = nm;
      if (email) pushUnique(r.emails, email);
      pushUnique(r.companies, s.company);
      pushUnique(r.job_titles, s.title);
      const ev = eventById.get(s.event_id);
      const past = isPast(ev?.event_date);
      r.appearances.push({
        kind: "tracker",
        event_slug: ev?.tito_slug ?? null,
        event_id: s.event_id,
        event_title: ev ? `${ev.code} — ${ev.name}` : "(unknown event)",
        event_start: ev?.event_date ?? null,
        business_line: (ev?.business_line ?? "other") as PersonRow["appearances"][number]["business_line"],
        release_title: null,
        tracker_status: s.status ?? null,
        is_past: past,
        source_id: s.id,
      });
      if (s.status === "confirmed") {
        r.is_confirmed_anywhere = true;
        if (past) r.past_speaker_count++;
      }
    }

    // 3) Post-process: derived fields + dedupe suggestions.
    // For dupe detection: group non-noemail rows by normalized name and flag
    // whenever there are 2+ different keys under the same name.
    const byName = new Map<string, string[]>();
    for (const r of rows.values()) {
      r.event_count = r.appearances.length;
      r.primary_email = r.emails[0] ?? null;
      r.primary_company = r.companies[0] ?? null;
      r.primary_job_title = r.job_titles[0] ?? null;
      r.is_past_speaker = r.past_speaker_count > 0;
      // Sort appearances newest-first for the profile timeline.
      r.appearances.sort((a, b) => {
        const ta = a.event_start ? Date.parse(a.event_start) : 0;
        const tb = b.event_start ? Date.parse(b.event_start) : 0;
        return tb - ta;
      });
      if (!r.key.startsWith("noemail:")) {
        const nk = r.name.toLowerCase();
        if (nk && nk !== "(no name)") {
          const list = byName.get(nk) ?? [];
          list.push(r.key);
          byName.set(nk, list);
        }
      }
    }
    for (const [_, keys] of byName) {
      if (keys.length > 1) {
        // Every row in the group gets a pointer to *another* row in the group,
        // giving the UI something to show as "possible duplicate".
        for (const k of keys) {
          const other = keys.find((x) => x !== k);
          if (other) rows.get(k)!.possibleDuplicateOfKey = other;
        }
      }
    }

    return Array.from(rows.values());
  });

/** Tag someone from the directory as a prospect for a future event. */
export const tagPersonForEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        target_event_id: z.string().uuid(),
        name: z.string().min(1),
        email: z.string().nullable().optional(),
        company: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
        source_note: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Refuse if an identical email already exists for this event — avoid
    // creating dupes when a user double-clicks "tag".
    if (data.email) {
      const { data: existing } = await context.supabase
        .from("speakers")
        .select("id")
        .eq("event_id", data.target_event_id)
        .ilike("email", data.email)
        .maybeSingle();
      if (existing) {
        return { ok: true, existing: true, id: existing.id };
      }
    }
    const notes = data.source_note
      ? `Tagged from People directory.\n\n${data.source_note}`
      : "Tagged from People directory.";
    const { data: row, error } = await context.supabase
      .from("speakers")
      .insert({
        event_id: data.target_event_id,
        name: data.name,
        email: data.email ?? null,
        company: data.company ?? null,
        title: data.title ?? null,
        status: "new",
        banner_status: "not_started",
        linkedin_post_confirmed: false,
        notes,
        source: "directory",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, existing: false, id: row.id };
  });

/** Small admin: list every Tito event with its business_line for editing. */
export const listTitoEventsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tito_events")
      .select("id,slug,title,start_date,business_line")
      .order("start_date", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateTitoEventBusinessLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        business_line: z.enum(["AIAI", "CSC", "other"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tito_events")
      .update({ business_line: data.business_line })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Re-export filter type so components can share it without redeclaring.
export type PeopleFilters = Filters;
