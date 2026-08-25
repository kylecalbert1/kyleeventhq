import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const { classifyCommand, normalizeName, buildGmailQuery } = await import(
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
      .select("id, name, code")
      .order("name");
    if (evErr) throw new Error(evErr.message);
    const eventList = (events ?? []) as Array<{ id: string; name: string; code: string }>;

    const plan = await classifyCommand(
      data.text,
      eventList,
      data.eventId ?? null,
      lovableKey,
    );

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
