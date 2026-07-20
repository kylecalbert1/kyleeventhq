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
  follow_up: "Follow-up — no reply",
  custom: "Custom / blank",
};

const RecipientInput = z.object({
  speaker_id: z.string().uuid().nullable().optional(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
});

const LogInput = z.object({
  event_id: z.string().uuid().nullable().optional(),
  template_type: z.enum(TEMPLATE_TYPES),
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

    const recipientRows = data.recipients.map((r) => ({
      email_send_id: sendRow.id,
      speaker_id: r.speaker_id ?? null,
      recipient_email: r.email ?? null,
      recipient_name: r.name ?? null,
    }));
    const { error: recErr } = await context.supabase
      .from("email_send_recipients")
      .insert(recipientRows);
    if (recErr) throw new Error(recErr.message);

    // Best-effort activity log per speaker
    const activityRows = data.recipients
      .filter((r) => r.speaker_id)
      .map((r) => ({
        speaker_id: r.speaker_id!,
        event_type: "email_sent",
        note: `${TEMPLATE_LABELS[data.template_type]} — ${data.subject}`,
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
