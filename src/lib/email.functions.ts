import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function b64url(str: string) {
  // Base64url-encode a UTF-8 string (Node/Worker-safe)
  const b64 = Buffer.from(str, "utf-8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRawEmail(opts: { to: string; subject: string; body: string }) {
  // Simple text/plain UTF-8 email
  const lines = [
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject, "utf-8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.body,
  ];
  return b64url(lines.join("\r\n"));
}

export const checkGmailConnected = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return {
      connected: Boolean(process.env.LOVABLE_API_KEY && process.env.GOOGLE_MAIL_API_KEY),
    };
  });

export const sendGmailEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        to: z.string().email(),
        subject: z.string().min(1),
        body: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connKey = process.env.GOOGLE_MAIL_API_KEY;
    if (!lovableKey || !connKey) {
      throw new Error(
        "Gmail is not connected. Open Connectors and connect your Google account.",
      );
    }

    const raw = buildRawEmail(data);
    const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Gmail send failed [${res.status}]: ${text}`);
      // Surface a clean, actionable message
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          "Gmail rejected the request. Reconnect Gmail in Connectors with 'Send email' scope.",
        );
      }
      throw new Error(`Gmail send failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id ?? null };
  });
