import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Past-speakers directory.
 *
 * The purpose of the directory is re-recruiting past speakers, not browsing
 * every delegate ever. We only surface people who *actually spoke* - either a
 * Speaker Pass / Speaker Guest ticket on Tito, or a confirmed tracker record,
 * against a past-dated AIAI or CSC event. Rows without name+email are
 * excluded on principle; we never render an unnameable card.
 *
 * "attendees" mode drops the pass/status filter for the rare case Kyle wants
 * to look up a delegate by name. It is opt-in and clearly labelled in the UI.
 */

export type DirectoryAppearance = {
  kind: "tito" | "tracker";
  event_slug: string | null;
  event_id: string | null;
  event_title: string;
  event_code: string | null;
  event_start: string | null; // ISO date
  business_line: "AIAI" | "CSC" | "other" | null;
  release_title: string | null;
  tracker_status: string | null;
  is_past: boolean;
  is_speaker_role: boolean; // Speaker Pass / Guest OR confirmed tracker
};

export type DirectoryPerson = {
  key: string; // lowercased email
  name: string;
  email: string;
  company: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  emails: string[];
  most_recent_past_speaker_at: string | null; // ISO
  most_recent_past_speaker_event: string | null;
  most_recent_past_speaker_event_id: string | null;
  is_past_speaker: boolean;
  is_in_tracker: boolean;
  appearances: DirectoryAppearance[];
  possibleDuplicateOfKey: string | null;
};

function normEmail(e: string | null | undefined): string {
  return (e ?? "").trim().toLowerCase();
}

function isSpeakerReleaseTitle(title: string | null | undefined): boolean {
  const t = (title ?? "").toLowerCase();
  return t.includes("speaker pass") || t.includes("speaker guest") || t.includes("guest pass");
}

const DirectoryInput = z
  .object({
    include_attendees: z.boolean().optional(), // "search all attendees" toggle
  })
  .default({});

