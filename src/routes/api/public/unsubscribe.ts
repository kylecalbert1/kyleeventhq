import { createFileRoute } from "@tanstack/react-router";
import {
  verifyUnsubscribeToken,
  normalizeEmail,
} from "@/lib/unsubscribe.server";

function page(title: string, message: string, status = 200) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;background:#faf8f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1c1917">
<div style="max-width:520px;margin:12vh auto;padding:32px;background:#fff;border:1px solid #ece7de;border-radius:18px">
<h1 style="margin:0 0 12px;font-size:20px">${title}</h1>
<p style="margin:0;font-size:15px;line-height:1.6;color:#57534e">${message}</p>
</div></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function record(email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("email_unsubscribes")
    .insert({ email, source: "link" });
  // Unique index means a repeat click is a success, not an error.
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
}

export const Route = createFileRoute("/api/public/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const email = verifyUnsubscribeToken(url.searchParams.get("t") ?? "");
        if (!email) {
          return page(
            "Link not recognised",
            "This unsubscribe link is invalid or incomplete. Please reply to the email you received and we'll remove you manually.",
            400,
          );
        }
        // One click in the email = unsubscribed. No extra confirmation step.
        try {
          await record(normalizeEmail(email));
        } catch (e) {
          console.error("Unsubscribe failed:", e);
          return page(
            "Something went wrong",
            "We couldn't process that right now. Please reply to the email and we'll remove you manually.",
            500,
          );
        }
        return page(
          "You're unsubscribed",
          `<strong>${email}</strong> will no longer receive marketing or event emails from us. It can take a moment to take effect across in-progress sends.`,
        );
      },
      // Gmail / Outlook one-click unsubscribe (RFC 8058)
      POST: async ({ request }) => {
        const url = new URL(request.url);
        let token = url.searchParams.get("t") ?? "";
        if (!token) {
          const text = await request.text();
          token = new URLSearchParams(text).get("t") ?? "";
        }
        const email = verifyUnsubscribeToken(token);
        if (!email) return new Response("Invalid token", { status: 400 });
        try {
          await record(normalizeEmail(email));
        } catch (e) {
          console.error("One-click unsubscribe failed:", e);
          return new Response("Error", { status: 500 });
        }
        return new Response("OK");
      },
    },
  },
});
