import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLACEHOLDER_HELP } from "@/lib/message-render";

export type AiMessageDraft = {
  name: string;
  subject: string;
  body_markdown: string;
  stream: "speakers" | "attendees" | "incomplete_tickets" | "everyone";
  event_format: "in_person" | "virtual" | null;
  typical_weeks: number[] | null;
};

const DraftShape = z.object({
  name: z.string().min(1).catch("Untitled message"),
  subject: z.string().catch(""),
  body_markdown: z.string().catch(""),
  stream: z
    .enum(["speakers", "attendees", "incomplete_tickets", "everyone"])
    .catch("attendees"),
  event_format: z.enum(["in_person", "virtual"]).nullable().catch(null),
  typical_weeks: z.array(z.number().int()).nullable().catch(null),
});

function systemPrompt(): string {
  const tokens = PLACEHOLDER_HELP.map((p) => `- [[${p.key}]]: ${p.description}`).join("\n");
  return `You write event messages for an internal event operations tool. The copy is pasted into Tito's Messages tab and sent from there.

AVAILABLE [[placeholder]] TOKENS (the app substitutes these with the real event data):
${tokens}

HARD RULES
- ONLY use [[placeholder]] tokens for anything that varies by event: event name, date, venue, urls, notes, signoff. NEVER invent or hardcode a specific date, link, venue or person's name.
- Tito's own {{curly_brace}} merge tags (for example {{first_name}}) may be used the same way existing templates use them. Never wrap them in square brackets.
- Do not use any placeholder key that is not in the list above.

HOUSE STYLE (apply verbatim)
- No em dashes anywhere.
- Sentence case for the subject line.
- Never say "this panel" or "this keynote", always say "this session".
- No generic AI sounding or templated marketing language.
- Keep it concise and direct.
- Always sign off with [[signoff]], never a hardcoded name.

TONE
- Infer urgency and tone from the user's request. If they signal a deadline approaching fast, the message should read urgent, not casual.

OUTPUT
Return strict JSON only, with exactly these keys:
{"name": string, "subject": string, "body_markdown": string, "stream": "speakers"|"attendees"|"incomplete_tickets"|"everyone", "event_format": "in_person"|"virtual"|null, "typical_weeks": number[]|null}
- name: a short library name for this message type, sentence case.
- stream: infer the audience, default "attendees".
- event_format: null means it applies to both formats, use null unless the request clearly implies one.
- typical_weeks: weeks before the event this usually goes out, or null.
- body_markdown: plain markdown, no HTML.`;
}

export const generateMessageDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ prompt: z.string().min(3), event_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured");

    const { data: event, error } = await context.supabase
      .from("events")
      .select("*")
      .eq("id", data.event_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!event) throw new Error("Event not found");

    const ev = event as Record<string, unknown>;
    const known = [
      "name",
      "code",
      "business_line",
      "format",
      "event_date",
      "venue",
      "venue_address",
      "registration_time",
      "sessions_start_time",
      "dietary_url",
      "room_block_url",
      "room_block_notes",
    ]
      .map((k) => `${k}: ${ev[k] === null || ev[k] === undefined ? "(not set)" : String(ev[k])}`)
      .join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: systemPrompt() },
          {
            role: "user",
            content: `Event context (for judgement only, always use the [[placeholder]] tokens in the copy itself):\n${known}\n\nWhat I want to send:\n${data.prompt}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("AI rate limit, try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted, top up to continue.");
    if (!res.ok) throw new Error(`AI error ${res.status}`);

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? "{}";
    let raw: unknown = {};
    try {
      raw = JSON.parse(content);
    } catch {
      throw new Error("The model returned an unreadable response, try again.");
    }
    const parsed = DraftShape.parse(raw);
    if (!parsed.body_markdown.trim()) throw new Error("The model returned an empty message.");
    return parsed as AiMessageDraft;
  });
