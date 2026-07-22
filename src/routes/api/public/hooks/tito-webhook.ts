import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// Tito webhook receiver. Real-time upserts to keep tito_tickets fresh without
// waiting for the nightly reconcile.
//
// Configure in Tito:
//   URL: https://<project-host>/api/public/hooks/tito-webhook
//   Events: ticket.created, ticket.updated, ticket.completed, registration.finished
//   Security: paste a strong random string into Tito's webhook secret AND
//             store the exact same value in Project Settings → Secrets as
//             TITO_WEBHOOK_SECRET. If unset, all requests are accepted (dev only).

export const Route = createFileRoute("/api/public/hooks/tito-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();

        // 1. Signature check (Tito uses HMAC-SHA256 over the raw body,
        //    hex-encoded, sent as X-Webhook-Signature).
        const secret = process.env.TITO_WEBHOOK_SECRET;
        if (secret) {
          const provided = request.headers.get("x-webhook-signature") ?? "";
          const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
          const a = Buffer.from(provided);
          const b = Buffer.from(expected);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            console.warn("[tito-webhook] signature mismatch");
            return new Response("Invalid signature", { status: 401 });
          }
        }

        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const eventName =
          request.headers.get("x-webhook-name") ??
          payload?.event ??
          payload?.type ??
          "unknown";

        // Extract the event slug from any of the shapes Tito uses.
        const eventSlug: string | null =
          payload?.event?.slug ??
          payload?.ticket?.event?.slug ??
          payload?.registration?.event?.slug ??
          payload?.event_slug ??
          null;

        console.log("[tito-webhook] received", { eventName, eventSlug });

        if (!eventSlug) {
          // Nothing actionable; ack so Tito doesn't retry-storm.
          return new Response("ok (no slug)", { status: 200 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const token = process.env.TITO_API_TOKEN;
          if (!token) {
            console.error("[tito-webhook] TITO_API_TOKEN not set");
            return new Response("ok (no token)", { status: 200 });
          }

          // Only sync events the user has actually mapped in this app.
          const { data: mapped } = await supabaseAdmin
            .from("events")
            .select("id")
            .eq("tito_slug", eventSlug)
            .limit(1);

          if (!mapped || mapped.length === 0) {
            console.log("[tito-webhook] slug not mapped, skipping full sync", eventSlug);
            // Still stamp the tito_events row so Settings shows the ping.
            await supabaseAdmin
              .from("tito_events")
              .update({ last_webhook_at: new Date().toISOString() })
              .eq("slug", eventSlug);
            return new Response("ok (unmapped)", { status: 200 });
          }

          const { syncSingleEventBySlug } = await import("@/lib/tito.functions");
          await syncSingleEventBySlug(supabaseAdmin as any, token, eventSlug);

          await supabaseAdmin
            .from("tito_events")
            .update({ last_webhook_at: new Date().toISOString() })
            .eq("slug", eventSlug);

          return new Response("ok", { status: 200 });
        } catch (e) {
          console.error("[tito-webhook] handler error", e);
          // 200 on purpose so Tito doesn't queue endless retries for a
          // transient bug on our side. We already logged it.
          return new Response("ok (logged)", { status: 200 });
        }
      },
    },
  },
});
