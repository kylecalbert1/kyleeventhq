import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GMAIL_GATEWAY =
  "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1";

// ------------------- shared helpers -------------------

type GmailHeader = { name: string; value: string };
type GmailPayload = {
  headers: GmailHeader[];
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPayload[];
};
type GmailMessage = {
  id: string;
  threadId: string;
  internalDate: string;
  payload: GmailPayload;
};

function h(headers: GmailHeader[], name: string): string {
  return headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeB64Url(s: string) {
  try {
    return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function extractText(payload: GmailPayload | undefined): string {
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

// Collect ALL Content-Type values across the payload tree - calendar RSVPs
// often nest text/calendar inside multipart/mixed and we need to catch that.
function collectMimeTypes(payload: GmailPayload | undefined, out: string[] = []) {
  if (!payload) return out;
  if (payload.mimeType) out.push(payload.mimeType);
  const ct = h(payload.headers ?? [], "Content-Type");
  if (ct) out.push(ct);
  for (const p of payload.parts ?? []) collectMimeTypes(p, out);
  return out;
}

function extractEmailAddress(raw: string): string {
  if (!raw) return "";
  const m = raw.match(/<([^>]+)>/);
  return (m?.[1] ?? raw).trim().toLowerCase();
}

// -------- auto-reply / calendar detection (spec section 3) --------

const AUTO_SUBJECT_PATTERNS = [
  /^\s*(re:\s*)?out of office\b/i,
  /^\s*(re:\s*)?automatic reply\b/i,
  /^\s*(re:\s*)?auto[-\s]?reply\b/i,
  /^\s*(re:\s*)?ooo:/i,
];
const CAL_SUBJECT_PATTERNS = [
  /^\s*Accepted:/i,
  /^\s*Declined:/i,
  /^\s*Tentative:/i,
  /^\s*Updated invitation:/i,
  /^\s*Invitation:/i,
  /^\s*Canceled event:/i,
];

export function isAutoOrCalendarMessage(msg: GmailMessage): boolean {
  const headers = msg.payload.headers ?? [];
  const autoSubmitted = h(headers, "Auto-Submitted").toLowerCase().trim();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (h(headers, "X-Autoreply")) return true;
  if (h(headers, "X-Autorespond")) return true;
  if (h(headers, "X-Auto-Response-Suppress")) {
    // Presence alone doesn't guarantee auto-reply, but combined with a bulk
    // Precedence it commonly is. Fall through to Precedence check.
  }
  const precedence = h(headers, "Precedence").toLowerCase().trim();
  if (["bulk", "auto_reply", "auto-reply", "junk", "list"].includes(precedence))
    return true;

  const subject = h(headers, "Subject");
  if (CAL_SUBJECT_PATTERNS.some((r) => r.test(subject))) return true;
  if (AUTO_SUBJECT_PATTERNS.some((r) => r.test(subject))) return true;

  const mimes = collectMimeTypes(msg.payload).map((m) => m.toLowerCase());
  if (mimes.some((m) => m.includes("text/calendar"))) return true;

  return false;
}

// -------- Gmail helpers --------

function gmailHeaders(lovable: string, gmail: string) {
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": gmail,
  };
}

async function gmailProfile(lovable: string, gmail: string): Promise<string> {
  const res = await fetch(`${GMAIL_GATEWAY}/users/me/profile`, {
    headers: gmailHeaders(lovable, gmail),
  });
  if (!res.ok) throw new Error(`Gmail profile failed (${res.status})`);
  const j = (await res.json()) as { emailAddress?: string };
  return (j.emailAddress ?? "").toLowerCase();
}

async function gmailSearch(
  q: string,
  lovable: string,
  gmail: string,
  max = 50,
): Promise<Array<{ id: string; threadId: string }>> {
  const url = new URL(`${GMAIL_GATEWAY}/users/me/messages`);
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", String(max));
  const res = await fetch(url.toString(), { headers: gmailHeaders(lovable, gmail) });
  if (!res.ok) {
    console.error(`Gmail search failed [${res.status}] q=${q}: ${await res.text()}`);
    return [];
  }
  const j = (await res.json()) as { messages?: Array<{ id: string; threadId: string }> };
  return j.messages ?? [];
}

async function gmailGetThread(
  tid: string,
  lovable: string,
  gmail: string,
): Promise<{ id: string; messages: GmailMessage[] } | null> {
  const res = await fetch(`${GMAIL_GATEWAY}/users/me/threads/${tid}?format=full`, {
    headers: gmailHeaders(lovable, gmail),
  });
  if (!res.ok) {
    console.error(`Gmail thread failed [${res.status}] tid=${tid}: ${await res.text()}`);
    return null;
  }
  return (await res.json()) as { id: string; messages: GmailMessage[] };
}

// -------- AI classification (needs_reply + summary) --------

const AiSchema = z.object({
  needs_reply: z.boolean(),
  summary: z.string(),
});

async function classifyThreadNeedsReply(
  threadText: string,
  ownerEmail: string,
  lovable: string,
): Promise<{ needs_reply: boolean; summary: string }> {
  const prompt = `You are helping a conference producer (${ownerEmail}) triage their inbox.

Given the recent thread below (oldest first), decide whether the producer needs to reply.

Rules:
- needs_reply is TRUE only if the newest inbound message asks a question, requests information, or clearly awaits a response from the producer.
- needs_reply is FALSE for pleasantries ("thanks!", "got it"), FYIs, marketing, calendar RSVPs, or messages where the producer already answered the question in a later message.
- summary: ONE short line (max 90 chars) describing what the sender wants or the thread's state. Example: "sent bio, asking about AV setup" or "confirming Tuesday slot".

Return only JSON: {"needs_reply": boolean, "summary": string}

Thread:
"""
${threadText.slice(0, 10000)}
"""`;
  const res = await fetch(`${AI_GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovable}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    console.error(`AI classify failed [${res.status}]: ${await res.text()}`);
    return { needs_reply: true, summary: "" };
  }
  try {
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = AiSchema.parse(JSON.parse(j.choices?.[0]?.message?.content ?? "{}"));
    return { needs_reply: parsed.needs_reply, summary: parsed.summary.slice(0, 200) };
  } catch {
    return { needs_reply: true, summary: "" };
  }
}

function buildThreadText(messages: GmailMessage[]): string {
  const recent = messages.slice(-6);
  return recent
    .map((m) => {
      const from = h(m.payload.headers, "From");
      const d = new Date(Number(m.internalDate)).toISOString().slice(0, 16).replace("T", " ");
      const body = extractText(m.payload).replace(/\r\n/g, "\n").trim();
      const cleaned = body
        .split(/\n(?:On .+ wrote:|-----Original Message-----|________________________________)/)[0]
        .trim();
      return `--- ${d} UTC · ${from} ---\n${cleaned}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

// -------- mention detection --------

function detectMention(bodyText: string, ownerEmail: string): boolean {
  const first = (ownerEmail.split("@")[0] ?? "").split(/[._-]/)[0]?.toLowerCase();
  const body = bodyText.toLowerCase();
  const nameHit =
    !!first && first.length >= 3 && new RegExp(`\\b${first}\\b`).test(body);
  const emailHit = body.includes(ownerEmail.toLowerCase());
  if (!nameHit && !emailHit) return false;
  // near a question / request signal
  return /\?|could you|can you|would you|please|need|thoughts\??|any update/i.test(bodyText);
}

// -------- upsert (spec §1: shared contract) --------

type UpsertInput = {
  supabase: any;
  gmail_thread_id: string;
  last_message_id: string;
  last_message_at: string;
  reason: "speaker_reply" | "mention" | "follow_up";
  summary: string | null;
  subject: string | null;
  person_email: string;
  person_name: string | null;
  speaker_id: string | null;
  event_id: string | null;
  // If true (owner's own reply is newest), auto-ack this write.
  autoAck?: boolean;
};

async function upsertQueueRow(input: UpsertInput) {
  const existing = await input.supabase
    .from("reply_queue")
    .select("id, last_message_at, last_message_id, acked_message_id, acked_at")
    .eq("gmail_thread_id", input.gmail_thread_id)
    .maybeSingle();

  if (existing.error) throw new Error(existing.error.message);

  const row = existing.data as
    | {
        id: string;
        last_message_at: string;
        last_message_id: string;
        acked_message_id: string | null;
      }
    | null;

  const patch: Record<string, unknown> = {
    person_email: input.person_email,
    person_name: input.person_name,
    speaker_id: input.speaker_id,
    event_id: input.event_id,
    reason: input.reason,
    subject: input.subject,
  };

  if (!row) {
    // NEW row
    const insert = {
      ...patch,
      gmail_thread_id: input.gmail_thread_id,
      last_message_id: input.last_message_id,
      last_message_at: input.last_message_at,
      summary: input.summary,
      acked_message_id: input.autoAck ? input.last_message_id : null,
      acked_at: input.autoAck ? new Date().toISOString() : null,
    };
    const { error } = await input.supabase.from("reply_queue").insert(insert);
    if (error) throw new Error(error.message);
    return;
  }

  // EXISTING row - only advance last_message_* when a genuinely newer msg arrived.
  const incomingTs = new Date(input.last_message_at).getTime();
  const existingTs = new Date(row.last_message_at).getTime();
  const isNewer =
    incomingTs > existingTs ||
    (incomingTs === existingTs && input.last_message_id !== row.last_message_id);

  if (isNewer) {
    patch.last_message_id = input.last_message_id;
    patch.last_message_at = input.last_message_at;
    if (input.summary != null) patch.summary = input.summary;
    if (input.autoAck) {
      patch.acked_message_id = input.last_message_id;
      patch.acked_at = new Date().toISOString();
    }
  } else if (input.autoAck && !row.acked_message_id) {
    // Same message, but owner reply visible now: ack at current tip.
    patch.acked_message_id = row.last_message_id;
    patch.acked_at = new Date().toISOString();
  }

  const { error } = await input.supabase
    .from("reply_queue")
    .update(patch)
    .eq("id", row.id);
  if (error) throw new Error(error.message);
}

// ============================================================
//                       PUBLIC SERVER FNs
// ============================================================

export const listReplyQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("reply_queue")
      .select("*")
      .order("last_message_at", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      id: string;
      speaker_id: string | null;
      event_id: string | null;
      person_email: string;
      person_name: string | null;
      gmail_thread_id: string;
      last_message_id: string;
      last_message_at: string;
      reason: "speaker_reply" | "mention" | "follow_up";
      summary: string | null;
      subject: string | null;
      acked_message_id: string | null;
      acked_at: string | null;
    }>;
    // Visible when unacked OR a newer message arrived after ack.
    const visible = rows.filter(
      (r) => !r.acked_message_id || r.acked_message_id !== r.last_message_id,
    );
    return { rows: visible, total: rows.length };
  });

export const ackReplyQueueRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error: fetchErr } = await context.supabase
      .from("reply_queue")
      .select("id, last_message_id, speaker_id")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!row) throw new Error("Row not found");

    const { error } = await context.supabase
      .from("reply_queue")
      .update({
        acked_message_id: row.last_message_id,
        acked_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);

    if (row.speaker_id) {
      await context.supabase
        .from("speakers")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_direction: "outbound",
        })
        .eq("id", row.speaker_id);
    }
    return { ok: true };
  });

