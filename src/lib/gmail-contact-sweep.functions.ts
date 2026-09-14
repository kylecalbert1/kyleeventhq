import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  gmailHeaders,
  gmailProfile,
  gmailSearch,
  extractEmailAddress,
  extractText,
  h,
  isAutoOrCalendarMessage,
  type GmailMessage,
} from "@/lib/reply-queue.functions";

const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

/**
 * Broad speaker contact sweep.
 *
 * The reply-queue scan only looks at recent inbox threads (and threads we
 * already know about), so a mail Kyle sent straight from Gmail — with no reply
 * yet — never reached the app. This sweep searches Gmail for ANY message to or
 * from each speaker's known address, in both directions, over a long lookback,
 * and logs it against the speaker.
 *
 * Idempotent: every logged message carries a dedupe_key of `reply:<msgId>`
 * (inbound, same key the reply-queue scan uses) or `sent:<msgId>` (outbound),
 * so re-running never double-logs.
 */
export const CONTACT_SWEEP_DEFAULTS = {
  /** How far back to look for speaker mail (capped by the speaker's own age). */
  lookbackDays: 180,
  /** Safety cap on how many new messages one run will fetch in full. */
  maxNewMessages: 400,
  /** Email addresses per Gmail search query. */
  emailsPerQuery: 12,
};

type SweepSpeaker = {
  id: string;
  name: string | null;
  email: string | null;
  event_id: string | null;
  created_at: string | null;
  gmail_thread_id: string | null;
  last_message_at: string | null;
  last_message_direction: string | null;
  last_inbound_at: string | null;
};

export type ContactSweepResult = {
  connected: boolean;
  speakers_searched: number;
  messages_examined: number;
  contacts_logged: number;
  speakers_updated: number;
};

