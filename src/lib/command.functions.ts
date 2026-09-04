import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateMessageDraft, type AiMessageDraft } from "@/lib/message-ai.functions";
import { type MessageEvent } from "@/lib/message-render";

export const runCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        text: z.string().min(1).max(2000),
        eventId: z.string().uuid().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { classifyCommand, normalizeName, buildGmailQuery, answerQuestion } = await import(
      "@/lib/command.server"
    );

    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!lovableKey) {
      return {
        intent: "unknown" as const,
        clarification: "The AI service isn't configured, so I can't interpret commands yet.",
      };
    }

    const { data: events, error: evErr } = await context.supabase
      .from("events")
      .select("id, name, code, event_date, event_end_date")
      .order("name");
    if (evErr) throw new Error(evErr.message);
    const eventList = (events ?? []) as Array<{
      id: string;
      name: string;
      code: string;
      event_date: string | null;
      event_end_date: string | null;
    }>;

    const plan = await classifyCommand(
      data.text,
      eventList,
      data.eventId ?? null,
      lovableKey,
    );

    if (plan.intent === "navigate" && plan.destination) {
      return {
        intent: "navigate" as const,
        destination: plan.destination,
        destination_label: plan.destination_label,
      };
    }

    if (plan.intent === "answer") {
      const { data: speakers } = await context.supabase
        .from("speakers")
        .select("event_id, status, email, bio_received, headshot_received")
        .limit(2000);

      const byEvent = new Map<string, any[]>();
      for (const s of speakers ?? []) {
        const k = (s as any).event_id ?? "none";
        if (!byEvent.has(k)) byEvent.set(k, []);
        byEvent.get(k)!.push(s);
      }

      const today = new Date().toISOString().slice(0, 10);
      const lines = eventList.map((e) => {
        const rows = byEvent.get(e.id) ?? [];
        const counts: Record<string, number> = {};
        for (const r of rows) counts[r.status ?? "unknown"] = (counts[r.status ?? "unknown"] ?? 0) + 1;
        const missingBio = rows.filter((r) => r.bio_received === false).length;
        const missingHead = rows.filter((r) => r.headshot_received === false).length;
        const missingEmail = rows.filter((r) => !r.email).length;
        return `- ${e.name} (${e.code}) id=${e.id} | date=${e.event_date ?? "TBC"}${
          e.event_end_date ? `..${e.event_end_date}` : ""
        } | speakers=${rows.length} | by status: ${
          Object.entries(counts)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ") || "none"
        } | missing bio=${missingBio}, headshot=${missingHead}, email=${missingEmail}`;
      });

      const summary = `Today is ${today}.\nEvents:\n${lines.join("\n") || "(no events)"}`;
      const answer = await answerQuestion(data.text, summary, lovableKey);
      return { intent: "answer" as const, answer };
    }


    if (plan.intent === "search_speakers") {
      let q = context.supabase
        .from("speakers")
        .select(
          "id, name, email, title, company, status, bio_received, headshot_received, banner_status, event_id, events(name, code)",
        )
        .order("name")
        .limit(50);

      if (plan.event_match.event_id) q = q.eq("event_id", plan.event_match.event_id);
      if (plan.filters.status) q = q.eq("status", plan.filters.status as never);
      if (plan.filters.missing === "email") q = q.or("email.is.null,email.eq.");
      if (plan.filters.missing === "bio") q = q.eq("bio_received", false);
      if (plan.filters.missing === "headshot") q = q.eq("headshot_received", false);
      if (plan.filters.missing === "banner") q = q.neq("banner_status", "confirmed_live");
      if (plan.filters.free_text) {
        const t = plan.filters.free_text.replace(/[%,]/g, " ").trim();
        if (t) q = q.or(`name.ilike.%${t}%,title.ilike.%${t}%,company.ilike.%${t}%`);
      }

      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);

      return {
        intent: "search_speakers" as const,
        filters: plan.filters,
        event_id: plan.event_match.event_id,
        speakers: (rows ?? []) as any[],
      };
    }

    if (plan.intent === "scan_gmail_for_event") {
      const eventId = plan.event_match.event_id;
      const okConfidence =
        plan.event_match.confidence === "high" || plan.event_match.confidence === "medium";
      const event = eventList.find((e) => e.id === eventId);
      if (!eventId || !okConfidence || !event) {
        return {
          intent: "unknown" as const,
          clarification:
            plan.clarification ||
            "I need to know which event to scan for — name it more precisely.",
        };
      }

      const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
      if (!gmailKey) {
        return { intent: "scan_gmail_for_event" as const, connected: false as const, event, suggestions: [] };
      }

      const { gmailSearch, gmailGetThread, gmailProfileEmail, externalParticipant, header, extractText } =
        await import("@/lib/sync.functions");

      const { data: existing, error: spErr } = await context.supabase
        .from("speakers")
        .select("name, email")
        .eq("event_id", eventId);
      if (spErr) throw new Error(spErr.message);
      const existingEmails = new Set(
        (existing ?? []).map((s) => (s.email ?? "").toLowerCase().trim()).filter(Boolean),
      );
      const existingNames = new Set(
        (existing ?? []).map((s) => normalizeName(s.name)).filter(Boolean),
      );

      const myEmail = await gmailProfileEmail(lovableKey, gmailKey);
      const query = buildGmailQuery(event, plan.gmail_keywords);
      const found = await gmailSearch(query, lovableKey, gmailKey, 25);

      const threadIds = Array.from(
        new Set((found.messages ?? []).map((m) => m.threadId)),
      ).slice(0, 20);

      type Suggestion = {
        name: string;
        email: string;
        subject: string;
        snippet: string;
        thread_id: string;
        received_at: string;
      };
      const suggestions: Suggestion[] = [];
      const seen = new Set<string>();

      for (const tid of threadIds) {
        try {
          const thread = await gmailGetThread(tid, lovableKey, gmailKey);
          const messages = thread.messages ?? [];
          if (!messages.length) continue;
          const last = messages[messages.length - 1];
          const external = externalParticipant(messages as any, myEmail);
          if (!external) continue;
          const email = external.email.toLowerCase().trim();
          if (!email.includes("@")) continue;
          if (existingEmails.has(email) || seen.has(email)) continue;

          const rawName = (external.raw.match(/^\s*"?([^"<]+)"?\s*</)?.[1] ?? "").trim();
          const name = rawName || email.split("@")[0] || email;
          if (existingNames.has(normalizeName(name))) continue;

          seen.add(email);
          suggestions.push({
            name,
            email,
            subject: header(last.payload.headers, "Subject") || "(no subject)",
            snippet: extractText(last.payload).slice(0, 220).replace(/\s+/g, " ").trim(),
            thread_id: tid,
            received_at: new Date(Number(last.internalDate)).toISOString(),
          });
        } catch (e) {
          console.error(`Command gmail scan: skip thread ${tid}`, e);
        }
      }

      suggestions.sort((a, b) => (a.received_at < b.received_at ? 1 : -1));

      return {
        intent: "scan_gmail_for_event" as const,
        connected: true as const,
        event,
        suggestions,
      };
    }

    if (plan.intent === "compose_message") {
      const eventId = plan.event_match.event_id;
      const okConfidence =
        plan.event_match.confidence === "high" || plan.event_match.confidence === "medium";
      const event = eventList.find((e) => e.id === eventId);
      if (!eventId || !okConfidence || !event) {
        return {
          intent: "unknown" as const,
          clarification:
            plan.clarification ||
            "I need to know which event to compose a message for — name it more precisely.",
        };
      }

      const { data: fullEvent, error: evErr } = await context.supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .maybeSingle();
      if (evErr) throw new Error(evErr.message);
      if (!fullEvent) throw new Error("Event not found");

      const draft = await generateMessageDraft({
        data: { prompt: data.text, event_id: eventId },
      });

      return {
        intent: "compose_message" as const,
        event: fullEvent as MessageEvent,
        draft: draft as AiMessageDraft,
      };
    }

    return { intent: "unknown" as const, clarification: plan.clarification };
  });

export const addSpeakerFromSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        eventId: z.string().uuid(),
        name: z.string().min(1),
        email: z.string().email(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { findOrMergeSpeaker } = await import("@/lib/speaker-dedupe.server");
    const res = await findOrMergeSpeaker(context.supabase, {
      event_id: data.eventId,
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      status: "new",
      source: "gmail_scan",
    });
    return { id: res.row?.id as string, merged: res.merged };
  });
