import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function b64url(str: string) {
  // Base64url-encode a UTF-8 string (Node/Worker-safe)
  const b64 = Buffer.from(str, "utf-8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Wrap an authored HTML fragment (contentEditable output: bare `<div>` /
 * `<br>` blocks) in a real HTML document so Gmail's sanitizer keeps the
 * block structure instead of flattening it.
 */
function wrapHtmlDocument(fragment: string) {
  if (/<html[\s>]/i.test(fragment)) return fragment;
  return [
    "<!DOCTYPE html>",
    '<html><head><meta charset="utf-8"></head>',
    '<body><div style="white-space:normal">',
    fragment,
    "</div></body></html>",
  ].join("");
}

/** Split base64 into RFC 2045 compliant 76-character lines. */
function chunk76(b64: string) {
  return (b64.match(/.{1,76}/g) ?? []).join("\r\n");
}

function buildRawEmail(opts: { to: string; subject: string; body: string; isHtml?: boolean }) {
  const contentType = opts.isHtml
    ? 'text/html; charset="UTF-8"'
    : 'text/plain; charset="UTF-8"';
  const content = opts.isHtml ? wrapHtmlDocument(opts.body) : opts.body;
  // Always base64 the body. A single unwrapped HTML line trivially exceeds the
  // RFC 5322 998-octet line limit, and any non-ASCII character (curly quote,
  // em dash) is illegal under `7bit` — both cause MTAs to hard-wrap or re-encode
  // the body mid-tag, which destroys <div>/<br> structure on delivery.
  const encodedBody = chunk76(Buffer.from(content, "utf-8").toString("base64"));
  const lines = [
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject, "utf-8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: ${contentType}`,
    "Content-Transfer-Encoding: base64",
    "",
    encodedBody,
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
        isHtml: z.boolean().optional(),
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

    const raw = buildRawEmail({ ...data, isHtml: data.isHtml });
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
