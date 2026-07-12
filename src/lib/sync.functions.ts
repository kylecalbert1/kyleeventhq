import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CAL_GATEWAY =
  "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";
const GMAIL_GATEWAY =
  "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1";

function domainOf(email: string | null | undefined) {
  if (!email) return "";
  const m = email.toLowerCase().match(/@([^>\s]+)/);
  return m?.[1] ?? "";
}

export const checkCalendarConnected = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    connected: Boolean(
      process.env.LOVABLE_API_KEY && process.env.GOOGLE_CALENDAR_API_KEY,
    ),
  }));

export const checkGmailSyncConnected = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    connected: Boolean(
      process.env.LOVABLE_API_KEY && process.env.GOOGLE_MAIL_API_KEY,
    ),
  }));

// ============ CALENDAR SYNC ============

export const fetchLeadSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ pastDays: z.number().default(30), futureDays: z.number().default(60) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const calKey = process.env.GOOGLE_CALENDAR_API_KEY;
    if (!lovableKey || !calKey) {
      return { connected: false as const, suggestions: [] };
    }

    const now = Date.now();
    const timeMin = new Date(now - data.pastDays * 86400_000).toISOString();
    const timeMax = new Date(now + data.futureDays * 86400_000).toISOString();

    const url = new URL(`${CAL_GATEWAY}/calendars/primary/events`);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("maxResults", "100");
    url.searchParams.set("orderBy", "startTime");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": calKey,
      },
    });
    if (!res.ok) {
      const t = await res.text();
      console.error(`Calendar list failed [${res.status}]: ${t}`);
      throw new Error(`Calendar request failed (${res.status})`);
    }
    const body = (await res.json()) as {
      items?: Array<{
        id: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        organizer?: { email?: string };
        attendees?: Array<{ email?: string; displayName?: string; self?: boolean; organizer?: boolean; responseStatus?: string }>;
      }>;
    };

    // Own domain: derive from organizer.self or the calendar owner (first self attendee)
    const ownDomains = new Set<string>();
    for (const ev of body.items ?? []) {
      const selfAttendee = ev.attendees?.find((a) => a.self);
      if (selfAttendee?.email) ownDomains.add(domainOf(selfAttendee.email));
      if (ev.organizer?.email) {
        // heuristic: organizer often on own domain
        // don't add unconditionally; only if it also appears as self somewhere
      }
    }
    // If we still know none, fall back to organizer of first event
    if (ownDomains.size === 0 && body.items?.[0]?.organizer?.email) {
      ownDomains.add(domainOf(body.items[0].organizer.email));
    }

    // Load existing speakers to filter
    const { data: existing, error } = await context.supabase
      .from("speakers")
      .select("email");
    if (error) throw new Error(error.message);
    const knownEmails = new Set(
      (existing ?? [])
        .map((s) => (s.email ?? "").toLowerCase().trim())
        .filter(Boolean),
    );

    type Suggestion = {
      email: string;
      name: string | null;
      events: Array<{ id: string; title: string; when: string }>;
    };
    const byEmail = new Map<string, Suggestion>();

    for (const ev of body.items ?? []) {
      const when = ev.start?.dateTime ?? ev.start?.date ?? "";
      for (const a of ev.attendees ?? []) {
        const email = (a.email ?? "").toLowerCase().trim();
        if (!email || a.self) continue;
        const dom = domainOf(email);
        if (ownDomains.has(dom)) continue;
        if (knownEmails.has(email)) continue;
        if (a.responseStatus === "declined") continue;
        let s = byEmail.get(email);
        if (!s) {
          s = { email, name: a.displayName ?? null, events: [] };
          byEmail.set(email, s);
        }
        s.events.push({ id: ev.id, title: ev.summary ?? "(untitled)", when });
      }
    }

    return {
      connected: true as const,
      ownDomains: Array.from(ownDomains),
      suggestions: Array.from(byEmail.values()).sort((a, b) =>
        (a.name ?? a.email).localeCompare(b.name ?? b.email),
      ),
    };
  });

