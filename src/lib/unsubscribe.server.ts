import { createHmac, timingSafeEqual } from "crypto";

/**
 * Public base URL used inside outbound emails. The published site is the only
 * host external recipients can reach, so it is the default; override with
 * PUBLIC_SITE_URL if the app moves to a custom domain.
 */
export function publicSiteUrl() {
  return (process.env.PUBLIC_SITE_URL || "https://kyleeventhq.lovable.app").replace(
    /\/+$/,
    "",
  );
}

function secret() {
  const s =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_DB_URL ||
    process.env.LOVABLE_API_KEY;
  if (!s) throw new Error("No server secret available for unsubscribe tokens");
  return s;
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function normalizeEmail(email: string) {
  return (email ?? "").trim().toLowerCase();
}

/** Signed, tamper-proof token so a link only ever unsubscribes its own address. */
export function unsubscribeToken(email: string) {
  const e = normalizeEmail(email);
  const sig = b64url(createHmac("sha256", secret()).update(e).digest()).slice(0, 24);
  return `${b64url(Buffer.from(e, "utf-8"))}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [encoded, sig] = (token ?? "").split(".");
  if (!encoded || !sig) return null;
  let email: string;
  try {
    email = Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf-8",
    );
  } catch {
    return null;
  }
  const expected = unsubscribeToken(email).split(".")[1]!;
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return normalizeEmail(email);
}

export function unsubscribeUrl(email: string) {
  return `${publicSiteUrl()}/api/public/unsubscribe?t=${encodeURIComponent(
    unsubscribeToken(email),
  )}`;
}

/** Footer appended to every bulk/marketing email. */
export function unsubscribeFooterHtml(email: string) {
  const url = unsubscribeUrl(email);
  return [
    '<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e5e5;',
    'font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888888">',
    "You are receiving this because you registered for or were invited to one of our events. ",
    `<a href="${url}" style="color:#888888;text-decoration:underline">Unsubscribe</a>`,
    " to stop receiving emails from us.",
    "</div>",
  ].join("");
}
