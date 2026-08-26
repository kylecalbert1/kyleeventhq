import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TEMPLATE_TYPES = [
  "confirmation",
  "banner_reminder",
  "bio_headshot_reminder",
  "follow_up",
  "custom",
] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export const TEMPLATE_LABELS: Record<TemplateType, string> = {
  confirmation: "Speaker confirmation",
  banner_reminder: "Banner request reminder",
  bio_headshot_reminder: "Bio & headshot reminder",
  follow_up: "Follow-up - no reply",
  custom: "Custom / blank",
};

const RecipientInput = z.object({
  speaker_id: z.string().uuid().nullable().optional(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
});

const LogInput = z.object({
  event_id: z.string().uuid().nullable().optional(),
  // Free-form: legacy keys ("custom", "confirmation", ...) AND saved template
  // slugs from the message/email template library. This used to be a strict
  // z.enum(TEMPLATE_TYPES), which threw for every DB-template send and meant
  // nothing got logged.
  template_type: z.string().min(1).max(120).default("custom"),
  subject: z.string().min(1),
  body: z.string().min(1),
  recipients: z.array(RecipientInput).min(1),
});


export const logEmailSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => LogInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: sendRow, error: sendErr } = await context.supabase
      .from("email_sends")
      .insert({
        event_id: data.event_id ?? null,
        template_type: data.template_type,
        subject: data.subject,
        body: data.body,
        recipient_count: data.recipients.length,
      })
      .select()
      .single();
    if (sendErr) throw new Error(sendErr.message);

    // Validate speaker_ids - callers may pass non-speaker ids (e.g. Tito
    // ticket ids) which would violate the FK. Keep only ids that exist.
    const candidateIds = Array.from(
      new Set(
        data.recipients
          .map((r) => r.speaker_id)
          .filter((v): v is string => !!v),
      ),
    );
    let validIds = new Set<string>();
    if (candidateIds.length) {
      const { data: existing, error: exErr } = await context.supabase
        .from("speakers")
        .select("id")
        .in("id", candidateIds);
      if (exErr) throw new Error(exErr.message);
      validIds = new Set((existing ?? []).map((r) => (r as { id: string }).id));
    }

    const recipientRows = data.recipients.map((r) => ({
      email_send_id: sendRow.id,
      speaker_id: r.speaker_id && validIds.has(r.speaker_id) ? r.speaker_id : null,
      recipient_email: r.email ?? null,
      recipient_name: r.name ?? null,
    }));
    const { error: recErr } = await context.supabase
      .from("email_send_recipients")
      .insert(recipientRows);
    if (recErr) throw new Error(recErr.message);

    // Best-effort activity log per speaker
    const activityRows = data.recipients
      .filter((r) => r.speaker_id && validIds.has(r.speaker_id))
      .map((r) => ({
        speaker_id: r.speaker_id!,
        event_type: "email_sent",
        note: `${(TEMPLATE_LABELS as Record<string, string | undefined>)[data.template_type] ?? data.template_type} - ${data.subject}`,
      }));
    if (activityRows.length) {
      await context.supabase.from("speaker_activity_log").insert(activityRows);
    }

    return { id: sendRow.id };
  });

export const listEmailSends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ event_id: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("email_sends")
      .select("*, email_send_recipients(*)")
      .order("sent_at", { ascending: false })
      .limit(100);
    if (data.event_id) q = q.eq("event_id", data.event_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      event_id: string | null;
      template_type: TemplateType;
      subject: string;
      body: string;
      recipient_count: number;
      sent_by: string;
      sent_at: string;
      created_at: string;
      email_send_recipients: Array<{
        id: string;
        speaker_id: string | null;
        recipient_email: string | null;
        recipient_name: string | null;
      }>;
    }>;
  });

// ---------- History & tracked lookups (for "already contacted" and
// "already in my database" surfacing across cards) ----------

const EmailsInput = z.object({
  emails: z.array(z.string()).max(3000),
});

export const getContactHistoryByEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => EmailsInput.parse(d))
  .handler(async ({ data, context }) => {
    const emails = Array.from(
      new Set(
        data.emails
          .map((e) => (e ?? "").trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    if (!emails.length) {
      return [] as Array<{
        email: string;
        count: number;
        last_sent_at: string | null;
      }>;
    }
    const { data: rows, error } = await context.supabase
      .from("email_send_recipients")
      .select("recipient_email, email_sends(sent_at)")
      .in("recipient_email", emails);
    if (error) throw new Error(error.message);

    const map = new Map<
      string,
      { count: number; last_sent_at: string | null }
    >();
    for (const r of rows ?? []) {
      const em = ((r as { recipient_email: string | null }).recipient_email ?? "")
        .toLowerCase();
      if (!em) continue;
      const sent =
        ((r as { email_sends?: { sent_at?: string } | null }).email_sends
          ?.sent_at as string | null | undefined) ?? null;
      const cur = map.get(em);
      if (!cur) {
        map.set(em, { count: 1, last_sent_at: sent });
      } else {
        cur.count += 1;
        if (sent && (!cur.last_sent_at || sent > cur.last_sent_at)) {
          cur.last_sent_at = sent;
        }
      }
    }
    return Array.from(map.entries()).map(([email, v]) => ({
      email,
      count: v.count,
      last_sent_at: v.last_sent_at,
    }));
  });

export const getTrackedByEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => EmailsInput.parse(d))
  .handler(async ({ data, context }) => {
    const emails = Array.from(
      new Set(
        data.emails
          .map((e) => (e ?? "").trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    if (!emails.length) {
      return [] as Array<{
        email: string;
        speaker_id: string;
        event_id: string;
        event_name: string | null;
        status: string | null;
        source: string | null;
      }>;
    }
    const { data: rows, error } = await context.supabase
      .from("speakers")
      .select("id, email, event_id, status, source, events(name)")
      .in("email", emails);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const row = r as {
        id: string;
        email: string | null;
        event_id: string;
        status: string | null;
        source: string | null;
        events: { name: string | null } | null;
      };
      return {
        email: (row.email ?? "").toLowerCase(),
        speaker_id: row.id,
        event_id: row.event_id,
        event_name: row.events?.name ?? null,
        status: row.status,
        source: row.source,
      };
    });
  });

/** Sends addressed to one speaker, newest first — used by the speaker timeline. */
export const listSpeakerSends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ speaker_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("email_send_recipients")
      .select("id, created_at, email_sends(id, subject, template_type, sent_at)")
      .eq("speaker_id", data.speaker_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      subject: (r.email_sends?.subject ?? null) as string | null,
      template_type: (r.email_sends?.template_type ?? null) as string | null,
      sent_at: (r.email_sends?.sent_at ?? r.created_at) as string,
    }));
  });
