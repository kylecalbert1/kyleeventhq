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
        // NB: RSVP responseStatus (accepted/declined) is intentionally NOT
        // used as a signal. Whether someone accepts or declines a calendar
        // invite is unrelated to whether Kyle needs to reply by email.
        // Reply-needed classification is driven purely by inbound Gmail
        // (last_message_direction === "inbound") in NeedsAttentionWidget.
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

async function gmailProfileEmail(lovableKey: string, gmailKey: string): Promise<string> {
  try {
    const res = await fetch(`${GMAIL_GATEWAY}/users/me/profile`, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmailKey,
      },
    });
    if (!res.ok) return "";
    const body = (await res.json()) as { emailAddress?: string };
    return (body.emailAddress ?? "").toLowerCase().trim();
  } catch {
    return "";
  }
}

/** Splits a raw From/To header into individual "Name <email>" participants. */
function splitAddresses(header: string): Array<{ raw: string; email: string }> {
  if (!header) return [];
  return header
    .split(/,(?![^<]*>)/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((raw) => {
      const m = raw.match(/<([^>]+)>/);
      const email = (m ? m[1] : raw).toLowerCase().trim();
      return { raw, email };
    })
    .filter((a) => a.email.includes("@"));
}

/**
 * Finds the external participant of a thread — i.e. whoever is not me or on my
 * own domain. Scans From and To across every message rather than trusting the
 * last message's From header, which may well be my own outbound email.
 */
function externalParticipant(
  messages: Array<{ payload: { headers: Array<{ name: string; value: string }> } }>,
  myEmail: string,
): { raw: string; email: string } | null {
  const myDomain = domainOf(myEmail);
  const seen = new Map<string, { raw: string; email: string }>();
  for (const m of messages) {
    for (const name of ["From", "To", "Cc"]) {
      for (const a of splitAddresses(header(m.payload.headers, name))) {
        if (myEmail && a.email === myEmail) continue;
        if (myDomain && domainOf(a.email) === myDomain) continue;
        if (/(noreply|no-reply|notifications?@|calendar-notification)/i.test(a.email)) continue;
        if (!seen.has(a.email)) seen.set(a.email, a);
      }
    }
  }
  return seen.size ? Array.from(seen.values())[0] : null;
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
  const prompt = `You classify a conversation thread with a prospective conference speaker. Use the ENTIRE recent conversation for context, not just the last message - the answer may have been stated earlier and only referenced later.

Return ONLY a compact JSON object matching this schema:
{"suggested_status":"confirmed"|"declined"|"needs_approval"|"unclear","confidence":"high"|"medium"|"low","reasoning":"one short sentence","needs":{"bio":boolean,"headshot":boolean,"banner":boolean}}

Status meanings:
- "confirmed": they clearly agree to speak (accepting invite, saying yes, confirming a slot, sending bio/headshot to lock it in).
- "declined": they clearly decline (no thanks, can't make it, not a fit, passing).
- "needs_approval": they must check with their team/manager/legal/marketing/PR before committing.
- "unclear": genuinely ambiguous even after reading the full thread - only pure scheduling logistics, generic acknowledgements, or nothing on-topic.

Confidence:
- "high": the thread contains an explicit, unambiguous statement matching the status. Auto-applying would be safe.
- "medium": strong signal but some ambiguity or indirect phrasing.
- "low": weak signal, mostly inference. Prefer this over guessing.

Do NOT default to "unclear" when the thread actually resolves the question - read it end-to-end first.

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

    const myEmail = await gmailProfileEmail(lovableKey, gmailKey);

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
      speaker_email: string | null;
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
        // Who this thread is *about*: the external participant, not simply the
        // sender of the last message (which is often me).
        const external = externalParticipant(messages as any, myEmail);
        const from = external?.raw ?? header(last.payload.headers, "From");


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
            return `--- ${d} UTC - From: ${f} ---\n${cleaned}`;
          })
          .filter((chunk) => chunk.length > 0)
          .join("\n\n");
        if (!threadText) continue;

        const lastBody = extractText(last.payload);

        // Match speaker by any email address involved across the thread
        let matched: EmailSuggestion["matched_speaker"] = null;
        let matchedEmail: string | null = null;
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
            matchedEmail = sp.email;
            break;
          }
        }

        const ai = await classifyThread(threadText, lovableKey);
        results.push({
          thread_id: tid,
          subject: subject || "(no subject)",
          snippet: lastBody.slice(0, 220).replace(/\s+/g, " ").trim(),
          from,
          speaker_email: matchedEmail,
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
        status: z.enum(["new", "contacted", "in_conversation", "responded", "confirmed", "declined"]),
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

      // Event-specific term: match either the event code or full name.
      const eventTerms: string[] = [];
      if (ev?.code) eventTerms.push(`"${ev.code}"`);
      if (ev?.name && ev.name !== ev.code) eventTerms.push(`"${ev.name}"`);
      const eventClause = eventTerms.length ? ` (${eventTerms.join(" OR ")})` : "";

      // Banner phrasing: "speaker banner" or plain "banner".
      const q = `in:sent to:${email} ("speaker banner" OR banner)${eventClause}`;
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

// ============ BIO CHECK ============

const BioClassifySchema = z.object({
  contains_bio: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  bio_text: z.string(),
  reasoning: z.string(),
});

async function classifyBio(threadText: string, speakerName: string, lovableKey: string) {
  const prompt = `You are analyzing an email conversation with a conference speaker named "${speakerName}". Determine whether the speaker (or someone on their behalf) has sent over their speaker BIO in this thread.

A bio is a short third-person paragraph (typically 2-6 sentences) describing the speaker's background, current role, and notable achievements. It is NOT a signature block, NOT a scheduling reply, NOT a one-line note, and NOT a headshot.

Return ONLY a compact JSON object matching this schema:
{"contains_bio":boolean,"confidence":"high"|"medium"|"low","bio_text":"the extracted bio, cleaned of quoted replies/signatures - empty string if contains_bio is false","reasoning":"one short sentence"}

Confidence rules:
- "high": a clear, standalone bio paragraph is present. Safe to auto-apply.
- "medium": bio-like text exists but is mixed with other content or partial.
- "low": weak signal - do not auto-apply.

Extract bio_text as the cleanest single paragraph (or two) that is the actual bio. Trim signatures ("Best,", phone numbers, email links, disclaimers).

Thread (oldest first):
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
    console.error(`AI bio-classify failed [${res.status}]: ${t}`);
    return {
      contains_bio: false,
      confidence: "low" as const,
      bio_text: "",
      reasoning: "AI classification unavailable",
    };
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  try {
    return BioClassifySchema.parse(JSON.parse(content));
  } catch {
    return {
      contains_bio: false,
      confidence: "low" as const,
      bio_text: "",
      reasoning: "Could not parse AI response",
    };
  }
}

export const fetchBioSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
    if (!lovableKey || !gmailKey) {
      return { connected: false as const, suggestions: [] };
    }

    // Speakers missing a stored bio, with an email, who have replied to us.
    const { data: speakers, error } = await context.supabase
      .from("speakers")
      .select("id, name, email, bio_received, bio_text")
      .or("bio_received.eq.false,bio_text.is.null");
    if (error) throw new Error(error.message);

    type BioSuggestion = {
      speaker_id: string;
      speaker_name: string;
      speaker_email: string;
      thread_id: string;
      subject: string;
      from: string;
      bio_text: string;
      confidence: "high" | "medium" | "low";
      reasoning: string;
      received_at: string;
      previous_bio: string | null;
    };
    const results: BioSuggestion[] = [];

    // Cap the number of speakers we scan per run to keep latency sane.
    const capped = (speakers ?? []).filter((s) => s.email).slice(0, 25);

    for (const sp of capped) {
      try {
        const email = (sp.email as string).toLowerCase().trim();
        // Look for inbound messages from the speaker that mention "bio".
        const q = `from:${email} newer_than:180d (bio OR biography OR "here's my" OR "attached")`;
        const search = await gmailSearch(q, lovableKey, gmailKey, 5);
        const threadIds = Array.from(
          new Set((search.messages ?? []).map((m) => m.threadId)),
        ).slice(0, 3);
        if (threadIds.length === 0) continue;

        for (const tid of threadIds) {
          const thread = await gmailGetThread(tid, lovableKey, gmailKey);
          const messages = thread.messages ?? [];
          if (!messages.length) continue;

          // Focus on messages actually FROM the speaker.
          const inbound = messages.filter((m) =>
            header(m.payload.headers, "From").toLowerCase().includes(email),
          );
          if (inbound.length === 0) continue;

          const threadText = inbound
            .map((m) => {
              const f = header(m.payload.headers, "From");
              const d = new Date(Number(m.internalDate))
                .toISOString()
                .slice(0, 16)
                .replace("T", " ");
              const body = extractText(m.payload).replace(/\r\n/g, "\n").trim();
              const cleaned = body
                .split(/\n(?:On .+ wrote:|-----Original Message-----|________________________________)/)[0]
                .trim();
              return `--- ${d} UTC - From: ${f} ---\n${cleaned}`;
            })
            .filter((chunk) => chunk.length > 0)
            .join("\n\n");
          if (!threadText) continue;

          const ai = await classifyBio(threadText, sp.name, lovableKey);
          if (!ai.contains_bio || !ai.bio_text.trim()) continue;

          const last = inbound[inbound.length - 1];
          results.push({
            speaker_id: sp.id,
            speaker_name: sp.name,
            speaker_email: sp.email as string,
            thread_id: tid,
            subject: header(last.payload.headers, "Subject") || "(no subject)",
            from: header(last.payload.headers, "From"),
            bio_text: ai.bio_text.trim(),
            confidence: ai.confidence,
            reasoning: ai.reasoning,
            received_at: new Date(Number(last.internalDate)).toISOString(),
            previous_bio: (sp.bio_text as string | null) ?? null,
          });
          break; // one hit per speaker is enough
        }
      } catch (e) {
        console.error(`Bio scan skip ${sp.id}:`, e);
      }
    }

    results.sort((a, b) => (a.received_at < b.received_at ? 1 : -1));
    return { connected: true as const, suggestions: results };
  });

