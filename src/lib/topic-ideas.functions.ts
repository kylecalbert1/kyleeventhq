import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

function systemPrompt(): string {
  return `You help an event operations team decide what session topic to pitch to a prospective speaker. You are given raw profile text the organiser pasted (LinkedIn About section, work history, recent posts), the event it is for, the slot format, and the session topics already being pitched to other speakers at that same event.

HARD RULES
- Use only verified, specific facts from the pasted profile: real quotes, concrete numbers, named projects, named employers, named products. Never build a topic on generic bio adjectives ("visionary leader", "passionate about innovation").
- Prefer recent original posts over About-section language. About sections often echo a former employer's marketing copy, so treat them as weak evidence.
- Calibrate to the audience. If the event is aimed at senior or executive peers already at that level, never suggest a "how I became a [title]" career-journey topic. That framing only works for mixed-seniority practitioner audiences.
- Reject vague, tagline-style topics. Every topic must have a concrete mechanism, method, number or genuine point of debate underneath it.
- Do not force a single-industry-specific detail onto a mixed-industry audience.
- If a topic is close to one already being pitched to another speaker at this event, say so explicitly in overlap_note, naming the other topic. Never silently duplicate it.
- Titles must sell the session to an attendee deciding which room to walk into. Do not just restate the speaker's job title. Avoid confessional or vulnerable framing ("what I got wrong about...") unless the profile clearly calls for it.
- Match structure to format: keynote and fireside need one strong narrative; panel needs a topic several people could genuinely disagree about; workshop needs something the room can practise; roundtable needs a discussion prompt, not a lecture.
- If the person's background does not fit the event's actual subject matter at all, set fit to "poor" and explain plainly in fit_note instead of inventing forced topics. Return an empty topics array in that case.
- No em dashes anywhere. Sentence case titles. No generic AI sounding marketing language.

OUTPUT
Return strict JSON only:
{"fit":"good"|"poor","fit_note":string|null,"overlap_note":string|null,"topics":[{"rank":1,"title":string,"description":string}]}
- topics: exactly 3 when fit is "good", ranked 1 to 3 best first, description 1 to 2 sentences.
- overlap_note: null when there is no meaningful overlap.
- fit_note: null when the fit is good and needs no caveat.`;
}

export const generateTopicIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ speaker_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<TopicIdeasResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured");

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

    const { data: siblings } = await context.supabase
      .from("speakers")
      .select("name, session_title, session_format")
      .eq("event_id", speaker.event_id)
      .neq("id", speaker.id)
      .not("session_title", "is", null);

    const others = (siblings ?? [])
      .filter((s) => (s.session_title ?? "").trim().length > 0)
      .map((s) => `- ${s.name}: "${s.session_title}"${s.session_format ? ` (${s.session_format})` : ""}`)
      .join("\n");

    const userContent = [
      `EVENT`,
      `name: ${event?.name ?? "(unknown)"}`,
      `code: ${event?.code ?? "(unknown)"}`,
      `business line: ${event?.business_line ?? "(unknown)"}`,
      `format: ${event?.format ?? "(unknown)"}`,
      `venue: ${event?.venue ?? "(not set)"}`,
      ``,
      `SPEAKER`,
      `name: ${speaker.name}`,
      `job title: ${speaker.title ?? "(not set)"}`,
      `company: ${speaker.company ?? "(not set)"}`,
      `slot format: ${speaker.session_format ?? "(not chosen yet, suggest what fits best and say which format you assumed)"}`,
      `current session title: ${speaker.session_title ?? "(none)"}`,
      ``,
      `PASTED PROFILE TEXT`,
      profile,
      ``,
      `TOPICS ALREADY BEING PITCHED AT THIS EVENT`,
      others || "(none yet)",
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: systemPrompt() },
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

    const generated_at = new Date().toISOString();
    const stored: TopicIdeasResult = { ...parsed, generated_at };
    const { error: uErr } = await context.supabase
      .from("speakers")
      .update({ topic_ideas: stored as never, topic_ideas_generated_at: generated_at })
      .eq("id", speaker.id);
    if (uErr) throw new Error(uErr.message);

    return stored;
  });
