/**
 * Server-only helpers for the natural-language command bar.
 * Keeps command.functions.ts a thin server-function wrapper.
 */
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1";

export type CommandPlan = {
  intent:
    | "search_speakers"
    | "scan_gmail_for_event"
    | "compose_message"
    | "navigate"
    | "answer"
    | "unknown";
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
  /** Route to navigate to, e.g. "/tito" or "/events/<uuid>/dashboard" */
  destination: string | null;
  destination_label: string | null;
  clarification: string;
};

const FALLBACK: CommandPlan = {
  intent: "unknown",
  event_match: { event_id: null, confidence: "none" },
  filters: { status: null, missing: null, free_text: null },
  gmail_keywords: [],
  destination: null,
  destination_label: null,
  clarification: "I'm not sure how to do that yet — try rephrasing or naming the event.",
};

/** Every navigable page, described for the model. */
export const ROUTE_CATALOG: Array<{ path: string; label: string; about: string }> = [
  { path: "/", label: "Events", about: "home / all events list, the landing page" },
  { path: "/tito", label: "All Tito events", about: "archive of Tito events and ticket sales" },
  { path: "/speakers", label: "Find speakers", about: "cross-event speaker sourcing/prospecting and global people search" },
  { path: "/boards", label: "Speaker boards", about: "per-event speaker boards / kanban" },
  { path: "/agenda", label: "Agenda", about: "agenda builder and AV agenda exports" },
  { path: "/outreach", label: "Outreach", about: "outreach hub, LinkedIn kits and bulk outreach" },
  { path: "/message-templates", label: "Message templates", about: "message template library and AI message drafting" },
  { path: "/sent-messages", label: "Sent messages", about: "history of every email sent" },
  { path: "/sponsor-inbox", label: "Sponsor inbox", about: "sponsor enquiries" },
  { path: "/banners", label: "Banners", about: "speaker banner production status" },
  { path: "/settings", label: "Settings", about: "user settings, signature, excluded ticket types" },
  { path: "/tools/logo-converter", label: "Logo converter", about: "convert logos between formats" },
  { path: "/events/<event_id>", label: "Event page", about: "one event: speakers, targets, links, messages" },
  { path: "/events/<event_id>/dashboard", label: "Event sales dashboard", about: "targets, revenue and ticket sales charts for one event" },
];


export async function classifyCommand(
  text: string,
  events: Array<{ id: string; name: string; code: string }>,
  contextEventId: string | null,
  lovableKey: string,
): Promise<CommandPlan> {
  const eventList = events
    .map((e) => `- id=${e.id} | code=${e.code} | name=${e.name}`)
    .join("\n");

  const routes = ROUTE_CATALOG.map((r) => `- ${r.path} — ${r.label}: ${r.about}`).join("\n");

  const prompt = `You are the in-app assistant for an event operations manager (like Siri for this app). You interpret a short instruction typed into a command bar and pick ONE action.

Return ONLY a compact JSON object matching this schema:
{"intent":"search_speakers"|"scan_gmail_for_event"|"compose_message"|"navigate"|"answer"|"unknown","event_match":{"event_id":string|null,"confidence":"high"|"medium"|"low"|"ambiguous"|"none"},"filters":{"status":string|null,"missing":"bio"|"headshot"|"email"|"banner"|null,"free_text":string|null},"gmail_keywords":[],"destination":string|null,"destination_label":string|null,"clarification":""}

Intents:
- "navigate": the user wants to GO somewhere in the app ("take me to the sales dashboard for AIAI London", "open sent messages", "show me the agenda page", "where do I change my signature"). Set destination to a real path from the route catalog, substituting a resolved event id for <event_id>. destination_label is a short human name for the page.
- "search_speakers": look up / list speakers, optionally filtered by event, status, or missing bio/headshot/email/banner.
- "scan_gmail_for_event": scan Gmail for potential new speakers for a specific event.
- "compose_message": draft/write/generate a message to send to speakers and/or attendees.
- "answer": the user is asking a question about their events/data or how to do something in the app, and no action above fits ("how many speakers are confirmed for AIAI London?", "what's left to do this week?", "how do I add a speaker?").
- "unknown": only when the request is genuinely outside this app.

Route catalog (destination MUST be one of these paths):
${routes}

Rules:
- Prefer "navigate" whenever the user says go/open/take me to/show me a page.
- Match any named event against this list only:
${eventList || "(no events)"}
- ${
    contextEventId
      ? `The user is currently on the page for event id ${contextEventId}. Use that event if the text does not name a different one (confidence "high").`
      : `There is no current page event context.`
  }
- "scan_gmail_for_event" and "compose_message" each require a resolved event with confidence "high" or "medium"; otherwise return "unknown" with a clarification.
- Event-specific destinations require a resolved event id; if the event is ambiguous, use "answer" or "unknown" with a clarification instead of guessing.
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
        parsed.intent === "search_speakers" ||
        parsed.intent === "scan_gmail_for_event" ||
        parsed.intent === "compose_message"
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
