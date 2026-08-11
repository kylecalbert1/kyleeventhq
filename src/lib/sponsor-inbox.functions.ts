import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listSponsorMentions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ only_unactioned: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("sponsor_mentions")
      .select("*")
      .order("message_date", { ascending: false, nullsFirst: false });
    if (data.only_unactioned) q = q.eq("actioned", false);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setSponsorMentionActioned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), actioned: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sponsor_mentions")
      .update({ actioned: data.actioned })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
//   IN-APP GMAIL SCAN (mirrors reply-queue.functions.ts)
// ============================================================

const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

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

function hdr(headers: GmailHeader[], name: string): string {
  return headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
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
  for (const p of payload.parts ?? []) {
    const t = extractText(p);
    if (t) return t;
  }
  if (payload.body?.data) return decodeB64Url(payload.body.data);
  return "";
}

function addressOf(raw: string): string {
  if (!raw) return "";
  const m = raw.match(/<([^>]+)>/);
  return (m?.[1] ?? raw).trim().toLowerCase();
}

function gmailHeaders(lovable: string, gmail: string) {
  return { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": gmail };
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
    console.error(`Sponsor scan: Gmail search failed [${res.status}] q=${q}`);
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
    console.error(`Sponsor scan: Gmail thread failed [${res.status}] tid=${tid}`);
    return null;
  }
  return (await res.json()) as { id: string; messages: GmailMessage[] };
}

// Best-effort event inference: look for an event code or name in the text.
function inferEventId(
  text: string,
  events: Array<{ id: string; code: string | null; name: string | null }>,
): string | null {
  const hay = text.toLowerCase();
  for (const e of events) {
    if (e.code && e.code.length >= 3 && hay.includes(e.code.toLowerCase())) return e.id;
  }
  for (const e of events) {
    if (e.name && e.name.length >= 6 && hay.includes(e.name.toLowerCase())) return e.id;
  }
  return null;
}

export const scanSponsorMentions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ lookback_days: z.number().int().min(1).max(60).default(14) })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const lovable = process.env.LOVABLE_API_KEY;
    const gmail = process.env.GOOGLE_MAIL_API_KEY;
    if (!lovable || !gmail) {
      return { connected: false as const, watched: 0, scanned: 0, created: 0, updated: 0 };
    }

    // Watched senders (opt-in). Empty list = no-op.
    const { data: settings } = await context.supabase
      .from("user_settings")
      .select("sponsor_watch_emails")
      .eq("user_id", context.userId)
      .maybeSingle();
    const watched = ((settings?.sponsor_watch_emails ?? []) as string[])
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (watched.length === 0) {
      return { connected: true as const, watched: 0, scanned: 0, created: 0, updated: 0 };
    }

    const ownerEmail = await gmailProfile(lovable, gmail);
    if (!ownerEmail) throw new Error("Could not resolve connected Gmail account");

    const { data: events } = await context.supabase
      .from("events")
      .select("id, code, name");

    // Search per watched sender so the query stays inside Gmail's limits.
    const threadIds = new Set<string>();
    for (const sender of watched.slice(0, 40)) {
      const msgs = await gmailSearch(
        `newer_than:${data.lookback_days}d from:${sender}`,
        lovable,
        gmail,
        50,
      );
      msgs.forEach((m) => threadIds.add(m.threadId));
    }

    let scanned = 0;
    let created = 0;
    let updated = 0;

    for (const tid of Array.from(threadIds).slice(0, 100)) {
      scanned++;
      try {
        const thread = await gmailGetThread(tid, lovable, gmail);
        if (!thread?.messages?.length) continue;

        // Newest message actually sent by a watched sender, where the owner
        // is a recipient / CC.
        let hit: GmailMessage | null = null;
        for (let i = thread.messages.length - 1; i >= 0; i--) {
          const m = thread.messages[i];
          const from = addressOf(hdr(m.payload.headers, "From"));
          if (!watched.includes(from)) continue;
          const recipients = `${hdr(m.payload.headers, "To")} ${hdr(
            m.payload.headers,
            "Cc",
          )}`.toLowerCase();
          if (!recipients.includes(ownerEmail)) continue;
          hit = m;
          break;
        }
        if (!hit) continue;

        const headers = hit.payload.headers;
        const subject = hdr(headers, "Subject") || "(no subject)";
        const senderEmail = addressOf(hdr(headers, "From"));
        const messageDate = new Date(Number(hit.internalDate)).toISOString();
        const bodyText = extractText(hit.payload).replace(/\s+/g, " ").trim();
        const snippet = bodyText.slice(0, 400) || null;
        const eventId = inferEventId(`${subject} ${bodyText.slice(0, 1500)}`, events ?? []);

        const { data: existing } = await context.supabase
          .from("sponsor_mentions")
          .select("id, event_id")
          .eq("gmail_thread_id", tid)
          .maybeSingle();

        if (existing) {
          const { error } = await context.supabase
            .from("sponsor_mentions")
            .update({
              subject,
              sender_email: senderEmail,
              message_date: messageDate,
              snippet,
              event_id: existing.event_id ?? eventId,
            })
            .eq("id", existing.id);
          if (error) throw new Error(error.message);
          updated++;
        } else {
          const { error } = await context.supabase.from("sponsor_mentions").insert({
            gmail_thread_id: tid,
            subject,
            sender_email: senderEmail,
            message_date: messageDate,
            snippet,
            event_id: eventId,
            actioned: false,
          });
          if (error) throw new Error(error.message);
          created++;
        }
      } catch (e) {
        console.error(`Sponsor mention thread ${tid} failed:`, e);
      }
    }

    return { connected: true as const, watched: watched.length, scanned, created, updated };
  });