// ============ EMAIL SYNC ============

async function gmailSearch(
  query: string,
  lovableKey: string,
  gmailKey: string,
  max = 25,
) {
  const url = new URL(`${GMAIL_GATEWAY}/users/me/messages`);
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(max));
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmailKey,
    },
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`Gmail search failed [${res.status}] q=${query}: ${t}`);
    throw new Error(`Gmail search failed (${res.status})`);
  }
  return (await res.json()) as { messages?: Array<{ id: string; threadId: string }> };
}

async function gmailGetThread(threadId: string, lovableKey: string, gmailKey: string) {
  const res = await fetch(
    `${GMAIL_GATEWAY}/users/me/threads/${threadId}?format=full`,
    {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmailKey,
      },
    },
  );
  if (!res.ok) {
    const t = await res.text();
    console.error(`Gmail thread failed [${res.status}]: ${t}`);
    throw new Error(`Gmail thread failed (${res.status})`);
  }
  return (await res.json()) as {
    id: string;
    messages: Array<{
      id: string;
      internalDate: string;
      payload: {
        headers: Array<{ name: string; value: string }>;
        mimeType?: string;
        body?: { data?: string };
        parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: any[] }>;
      };
    }>;
  };
}

function decodeB64Url(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(b64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function extractText(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data)
    return decodeB64Url(payload.body.data);
  if (payload.parts) {
    for (const p of payload.parts) {
      const t = extractText(p);
      if (t) return t;
    }
  }
  if (payload.body?.data) return decodeB64Url(payload.body.data);
  return "";
}

function header(headers: Array<{ name: string; value: string }>, name: string) {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

const ClassifySchema = z.object({
  suggested_status: z.enum(["confirmed", "declined", "needs_approval", "unclear"]),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
  needs: z.object({
    bio: z.boolean(),
    headshot: z.boolean(),
    banner: z.boolean(),
  }),
});

async function classifyThread(threadText: string, lovableKey: string) {
  const prompt = `You classify a conversation thread with a prospective conference speaker. Use the ENTIRE recent conversation for context, not just the last message — the answer may have been stated earlier and only referenced later.

Return ONLY a compact JSON object matching this schema:
{"suggested_status":"confirmed"|"declined"|"needs_approval"|"unclear","confidence":"high"|"medium"|"low","reasoning":"one short sentence","needs":{"bio":boolean,"headshot":boolean,"banner":boolean}}

Status meanings:
- "confirmed": they clearly agree to speak (accepting invite, saying yes, confirming a slot, sending bio/headshot to lock it in).
- "declined": they clearly decline (no thanks, can't make it, not a fit, passing).
- "needs_approval": they must check with their team/manager/legal/marketing/PR before committing.
- "unclear": genuinely ambiguous even after reading the full thread — only pure scheduling logistics, generic acknowledgements, or nothing on-topic.

Confidence:
- "high": the thread contains an explicit, unambiguous statement matching the status. Auto-applying would be safe.
- "medium": strong signal but some ambiguity or indirect phrasing.
- "low": weak signal, mostly inference. Prefer this over guessing.

Do NOT default to "unclear" when the thread actually resolves the question — read it end-to-end first.

Set needs.bio/headshot/banner=true only if the thread specifically mentions that item (asking, promising, apologizing for delay).

Thread (most recent messages, oldest first):
"""
${threadText.slice(0, 12000)}
"""`;

  const res = await fetch(`${AI_GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`AI classify failed [${res.status}]: ${t}`);
    return {
      suggested_status: "unclear" as const,
      confidence: "low" as const,
      reasoning: "AI classification unavailable",
      needs: { bio: false, headshot: false, banner: false },
    };
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  try {
    return ClassifySchema.parse(JSON.parse(content));
  } catch {
    return {
      suggested_status: "unclear" as const,
      confidence: "low" as const,
      reasoning: "Could not parse AI response",
      needs: { bio: false, headshot: false, banner: false },
    };
  }
}

export const fetchEmailSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
    if (!lovableKey || !gmailKey) {
      return { connected: false as const, suggestions: [] };
    }

    const { data: speakers, error } = await context.supabase
      .from("speakers")
      .select("id, name, email, status");
    if (error) throw new Error(error.message);

    const speakersByEmail = new Map<string, { id: string; name: string; email: string; status: string }>();
    for (const s of speakers ?? []) {
      if (s.email) speakersByEmail.set(s.email.toLowerCase().trim(), s as any);
    }

    const subjectQuery =
      'newer_than:60d (subject:"speaker information" OR subject:"speaker confirmation")';
    const emails = Array.from(speakersByEmail.keys()).slice(0, 30);
    const speakerQuery = emails.length
      ? `newer_than:60d (${emails.map((e) => `from:${e} OR to:${e}`).join(" OR ")})`
      : "";

    const threadIds = new Set<string>();
    const q1 = await gmailSearch(subjectQuery, lovableKey, gmailKey, 25);
    (q1.messages ?? []).forEach((m) => threadIds.add(m.threadId));
    if (speakerQuery) {
      const q2 = await gmailSearch(speakerQuery, lovableKey, gmailKey, 30);
      (q2.messages ?? []).forEach((m) => threadIds.add(m.threadId));
    }

    type EmailSuggestion = {
      thread_id: string;
      subject: string;
      snippet: string;
      from: string;
      matched_speaker: { id: string; name: string; email: string; previous_status: string } | null;
      suggested_status: "confirmed" | "declined" | "needs_approval" | "unclear";
      confidence: "high" | "medium" | "low";
      reasoning: string;
      needs: { bio: boolean; headshot: boolean; banner: boolean };
      received_at: string;
    };

    const results: EmailSuggestion[] = [];

    const capped = Array.from(threadIds).slice(0, 20);
    for (const tid of capped) {
      try {
        const thread = await gmailGetThread(tid, lovableKey, gmailKey);
        const messages = thread.messages ?? [];
        if (!messages.length) continue;
        const last = messages[messages.length - 1];
        const subject = header(last.payload.headers, "Subject");
        const from = header(last.payload.headers, "From");
        const to = header(last.payload.headers, "To");

        // Build full recent context from up to the last 6 messages (oldest first)
        const recent = messages.slice(-6);
        const threadText = recent
          .map((m) => {
            const f = header(m.payload.headers, "From");
            const d = new Date(Number(m.internalDate)).toISOString().slice(0, 16).replace("T", " ");
            const body = extractText(m.payload).replace(/\r\n/g, "\n").trim();
            // Strip obvious quoted replies to reduce noise
            const cleaned = body
              .split(/\n(?:On .+ wrote:|-----Original Message-----|________________________________)/)[0]
              .trim();
            return `--- ${d} UTC — From: ${f} ---\n${cleaned}`;
          })
          .filter((chunk) => chunk.length > 0)
          .join("\n\n");
        if (!threadText) continue;

        const lastBody = extractText(last.payload);

        // Match speaker by any email address involved across the thread
        let matched: EmailSuggestion["matched_speaker"] = null;
        const involvedAll = messages
          .flatMap((m) => [header(m.payload.headers, "From"), header(m.payload.headers, "To")])
          .join(" ")
          .toLowerCase();
        for (const [email, sp] of speakersByEmail) {
          if (involvedAll.includes(email)) {
            matched = {
              id: sp.id,
              name: sp.name,
              email: sp.email,
              previous_status: sp.status,
            };
            break;
          }
        }

        const ai = await classifyThread(threadText, lovableKey);
        results.push({
          thread_id: tid,
          subject: subject || "(no subject)",
          snippet: lastBody.slice(0, 220).replace(/\s+/g, " ").trim(),
          from,
          matched_speaker: matched,
          suggested_status: ai.suggested_status,
          confidence: ai.confidence,
          reasoning: ai.reasoning,
          needs: ai.needs,
          received_at: new Date(Number(last.internalDate)).toISOString(),
        });
      } catch (e) {
        console.error(`Skip thread ${tid}:`, e);
      }
    }

    results.sort((a, b) => (a.received_at < b.received_at ? 1 : -1));

    return { connected: true as const, suggestions: results };
  });

export const setSpeakerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        speaker_id: z.string().uuid(),
        status: z.enum(["contacted", "responded", "confirmed", "declined"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("speakers")
      .update({ status: data.status })
      .eq("id", data.speaker_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ============ APPLY EMAIL SUGGESTION ============

export const applyEmailSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        speaker_id: z.string().uuid(),
        suggested_status: z.enum(["confirmed", "declined", "needs_approval", "unclear"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Map "needs_approval" and "unclear" to existing enum values
    const statusMap: Record<string, "confirmed" | "declined" | "responded"> = {
      confirmed: "confirmed",
      declined: "declined",
      needs_approval: "responded",
      unclear: "responded",
    };
    const status = statusMap[data.suggested_status];
    const { data: row, error } = await context.supabase
      .from("speakers")
      .update({ status })
      .eq("id", data.speaker_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ============ BANNER CHECK ============

export const fetchBannerVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
    if (!lovableKey || !gmailKey) {
      return { connected: false as const, flagged: [] };
    }

    const { data: speakers, error } = await context.supabase
      .from("speakers")
      .select("id, name, email, banner_status, event_id, updated_at")
      .in("banner_status", ["sent", "confirmed_live"]);
    if (error) throw new Error(error.message);

    const eventIds = Array.from(
      new Set((speakers ?? []).map((s) => s.event_id).filter(Boolean)),
    ) as string[];
    const eventsById = new Map<string, { code: string; name: string; created_at: string }>();
    if (eventIds.length) {
      const { data: evs, error: eErr } = await context.supabase
        .from("events")
        .select("id, code, name, created_at")
        .in("id", eventIds);
      if (eErr) throw new Error(eErr.message);
      for (const e of evs ?? []) eventsById.set(e.id, e as any);
    }

    type Flagged = {
      speaker_id: string;
      speaker_name: string;
      speaker_email: string;
      banner_status: string;
      event_id: string | null;
      event_label: string | null;
    };
    const flagged: Flagged[] = [];

    for (const sp of speakers ?? []) {
      const email = (sp.email ?? "").trim();
      if (!email) continue;

      const ev = sp.event_id ? eventsById.get(sp.event_id) : null;
      // Window: since event created_at, capped between 30 and 120 days
      let days = 120;
      if (ev?.created_at) {
        const d = Math.ceil((Date.now() - new Date(ev.created_at).getTime()) / 86400_000);
        days = Math.min(120, Math.max(30, d));
      }

      const q = `in:sent to:${email} newer_than:${days}d (banner OR has:attachment)`;
      const url = new URL(`${GMAIL_GATEWAY}/users/me/messages`);
      url.searchParams.set("q", q);
      url.searchParams.set("maxResults", "1");
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": gmailKey,
        },
      });
      if (!res.ok) {
        const t = await res.text();
        console.error(`Gmail banner search failed [${res.status}] ${email}: ${t}`);
        continue;
      }
      const body = (await res.json()) as { messages?: Array<{ id: string }>; resultSizeEstimate?: number };
      const found = (body.messages?.length ?? 0) > 0;
      if (!found) {
        flagged.push({
          speaker_id: sp.id,
          speaker_name: sp.name,
          speaker_email: email,
          banner_status: sp.banner_status,
          event_id: sp.event_id ?? null,
          event_label: ev ? (ev.code || ev.name) : null,
        });
      }
    }

    return { connected: true as const, flagged };
  });

export const revertBannerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ speaker_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("speakers")
      .update({ banner_status: "not_started" })
      .eq("id", data.speaker_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