export const listPastSpeakers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => DirectoryInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const includeAttendees = !!data.include_attendees;
    const [ticketsRes, speakersRes, titoEventsRes, eventsRes] = await Promise.all([
      context.supabase
        .from("tito_tickets")
        .select("id,name,first_name,last_name,email,company_name,job_title,event_slug,release_title,state,raw")
        .limit(50000),
      context.supabase
        .from("speakers")
        .select("id,name,email,company,title,linkedin_url,event_id,status"),
      context.supabase
        .from("tito_events")
        .select("slug,title,start_date,business_line"),
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
    const eventById = new Map<string, any>();
    for (const e of eventsRes.data ?? []) eventById.set(e.id, e);

    const today = Date.now();
    const isPast = (d: string | null | undefined) => !!d && new Date(d).getTime() < today;

    const rows = new Map<string, DirectoryPerson>();
    const ensure = (key: string, seedName: string, seedEmail: string): DirectoryPerson => {
      let r = rows.get(key);
      if (!r) {
        r = {
          key,
          name: seedName,
          email: seedEmail,
          company: null,
          job_title: null,
          linkedin_url: null,
          emails: seedEmail ? [seedEmail] : [],
          most_recent_past_speaker_at: null,
          most_recent_past_speaker_event: null,
          most_recent_past_speaker_event_id: null,
          is_past_speaker: false,
          is_in_tracker: false,
          appearances: [],
          possibleDuplicateOfKey: null,
        };
        rows.set(key, r);
      }
      return r;
    };

    // 1) Tito tickets - only mapped AIAI/CSC events; never junk rows.
    for (const t of ticketsRes.data ?? []) {
      if (t.state === "void" || t.state === "cancelled") continue;
      const ev = titoBySlug.get(t.event_slug);
      if (!ev) continue;
      if (ev.business_line !== "AIAI" && ev.business_line !== "CSC") continue;

      const nm =
        (t.name ?? [t.first_name, t.last_name].filter(Boolean).join(" ")).trim() || "";
      const email = normEmail(t.email);
      // Hard rule: never render a card without both name AND email.
      if (!nm || !email) continue;

      const isSpeakerRole = isSpeakerReleaseTitle(t.release_title);
      const past = isPast(ev?.start_date);

      // Non-speaker attendees only surface when the caller opts in.
      if (!includeAttendees && !isSpeakerRole) continue;

      const r = ensure(email, nm, email);
      if (r.name === "" || r.name.length < nm.length) r.name = nm;
      if (!r.company && t.company_name) r.company = t.company_name;
      if (!r.job_title && t.job_title) r.job_title = t.job_title;
      // LinkedIn URL sometimes stashed in raw.metadata / answers - cheap best-effort scan.
      if (!r.linkedin_url && t.raw && typeof t.raw === "object") {
        const s = JSON.stringify(t.raw).toLowerCase();
        const m = s.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s"'\\]+/i);
        if (m) r.linkedin_url = m[0];
      }
      r.appearances.push({
        kind: "tito",
        event_slug: t.event_slug,
        event_id: null,
        event_title: ev?.title ?? t.event_slug,
        event_code: null,
        event_start: ev?.start_date ?? null,
        business_line: (ev?.business_line ?? null) as DirectoryPerson["appearances"][number]["business_line"],
        release_title: t.release_title ?? null,
        tracker_status: null,
        is_past: past,
        is_speaker_role: isSpeakerRole,
      });
      if (isSpeakerRole && past) {
        r.is_past_speaker = true;
        const startMs = ev?.start_date ? new Date(ev.start_date).getTime() : 0;
        const curMs = r.most_recent_past_speaker_at
          ? new Date(r.most_recent_past_speaker_at).getTime()
          : 0;
        if (startMs > curMs) {
          r.most_recent_past_speaker_at = ev?.start_date ?? null;
          r.most_recent_past_speaker_event = ev?.title ?? null;
        }
      }
    }

    // 2) Tracker speakers - folded in so confirmed-at-past-event counts too.
    for (const s of speakersRes.data ?? []) {
      const nm = (s.name ?? "").trim();
      const email = normEmail(s.email);
      if (!nm || !email) continue;
      const ev = eventById.get(s.event_id);
      // Skip untagged / non-AIAI-CSC events silently.
      if (!ev) continue;
      if (ev.business_line !== "AIAI" && ev.business_line !== "CSC") continue;

      const past = isPast(ev?.event_date);
      const isSpeakerRole = s.status === "confirmed"; // only confirmed counts as "spoke"
      if (!includeAttendees && !(isSpeakerRole && past)) continue;

      const r = ensure(email, nm, email);
      r.is_in_tracker = true;
      if (r.name === "" || r.name.length < nm.length) r.name = nm;
      if (!r.company && s.company) r.company = s.company;
      if (!r.job_title && s.title) r.job_title = s.title;
      if (!r.linkedin_url && s.linkedin_url) r.linkedin_url = s.linkedin_url;
      r.appearances.push({
        kind: "tracker",
        event_slug: ev?.tito_slug ?? null,
        event_id: s.event_id,
        event_title: ev ? `${ev.code} - ${ev.name}` : "(unknown event)",
        event_code: ev?.code ?? null,
        event_start: ev?.event_date ?? null,
        business_line: (ev?.business_line ?? null) as DirectoryPerson["appearances"][number]["business_line"],
        release_title: null,
        tracker_status: s.status ?? null,
        is_past: past,
        is_speaker_role: isSpeakerRole,
      });
      if (isSpeakerRole && past) {
        r.is_past_speaker = true;
        const startMs = ev?.event_date ? new Date(ev.event_date).getTime() : 0;
        const curMs = r.most_recent_past_speaker_at
          ? new Date(r.most_recent_past_speaker_at).getTime()
          : 0;
        if (startMs > curMs) {
          r.most_recent_past_speaker_at = ev?.event_date ?? null;
          r.most_recent_past_speaker_event = ev ? `${ev.code} - ${ev.name}` : null;
          r.most_recent_past_speaker_event_id = s.event_id;
        }
      }
    }

    // 3) Sort each timeline newest-first, and detect fuzzy dupes by name only.
    const byName = new Map<string, string[]>();
    for (const r of rows.values()) {
      r.appearances.sort((a, b) => {
        const ta = a.event_start ? Date.parse(a.event_start) : 0;
        const tb = b.event_start ? Date.parse(b.event_start) : 0;
        return tb - ta;
      });
      const nk = r.name.toLowerCase();
      if (!nk) continue;
      const list = byName.get(nk) ?? [];
      list.push(r.key);
      byName.set(nk, list);
    }
    for (const [, keys] of byName) {
      if (keys.length > 1) {
        for (const k of keys) {
          const other = keys.find((x) => x !== k);
          if (other) rows.get(k)!.possibleDuplicateOfKey = other;
        }
      }
    }

    return Array.from(rows.values());
  });

/** Bulk tag directory people as prospects for a future event. */
export const tagDirectoryForEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        target_event_id: z.string().uuid(),
        people: z
          .array(
            z.object({
              name: z.string().min(1),
              email: z.string().min(1),
              company: z.string().nullable().optional(),
              title: z.string().nullable().optional(),
              past_event_name: z.string().nullable().optional(),
            }),
          )
          .min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const emails = data.people.map((p) => p.email.toLowerCase());
    const { data: existing } = await context.supabase
      .from("speakers")
      .select("email")
      .eq("event_id", data.target_event_id)
      .in("email", emails);
    const already = new Set((existing ?? []).map((r: any) => (r.email ?? "").toLowerCase()));

    const toInsert = data.people
      .filter((p) => !already.has(p.email.toLowerCase()))
      .map((p) => ({
        event_id: data.target_event_id,
        name: p.name,
        email: p.email,
        company: p.company ?? null,
        title: p.title ?? null,
        status: "new" as const,
        banner_status: "not_started" as const,
        linkedin_post_confirmed: false,
        notes: p.past_event_name
          ? `Tagged from past speakers. Previously spoke at ${p.past_event_name}.`
          : "Tagged from past speakers.",
        source: "directory",
      }));
    if (toInsert.length === 0) return { ok: true, inserted: 0, skipped: already.size };
    const { error } = await context.supabase.from("speakers").insert(toInsert);
    if (error) throw new Error(error.message);
    return { ok: true, inserted: toInsert.length, skipped: already.size };
  });

/** Admin: list & re-tag Tito events by business_line. Kept here so the settings dialog can call it. */
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
    z.object({ id: z.string().uuid(), business_line: z.enum(["AIAI", "CSC", "other"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tito_events")
      .update({ business_line: data.business_line })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
