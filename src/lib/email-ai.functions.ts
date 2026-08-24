import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AiEmailDraft = { subject: string; body: string };

const DraftShape = z.object({
  subject: z.string().catch(""),
  body: z.string().catch(""),
});

const GROUPS = {
  prospective: "Prospective speakers for this event (status new / contacted / responded).",
  current_confirmed: "Speakers already confirmed for this event.",
  past_speakers: "People who spoke at previous events, being contacted about this one.",
  confirmed_not_registered:
    "Speakers confirmed for this event who have not registered in Tito yet.",
} as const;

const TOKENS: Array<[string, string]> = [
  ["first_name", "Recipient's first name, falls back to 'there'"],
  ["company", "Recipient's company"],
  ["job_title", "Recipient's job title"],
  ["event_name", "The event name"],
  ["event_date", "The event date, already formatted"],
  ["venue", "The event venue"],
  ["session_title", "The recipient's session title, if they have one"],
  ["speaker_pass_link", "Tito registration link for the speaker pass"],
  ["guest_pass_link", "Tito registration link for a guest pass"],
  ["past_event_name", "Name of the past event the recipient spoke at"],
  ["sales_contact_name", "Name of the delegate sales contact"],
  ["sales_contact_email", "Email of the delegate sales contact"],
  ["sales_contact_booking_link", "Booking link for the delegate sales contact"],
];

function systemPrompt(group: keyof typeof GROUPS, fieldNotes: string): string {
  return `You write plain, direct emails for an internal event operations tool. The copy is sent as a batch to many recipients from a Gmail account.

AUDIENCE: ${GROUPS[group]}

AVAILABLE {{curly_brace}} TOKENS (the app substitutes these per recipient):
${TOKENS.map(([k, d]) => `- {{${k}}}: ${d}`).join("\n")}

FIELD AVAILABILITY FROM REAL SAMPLE RECIPIENTS FOR THIS AUDIENCE:
${fieldNotes}

HARD RULES
- ONLY use {{curly_brace}} tokens from the list above for anything that varies by person or event. Never invent a token, never hardcode a specific name, date, venue or link.
- This is a batch send to many people, so the copy must stay templated, never written for one individual.
- Skip any token the sample data shows is usually empty for this audience.

HOUSE STYLE (apply verbatim)
- No em dashes anywhere.
- Sentence case for the subject line.
- Never say "this panel" or "this keynote", always say "this session".
- No generic AI sounding or templated marketing language.
- Keep it concise and direct.

TONE
- Infer urgency and tone from the request. A deadline approaching fast should read urgent, not casual.

OUTPUT
Return strict JSON only: {"subject": string, "body": string}
- body is the email body only. Do not include a greeting line, the app prepends "Hi {{first_name}},".
- body is plain text, **bold** markdown is allowed, no other HTML.
- Do not include a signature, the app appends one.`;
}

export const generateEmailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        prompt: z.string().min(3),
        event_id: z.string().uuid(),
        group: z.enum([
          "prospective",
          "current_confirmed",
          "past_speakers",
          "confirmed_not_registered",
        ]),
      })
      .parse(d),
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
    const eventContext = ["name", "code", "format", "event_date", "event_end_date", "venue", "venue_address"]
      .map((k) => `${k}: ${ev[k] == null ? "(not set)" : String(ev[k])}`)
      .join("\n");

    // Sample recipients for this audience so the model knows which
    // per-person fields are realistically populated.
    let sampleQuery = context.supabase
      .from("speakers")
      .select("name, company, title, session_title, status, source")
      .eq("event_id", data.event_id)
      .not("email", "is", null)
      .limit(8);
    if (data.group === "prospective") {
      sampleQuery = sampleQuery.in("status", ["new", "contacted", "responded"]);
    } else if (data.group === "current_confirmed" || data.group === "confirmed_not_registered") {
      sampleQuery = sampleQuery.eq("status", "confirmed");
    }
    const { data: samples } = await sampleQuery;
    const rows = (samples ?? []) as Array<Record<string, unknown>>;

    const fillRate = (k: string) =>
      rows.length
        ? `${rows.filter((r) => r[k] != null && String(r[k]).trim() !== "").length}/${rows.length}`
        : "no sample data";
    const fieldNotes = [
      `sample size: ${rows.length}`,
      `company populated: ${fillRate("company")}`,
      `job_title populated: ${fillRate("title")}`,
      `session_title populated: ${fillRate("session_title")}`,
      data.group === "past_speakers"
        ? "past_event_name is populated for this audience."
        : "past_event_name is empty for this audience, do not use it.",
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: systemPrompt(data.group, fieldNotes) },
          {
            role: "user",
            content: `Event context (for judgement only, always use the {{tokens}} in the copy itself):\n${eventContext}\n\nWhat I want to send:\n${data.prompt}`,
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
    let raw: unknown = {};
    try {
      raw = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}");
    } catch {
      throw new Error("The model returned an unreadable response, try again.");
    }
    const parsed = DraftShape.parse(raw);
    if (!parsed.body.trim()) throw new Error("The model returned an empty message.");
    return parsed as AiEmailDraft;
  });