// ============================================================
//                       THE SCAN
// ============================================================

export const scanReplyQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ lookback_days: z.number().int().min(1).max(60).default(14) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const lovable = process.env.LOVABLE_API_KEY;
    const gmail = process.env.GOOGLE_MAIL_API_KEY;
    if (!lovable || !gmail) {
      return { connected: false as const, scanned: 0, queued: 0, auto_acked: 0, skipped_auto: 0 };
    }

    const ownerEmail = await gmailProfile(lovable, gmail);
    if (!ownerEmail) throw new Error("Could not resolve connected Gmail account");

    // 1) Speakers by email for matching + follow-up sweep.
    const { data: speakers, error: spErr } = await context.supabase
      .from("speakers")
      .select(
        "id, name, email, event_id, status, gmail_thread_id, last_message_at, last_message_direction",
      );
    if (spErr) throw new Error(spErr.message);
    const byEmail = new Map<string, (typeof speakers)[number]>();
    for (const s of speakers ?? []) {
      if (s.email) byEmail.set(s.email.toLowerCase().trim(), s);
    }

    // 2) Threads to inspect: inbox (last N days), current unacked queue rows.
    const threadIds = new Set<string>();
    const q1 = await gmailSearch(
      `newer_than:${data.lookback_days}d in:inbox`,
      lovable,
      gmail,
      100,
    );
    q1.forEach((m) => threadIds.add(m.threadId));

    const { data: queueRows } = await context.supabase
      .from("reply_queue")
      .select("gmail_thread_id, acked_message_id, last_message_id, reason")
      .not("gmail_thread_id", "like", "seed:%");
    for (const r of queueRows ?? []) {
      if (r.acked_message_id !== r.last_message_id) threadIds.add(r.gmail_thread_id);
    }

    // 3) Also include seed rows so we replace synthetic ids on first scan.
    const { data: seedRows } = await context.supabase
      .from("reply_queue")
      .select("gmail_thread_id")
      .like("last_message_id", "seed:%");
    for (const r of seedRows ?? []) threadIds.add(r.gmail_thread_id);

    let scanned = 0;
    let queued = 0;
    let autoAcked = 0;
    let skippedAuto = 0;

    for (const tid of Array.from(threadIds).slice(0, 80)) {
      scanned++;
      try {
        const thread = await gmailGetThread(tid, lovable, gmail);
        if (!thread || !thread.messages?.length) continue;

        const messages = thread.messages;

        // Newest non-auto message drives everything.
        let newestReal: GmailMessage | null = null;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (!isAutoOrCalendarMessage(messages[i])) {
            newestReal = messages[i];
            break;
          } else if (i === messages.length - 1) {
            skippedAuto++;
          }
        }
        if (!newestReal) continue;

        const headers = newestReal.payload.headers;
        const fromRaw = h(headers, "From");
        const fromEmail = extractEmailAddress(fromRaw);
        const toRaw = h(headers, "To");
        const ccRaw = h(headers, "Cc");
        const subject = h(headers, "Subject") || "(no subject)";
        const bodyText = extractText(newestReal.payload);

        // Owner's own reply is the newest -> mark acked automatically.
        const ownerIsNewest = fromEmail === ownerEmail;

        // Figure out counterparty (the person on the thread who isn't the owner)
        let personEmail = fromEmail;
        if (ownerIsNewest) {
          // Prefer To/Cc address that isn't the owner
          const others = [toRaw, ccRaw]
            .flatMap((s) => s.split(","))
            .map(extractEmailAddress)
            .filter((e) => e && e !== ownerEmail);
          if (others[0]) personEmail = others[0];
        }
        const displayName = fromRaw.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || null;
        const matchedSpeaker = personEmail ? byEmail.get(personEmail) : undefined;

        const threadText = buildThreadText(
          messages.filter((m) => !isAutoOrCalendarMessage(m)),
        );

        let reason: "speaker_reply" | "mention" = "speaker_reply";
        let summary: string | null = null;
        let needsReply = true;

        if (ownerIsNewest) {
          // Owner has answered - we don't need AI. Auto-ack path.
          summary = "You replied";
          needsReply = false;
        } else {
          const isRecipient =
            (toRaw + " " + ccRaw).toLowerCase().includes(ownerEmail);
          const looksLikeMention = !matchedSpeaker && isRecipient && detectMention(bodyText, ownerEmail);
          if (!matchedSpeaker && !looksLikeMention) continue;
          if (looksLikeMention) reason = "mention";

          const ai = await classifyThreadNeedsReply(threadText, ownerEmail, lovable);
          needsReply = ai.needs_reply;
          summary = ai.summary;
        }

        const lastMessageAt = new Date(Number(newestReal.internalDate)).toISOString();

        // Existing row? Always update tip (via upsertQueueRow); only INSERT
        // when needsReply is true OR ownerIsNewest (to record the ack).
        const { data: existingRow } = await context.supabase
          .from("reply_queue")
          .select("id")
          .eq("gmail_thread_id", tid)
          .maybeSingle();

        if (!existingRow && !needsReply && !ownerIsNewest) continue;

        await upsertQueueRow({
          supabase: context.supabase,
          gmail_thread_id: tid,
          last_message_id: newestReal.id,
          last_message_at: lastMessageAt,
          reason,
          summary,
          subject,
          person_email: personEmail,
          person_name: matchedSpeaker?.name ?? displayName,
          speaker_id: matchedSpeaker?.id ?? null,
          event_id: matchedSpeaker?.event_id ?? null,
          autoAck: ownerIsNewest,
        });

        if (ownerIsNewest) autoAcked++;
        else if (needsReply) queued++;

        // Keep speakers.last_message_* in sync (does NOT drive visibility).
        if (matchedSpeaker) {
          await context.supabase
            .from("speakers")
            .update({
              last_message_at: lastMessageAt,
              last_message_direction: ownerIsNewest ? "outbound" : "inbound",
              gmail_thread_id: tid,
            })
            .eq("id", matchedSpeaker.id);
        }
      } catch (e) {
        console.error(`Reply-queue thread ${tid} failed:`, e);
      }
    }

    // 4) Follow-up sweep: outbound speakers with no reply in 3+ days.
    // Only add follow-up rows for speakers with a gmail_thread_id. Never
    // resurrect within 3d of a prior ack.
    const threeDaysAgo = Date.now() - 3 * 86400_000;
    for (const s of speakers ?? []) {
      if (!s.gmail_thread_id) continue;
      if (s.last_message_direction !== "outbound") continue;
      if (!s.last_message_at) continue;
      if (new Date(s.last_message_at).getTime() > threeDaysAgo) continue;
      if (!["contacted", "responded"].includes(s.status)) continue;

      const { data: existing } = await context.supabase
        .from("reply_queue")
        .select("id, acked_at, reason")
        .eq("gmail_thread_id", s.gmail_thread_id)
        .maybeSingle();

      // Skip if acked within the last 3 days (snooze window).
      if (existing?.acked_at && new Date(existing.acked_at).getTime() > threeDaysAgo) {
        continue;
      }
      // Skip if a speaker_reply / mention row is already active for this thread.
      if (existing && existing.reason !== "follow_up" && !existing.acked_at) continue;

      await upsertQueueRow({
        supabase: context.supabase,
        gmail_thread_id: s.gmail_thread_id,
        last_message_id: `followup:${s.gmail_thread_id}:${s.last_message_at}`,
        last_message_at: s.last_message_at,
        reason: "follow_up",
        summary: `No reply since ${new Date(s.last_message_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
        subject: null,
        person_email: (s.email ?? "").toLowerCase(),
        person_name: s.name,
        speaker_id: s.id,
        event_id: s.event_id,
        autoAck: false,
      });
      queued++;
    }

    return {
      connected: true as const,
      scanned,
      queued,
      auto_acked: autoAcked,
      skipped_auto: skippedAuto,
    };
  });
