import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SUMMIT_SERIES, type SummitSeries } from "@/lib/status";

export type TopicIdea = { rank: number; title: string; description: string };
export type TopicIdeasResult = {
  fit: "good" | "poor";
  fit_note: string | null;
  overlap_note: string | null;
  topics: TopicIdea[];
  generated_at?: string | null;
};

const ResultShape = z.object({
  fit: z.enum(["good", "poor"]).catch("good"),
  fit_note: z.string().nullable().catch(null),
  overlap_note: z.string().nullable().catch(null),
  topics: z
    .array(
      z.object({
        rank: z.number().int().catch(1),
        title: z.string().catch(""),
        description: z.string().catch(""),
      }),
    )
    .catch([]),
});

const SERIES_GUIDANCE: Record<SummitSeries, string> = {
  cco_summit:
    "CCO Summit. The room is senior customer/chief customer officers and their direct peers. They are already at the top of the function, so never suggest a career-journey or "how I became a CCO" topic. Pitch peer-level strategic problems, board-facing arguments, operating-model decisions and numbers they can benchmark against.",
  customer_success_summit:
    "Customer Success Summit. Mixed-seniority customer success practitioners, from ICs and team leads to VPs. Career development, craft and playbook topics are all fair game. Keep it practical and transferable rather than boardroom-only.",
  ai_customer_support_summit:
    "AI for Customer Support Summit. A narrow, functional support-operations audience: support leaders, ops managers and the people running deflection, QA, tooling and agent workflows. Topics must stay inside support operations. Do not drift into generic CX strategy or generic AI hype.",
  generative_ai_summit:
    "Generative AI Summit. Technical engineers, ML and platform people, plus AI executives. They expect architecture, evaluation, model choices, cost and failure modes. A customer success or CX leadership background is NOT automatically relevant here; only propose topics if the profile shows a genuine technical angle, and otherwise set fit to poor.",
  agentic_ai_summit:
    "Agentic AI Summit. Technical engineers building agents plus AI executives. They expect real detail on orchestration, tool use, evaluation, guardrails, reliability and cost. A customer success or CX leadership background is NOT automatically relevant; require a real technical or hands-on deployment angle, otherwise set fit to poor.",
};

export function systemPrompt(series?: SummitSeries | null): string {
  const audience = series
    ? SERIES_GUIDANCE[series]
    : "No specific summit series was selected. Infer the audience from the event name and context given, and say which audience you assumed in fit_note.";

  return `You help an event operations team decide what session topic to pitch to a prospective speaker. You are given raw profile text the organiser pasted (LinkedIn About section, work history, recent posts), the event it is for, the slot format, and the session topics already being pitched to other speakers at that same event.

AUDIENCE CALIBRATION
${audience}
Calibrate seniority, technical depth and subject domain to that audience. Do not assume a senior customer success or CX executive room unless the audience above says so.

HARD RULES
- Use only verified, specific facts from the pasted profile: real quotes, concrete numbers, named projects, named employers, named products. Never build a topic on generic bio adjectives ("visionary leader", "passionate about innovation").
- Prefer recent original posts over About-section language. About sections often echo a former employer's marketing copy, so treat them as weak evidence.
- Reject vague, tagline-style topics. Every topic must have a concrete mechanism, method, number or genuine point of debate underneath it.
- Do not force a single-industry-specific detail onto a mixed-industry audience.
- If a topic is close to one already being pitched to another speaker at this event, say so explicitly in overlap_note, naming the other topic. Never silently duplicate it.
- Titles must sell the session to an attendee deciding which room to walk into. Do not just restate the speaker's job title. Avoid confessional or vulnerable framing ("what I got wrong about...") unless the profile clearly calls for it.
- Match structure to format: keynote and fireside need one strong narrative; panel needs a topic several people could genuinely disagree about; workshop needs something the room can practise; roundtable needs a discussion prompt, not a lecture.
- If the person's background does not fit the audience or the event's actual subject matter, set fit to "poor" and explain plainly in fit_note instead of inventing forced topics. Return an empty topics array in that case.
- No em dashes anywhere. Sentence case titles. No generic AI sounding marketing language.

OUTPUT
Return strict JSON only:
{"fit":"good"|"poor","fit_note":string|null,"overlap_note":string|null,"topics":[{"rank":1,"title":string,"description":string}]}
- topics: exactly 3 when fit is "good", ranked 1 to 3 best first, description 1 to 2 sentences.
- overlap_note: null when there is no meaningful overlap.
- fit_note: null when the fit is good and needs no caveat.`;
}

export type TopicIdeasCoreInput = {
  profile: string;
  series?: SummitSeries | null;
  event_name?: string | null;
  event_context?: string[];
  speaker_name?: string | null;
  speaker_title?: string | null;
  speaker_company?: string | null;
  session_format?: string | null;
  current_session_title?: string | null;
  other_topics?: string | null;
};

