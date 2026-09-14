import { createFileRoute } from "@tanstack/react-router";

// Nightly Gmail reply-queue scan. Keeps last_inbound_at,
// last_message_direction and the "Reply received" timeline entries fresh
// without anyone having to press "Scan Gmail".
//
// Called by pg_cron at 06:00 UTC. Auth: apikey header must equal
// SUPABASE_PUBLISHABLE_KEY. The scan is idempotent (keyed on Gmail message
// id), so a re-run never duplicates anything.

export const Route = createFileRoute("/api/public/hooks/gmail-nightly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runReplyQueueScan } = await import("@/lib/reply-queue.functions");

        try {
          const result = await runReplyQueueScan(supabaseAdmin, 14);
          await stampHealth(
            supabaseAdmin,
            "gmail_replies",
            result.connected,
            result.connected
              ? `${result.scanned} threads scanned, ${result.queued} queued, ${result.auto_acked} auto-acked`
              : "Gmail connector not linked",
          );
          return Response.json({ ok: true, ...result });
        } catch (err: any) {
          console.error("[gmail-nightly] scan failed", err);
          await stampHealth(
            supabaseAdmin,
            "gmail_replies",
            false,
            err?.message ?? String(err),
          );
          return Response.json(
            { ok: false, error: err?.message ?? String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});

async function stampHealth(admin: any, kind: string, ok: boolean, note: string) {
  await admin.from("sync_health").upsert(
    { kind, last_run_at: new Date().toISOString(), ok, note, updated_at: new Date().toISOString() },
    { onConflict: "kind" },
  );
}