export const applyBioSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        speaker_id: z.string().uuid(),
        bio_text: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("speakers")
      .update({ bio_text: data.bio_text, bio_received: true })
      .eq("id", data.speaker_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const revertBio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        speaker_id: z.string().uuid(),
        previous_bio: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("speakers")
      .update({ bio_text: data.previous_bio, bio_received: !!data.previous_bio })
      .eq("id", data.speaker_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ============ FIND EMAIL FOR A SPEAKER (one Gmail sent-mail lookup) ============

/** Strips a title/company tail from a stored speaker name. */
export function cleanPersonName(raw: string): string {
  let n = (raw ?? "").trim();
  n = n.split(",")[0] ?? n;
  n = n.split(/\s+\bat\b\s+/i)[0] ?? n;
  n = n.split(/\s+[-–—|]\s+/)[0] ?? n;
  return n.replace(/\s+/g, " ").trim();
}

export const findSpeakerEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().min(2) }).parse(d))
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
    if (!lovableKey || !gmailKey) return { connected: false as const, email: null, name: null };

    const clean = cleanPersonName(data.name);
    if (!clean) return { connected: true as const, email: null, name: null };

    const myEmail = await gmailProfileEmail(lovableKey, gmailKey);
    const search = await gmailSearch(`in:sent to:"${clean}"`, lovableKey, gmailKey, 5);
    const messages = search.messages ?? [];
    const wanted = clean.toLowerCase().split(/\s+/).filter((t) => t.length > 1);

    for (const m of messages.slice(0, 5)) {
      const thread = await gmailGetThread(m.threadId, lovableKey, gmailKey);
      for (const msg of thread.messages ?? []) {
        for (const a of splitAddresses(header(msg.payload.headers, "To"))) {
          if (myEmail && a.email === myEmail) continue;
          const hay = a.raw.toLowerCase();
          const matchesName = wanted.every((t) => hay.includes(t));
          const local = a.email.split("@")[0]?.replace(/[._\-+]+/g, " ") ?? "";
          const matchesLocal = wanted.every((t) => local.includes(t));
          if (matchesName || matchesLocal) {
            return { connected: true as const, email: a.email, name: clean };
          }
        }
      }
    }
    return { connected: true as const, email: null, name: clean };
  });
