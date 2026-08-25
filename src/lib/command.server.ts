/**
 * Server-only helpers for the natural-language command bar.
 * Keeps command.functions.ts a thin server-function wrapper.
 */
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1";

export type CommandPlan = {
  intent: "search_speakers" | "scan_gmail_for_event" | "unknown";
  event_match: {
    event_id: string | null;
    confidence: "high" | "medium" | "low" | "ambiguous" | "none";
  };
  filters: {
    status: string | null;
    missing: "bio" | "headshot" | "email" | "banner" | null;
    free_text: string | null;
  };
  gmail_keywords: string[];
  clarification: string;
};

const FALLBACK: CommandPlan = {
  intent: "unknown",
  event_match: { event_id: null, confidence: "none" },
  filters: { status: null, missing: null, free_text: null },
  gmail_keywords: [],
  clarification: "I'm not sure how to do that yet — try rephrasing or naming the event.",
};

export async function classifyCommand(
  text: string,
  events: Array<{ id: string; name: string; code: string }>,
  contextEventId: string | null,
  lovableKey: string,
): Promise<CommandPlan> {
  const eventList = events
    .map((e) => `- id=${e.id} | code=${e.code} | name=${e.name}`)
    .join("\n");

  const prompt = `You interpret a short instruction typed by an event operations manager into a command bar. You may ONLY choose between two actions, or "unknown".

Return ONLY a compact JSON object matching this schema:
{"intent":"search_speakers"|"scan_gmail_for_event"|"unknown","event_match":{"event_id":string|null,"confidence":"high"|"medium"|"low"|"ambiguous"|"none"},"filters":{"status":string|null,"missing":"bio"|"headshot"|"email"|"banner"|null,"free_text":string|null},"gmail_keywords":[],"clarification":""}

Intents:
- "search_speakers": the user wants to look up / list speakers, optionally filtered by event, status, or missing bio/headshot/email/banner.
- "scan_gmail_for_event": the user wants to scan Gmail for potential new speakers for a specific event.
- "unknown": ANYTHING else, or anything you are not confident about.

Rules:
- Default to "unknown" whenever uncertain. Never guess an action you are not confident about.
- Match the named event against this list only:
${eventList || "(no events)"}
- If the text names an event that does not clearly match one of those, set event_match.confidence to "ambiguous" or "none", keep intent "unknown", and write a clarification asking the user to name the event more precisely.
- ${
    contextEventId
      ? `The user is currently on the page for event id ${contextEventId}. Use that event if the text does not name a different one (confidence "high").`
      : `There is no current page event context.`
  }
- "scan_gmail_for_event" requires a resolved event with confidence "high" or "medium"; otherwise return "unknown" with a clarification.
- filters.free_text is any leftover person/company/title text to search on, else null.
- gmail_keywords: a few extra search terms drawn from the instruction, else [].
- clarification: only meaningful for "unknown"; otherwise "".

Instruction:
"""
${text.slice(0, 2000)}
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
    console.error(`Command classify failed [${res.status}]: ${t}`);
    if (res.status === 429)
      return { ...FALLBACK, clarification: "The AI service is rate limited right now — try again shortly." };
    if (res.status === 402)
      return { ...FALLBACK, clarification: "AI credits are exhausted — add credits to keep using the command bar." };
    return { ...FALLBACK, clarification: "I couldn't interpret that just now — try again." };
  }

  try {
    const body = (await res.json()) as any;
    const raw = body?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<CommandPlan>;
    const known = new Set(events.map((e) => e.id));
    const eventId = parsed.event_match?.event_id ?? null;
    return {
      intent:
        parsed.intent === "search_speakers" || parsed.intent === "scan_gmail_for_event"
          ? parsed.intent
          : "unknown",
      event_match: {
        event_id: eventId && known.has(eventId) ? eventId : null,
        confidence: parsed.event_match?.confidence ?? "none",
      },
      filters: {
        status: parsed.filters?.status ?? null,
        missing: parsed.filters?.missing ?? null,
        free_text: parsed.filters?.free_text ?? null,
      },
      gmail_keywords: Array.isArray(parsed.gmail_keywords)
        ? parsed.gmail_keywords.filter((k): k is string => typeof k === "string").slice(0, 6)
        : [],
      clarification: parsed.clarification || FALLBACK.clarification,
    };
  } catch (e) {
    console.error("Command classify parse failed:", e);
    return FALLBACK;
  }
}

/** lowercase, strip punctuation — mirrors normName in speaker-dedupe.server.ts */
export function normalizeName(v: unknown): string {
  return typeof v === "string" ? v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : "";
}

export function buildGmailQuery(
  event: { name: string; code: string },
  keywords: string[],
): string {
  const terms = [
    `"${event.name}"`,
    `"${event.code}"`,
    ...keywords.filter(Boolean).map((k) => `"${k.replace(/"/g, "")}"`),
    '"speaker information"',
    '"speaker confirmation"',
    '"confirmed for"',
  ];
  return `newer_than:180d (${terms.join(" OR ")})`;
}