function gDate(d: Date): string {
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

async function gmailGetMessage(
  id: string,
  lovable: string,
  gmail: string,
): Promise<GmailMessage | null> {
  const res = await fetch(`${GMAIL_GATEWAY}/users/me/messages/${id}?format=full`, {
    headers: gmailHeaders(lovable, gmail),
  });
  if (!res.ok) {
    console.error(`Gmail message failed [${res.status}] id=${id}: ${await res.text()}`);
    return null;
  }
  return (await res.json()) as GmailMessage;
}

export async function runSpeakerContactSweep(
  supabase: any,
  opts: { lookbackDays?: number; maxNewMessages?: number } = {},
): Promise<ContactSweepResult> {
  const lookbackDays = opts.lookbackDays ?? CONTACT_SWEEP_DEFAULTS.lookbackDays;
  const maxNew = opts.maxNewMessages ?? CONTACT_SWEEP_DEFAULTS.maxNewMessages;

  const empty: ContactSweepResult = {
    connected: false,
    speakers_searched: 0,
    messages_examined: 0,
    contacts_logged: 0,
    speakers_updated: 0,
  };

  const lovable = process.env.LOVABLE_API_KEY;
  const gmail = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovable || !gmail) return empty;

  const ownerEmail = await gmailProfile(lovable, gmail);
  if (!ownerEmail) throw new Error("Could not resolve connected Gmail account");

  const { data: rows, error } = await supabase
    .from("speakers")
    .select(
      "id, name, email, event_id, created_at, gmail_thread_id, last_message_at, last_message_direction, last_inbound_at",
    )
    .not("email", "is", null);
  if (error) throw new Error(error.message);

  const speakers = (rows ?? []) as SweepSpeaker[];

  // Exact-address matching only. A shared company domain is never enough to
  // attribute a thread to a person, so we deliberately don't fall back to it.
  // Where several speaker records share one address (same person across
  // events), every one of them gets the contact logged.
  const byEmail = new Map<string, SweepSpeaker[]>();
  for (const s of speakers) {
    const e = (s.email ?? "").trim().toLowerCase();
    if (!e || e === ownerEmail || !e.includes("@")) continue;
    const list = byEmail.get(e) ?? [];
    list.push(s);
    byEmail.set(e, list);
  }
  if (byEmail.size === 0) return { ...empty, connected: true };

  const globalFloor = Date.now() - lookbackDays * 86400_000;
  // Per speaker: the later of "added to pipeline" and the lookback floor.
  const floorByEmail = new Map<string, number>();
  for (const [email, list] of byEmail) {
    const created = list
      .map((s) => (s.created_at ? +new Date(s.created_at) : globalFloor))
      .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
    floorByEmail.set(email, Math.max(globalFloor, Number.isFinite(created) ? created : globalFloor));
  }

  // Messages we've already logged (either scan) — lets us skip fetching them.
  const { data: logged } = await supabase
    .from("speaker_activity_log")
    .select("dedupe_key")
    .not("dedupe_key", "is", null);
  const known = new Set<string>((logged ?? []).map((r: any) => r.dedupe_key as string));

  const emails = [...byEmail.keys()];
  const chunkSize = CONTACT_SWEEP_DEFAULTS.emailsPerQuery;
  const candidates = new Map<string, string>(); // messageId -> threadId

  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize);
    const oldest = Math.min(...chunk.map((e) => floorByEmail.get(e) ?? globalFloor));
    const clause = chunk.map((e) => `from:${e} OR to:${e} OR cc:${e}`).join(" OR ");
    const q = `(${clause}) after:${gDate(new Date(oldest))} -in:chats`;
    const found = await gmailSearch(q, lovable, gmail, 200);
    for (const m of found) candidates.set(m.id, m.threadId);
  }

  const toFetch = [...candidates.keys()]
    .filter((id) => !known.has(`reply:${id}`) && !known.has(`sent:${id}`))
    .slice(0, maxNew);

  let examined = 0;
  let contactsLogged = 0;

  // Best-known tip per speaker, applied once at the end.
  type Tip = {
    speaker: SweepSpeaker;
    lastAt: number;
    direction: "inbound" | "outbound";
    threadId: string;
    subject: string;
    snippet: string | null;
    inboundAt: number | null;
  };
  const tips = new Map<string, Tip>();

  for (const id of toFetch) {
    try {
      const msg = await gmailGetMessage(id, lovable, gmail);
      if (!msg) continue;
      examined++;
      if (isAutoOrCalendarMessage(msg)) continue;

      const headers = msg.payload?.headers ?? [];
      const fromEmail = extractEmailAddress(h(headers, "From"));
      const recipients = [h(headers, "To"), h(headers, "Cc")]
        .flatMap((s) => s.split(","))
        .map(extractEmailAddress)
        .filter(Boolean);
      const subject = h(headers, "Subject") || "(no subject)";
      const at = Number(msg.internalDate);
      if (!Number.isFinite(at)) continue;
      const atIso = new Date(at).toISOString();

      const outbound = fromEmail === ownerEmail;
      const counterparties = outbound ? recipients : [fromEmail];
      const matched = counterparties
        .flatMap((e) => byEmail.get(e) ?? [])
        .filter((s, idx, arr) => arr.findIndex((x) => x.id === s.id) === idx);
      if (matched.length === 0) continue;

      const floorOk = matched.some((s) => at >= (floorByEmail.get((s.email ?? "").toLowerCase()) ?? globalFloor));
      if (!floorOk) continue;

      const body = extractText(msg.payload);
      const snippet = body ? body.replace(/\s+/g, " ").trim().slice(0, 600) : null;
      const dedupeKey = outbound ? `sent:${msg.id}` : `reply:${msg.id}`;

      // dedupe_key is globally unique, so one message logs against the first
      // matching speaker record (duplicates across events share the tip update).
      const { error: logErr } = await supabase.from("speaker_activity_log").insert({
        speaker_id: matched[0]!.id,
        event_type: outbound ? "external_email_sent" : "reply_received",
        note: subject,
        created_at: atIso,
        dedupe_key: dedupeKey,
      } as never);
      if (!logErr) contactsLogged++;

      for (const s of matched) {

        const prev = tips.get(s.id);
        const nextTip: Tip = {
          speaker: s,
          lastAt: Math.max(prev?.lastAt ?? 0, at),
          direction: (prev && prev.lastAt > at ? prev.direction : outbound ? "outbound" : "inbound"),
          threadId: prev && prev.lastAt > at ? prev.threadId : (candidates.get(msg.id) ?? msg.threadId ?? ""),
          subject: prev && prev.lastAt > at ? prev.subject : subject,
          snippet: prev && prev.lastAt > at ? prev.snippet : snippet,
          inboundAt: outbound ? (prev?.inboundAt ?? null) : Math.max(prev?.inboundAt ?? 0, at),
        };
        tips.set(s.id, nextTip);
      }
      known.add(dedupeKey);
    } catch (e) {
      console.error(`[contact-sweep] message ${id} failed`, e);
    }
  }

  // Apply speaker tips — never move a timestamp backwards.
  let speakersUpdated = 0;
  for (const tip of tips.values()) {
    const s = tip.speaker;
    const patch: Record<string, unknown> = {};
    const prevLast = s.last_message_at ? +new Date(s.last_message_at) : 0;
    if (tip.lastAt > prevLast) {
      patch.last_message_at = new Date(tip.lastAt).toISOString();
      patch.last_message_direction = tip.direction;
      if (!s.gmail_thread_id && tip.threadId) patch.gmail_thread_id = tip.threadId;
    }
    const prevInbound = s.last_inbound_at ? +new Date(s.last_inbound_at) : 0;
    if (tip.inboundAt && tip.inboundAt > prevInbound) {
      patch.last_inbound_at = new Date(tip.inboundAt).toISOString();
    }
    if (Object.keys(patch).length === 0) continue;
    const { error: upErr } = await supabase.from("speakers").update(patch as never).eq("id", s.id);
    if (!upErr) speakersUpdated++;

    // Backfill the card preview (snippet + who sent last) without ever
    // resurrecting or clearing a live Reply Needed row: we only write when the
    // thread has no reply_queue row yet, and mark it acked so it stays hidden.
    if (tip.threadId) {
      const { data: existing } = await supabase
        .from("reply_queue")
        .select("id")
        .eq("gmail_thread_id", tip.threadId)
        .maybeSingle();
      if (!existing) {
        const msgKey = `sweep:${tip.threadId}:${tip.lastAt}`;
        await supabase.from("reply_queue").insert({
          gmail_thread_id: tip.threadId,
          last_message_id: msgKey,
          last_message_at: new Date(tip.lastAt).toISOString(),
          reason: tip.direction === "inbound" ? "speaker_reply" : "follow_up",
          summary: null,
          subject: tip.subject,
          person_email: (s.email ?? "").toLowerCase(),
          person_name: s.name,
          snippet: tip.snippet,
          last_message_from: tip.direction === "inbound" ? "speaker" : "you",
          speaker_id: s.id,
          event_id: s.event_id,
          acked_message_id: msgKey,
          acked_at: new Date().toISOString(),
        } as never);
      }
    }
  }

  return {
    connected: true,
    speakers_searched: byEmail.size,
    messages_examined: examined,
    contacts_logged: contactsLogged,
    speakers_updated: speakersUpdated,
  };
}

export const scanSpeakerContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ lookback_days: z.number().int().min(1).max(730).default(CONTACT_SWEEP_DEFAULTS.lookbackDays) })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) =>
    runSpeakerContactSweep(context.supabase, { lookbackDays: data.lookback_days }),
  );