// Core generation. Takes plain inputs, no database lookup, no persistence.
export async function runTopicIdeas(input: TopicIdeasCoreInput): Promise<TopicIdeasResult> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured");

  const profile = (input.profile ?? "").trim();
  if (profile.length < 40) {
    throw new Error(
      "Add the profile text first (paste their LinkedIn About section, work history or recent posts).",
    );
  }

  const userContent = [
    `EVENT`,
    `name: ${input.event_name?.trim() || "(not given)"}`,
    ...(input.event_context ?? []),
    ``,
    `SPEAKER`,
    `name: ${input.speaker_name?.trim() || "(not given)"}`,
    `job title: ${input.speaker_title?.trim() || "(not set)"}`,
    `company: ${input.speaker_company?.trim() || "(not set)"}`,
    `slot format: ${input.session_format || "(not chosen yet, suggest what fits best and say which format you assumed)"}`,
    `current session title: ${input.current_session_title?.trim() || "(none)"}`,
    ``,
    `PASTED PROFILE TEXT`,
    profile,
    ``,
    `TOPICS ALREADY BEING PITCHED AT THIS EVENT`,
    input.other_topics?.trim() || "(none yet)",
  ].join("\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-3.7-flash",
      messages: [
        { role: "system", content: systemPrompt(input.series ?? null) },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (res.status === 429) throw new Error("AI rate limit, try again shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted, top up to continue.");
  if (!res.ok) throw new Error(`AI error ${res.status}`);

  const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  let raw: unknown = {};
  try {
    raw = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}");
  } catch {
    throw new Error("The model returned an unreadable response, try again.");
  }
  const parsed = ResultShape.parse(raw);
  if (parsed.fit === "good" && parsed.topics.length === 0) {
    throw new Error("The model returned no topics, try again.");
  }
  return { ...parsed, generated_at: new Date().toISOString() };
}

export const generateTopicIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        speaker_id: z.string().uuid(),
        series: z.enum(SUMMIT_SERIES).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<TopicIdeasResult> => {
    const { data: speaker, error: sErr } = await context.supabase
      .from("speakers")
      .select("id, name, company, title, notes, profile_notes, session_format, session_title, event_id")
      .eq("id", data.speaker_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!speaker) throw new Error("Speaker not found");

    const profile = (speaker.profile_notes || speaker.notes || "").trim();
    if (profile.length < 40) {
      throw new Error(
        "Add the speaker's profile text first (paste their LinkedIn About section, work history or recent posts into Profile notes).",
      );
    }

    const { data: event, error: eErr } = await context.supabase
      .from("events")
      .select("name, code, business_line, format, event_date, venue")
      .eq("id", speaker.event_id)
      .maybeSingle();
    if (eErr) throw new Error(eErr.message);

    const others = await siblingTopics(context.supabase, speaker.event_id, speaker.id);

    const result = await runTopicIdeas({
      profile,
      series: data.series ?? null,
      event_name: event?.name ?? null,
      event_context: eventContextLines(event),
      speaker_name: speaker.name,
      speaker_title: speaker.title,
      speaker_company: speaker.company,
      session_format: speaker.session_format,
      current_session_title: speaker.session_title,
      other_topics: others,
    });

    const { error: uErr } = await context.supabase
      .from("speakers")
      .update({
        topic_ideas: result as never,
        topic_ideas_generated_at: result.generated_at ?? new Date().toISOString(),
      })
      .eq("id", speaker.id);
    if (uErr) throw new Error(uErr.message);

    return result;
  });

// Ad-hoc, scratchpad generation. No speaker record required, nothing persisted.
export const generateTopicIdeasAdhoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        profile: z.string().min(1),
        series: z.enum(SUMMIT_SERIES).nullable().optional(),
        event_id: z.string().uuid().nullable().optional(),
        event_name: z.string().nullable().optional(),
        session_format: z
          .enum(["keynote", "panel", "workshop", "fireside", "roundtable"])
          .nullable()
          .optional(),
        speaker_name: z.string().nullable().optional(),
        other_topics: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<TopicIdeasResult> => {
    let eventName = data.event_name ?? null;
    let contextLines: string[] = [];
    let others = data.other_topics ?? "";

    if (data.event_id) {
      const { data: event } = await context.supabase
        .from("events")
        .select("name, code, business_line, format, event_date, venue")
        .eq("id", data.event_id)
        .maybeSingle();
      if (event) {
        eventName = event.name;
        contextLines = eventContextLines(event);
        const tracked = await siblingTopics(context.supabase, data.event_id, null);
        others = [others, tracked].filter((s) => s && s.trim().length > 0).join("\n");
      }
    }

    return runTopicIdeas({
      profile: data.profile,
      series: data.series ?? null,
      event_name: eventName,
      event_context: contextLines,
      speaker_name: data.speaker_name ?? null,
      session_format: data.session_format ?? null,
      other_topics: others,
    });
  });

type EventRow = {
  name?: string | null;
  code?: string | null;
  business_line?: string | null;
  format?: string | null;
  venue?: string | null;
} | null;

function eventContextLines(event: EventRow): string[] {
  if (!event) return [];
  return [
    `code: ${event.code ?? "(unknown)"}`,
    `business line: ${event.business_line ?? "(unknown)"}`,
    `format: ${event.format ?? "(unknown)"}`,
    `venue: ${event.venue ?? "(not set)"}`,
  ];
}

async function siblingTopics(
  supabase: { from: (t: string) => any },
  eventId: string,
  excludeSpeakerId: string | null,
): Promise<string> {
  let q = supabase
    .from("speakers")
    .select("name, session_title, session_format")
    .eq("event_id", eventId)
    .not("session_title", "is", null);
  if (excludeSpeakerId) q = q.neq("id", excludeSpeakerId);
  const { data: siblings } = await q;
  return ((siblings ?? []) as Array<{ name: string; session_title: string | null; session_format: string | null }>)
    .filter((s) => (s.session_title ?? "").trim().length > 0)
    .map((s) => `- ${s.name}: "${s.session_title}"${s.session_format ? ` (${s.session_format})` : ""}`)
    .join("\n");
}
